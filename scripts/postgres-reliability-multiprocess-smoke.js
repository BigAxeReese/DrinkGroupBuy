"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRuntimeDatabaseAdapter } = require("../backend/database");

// PostgreSQL equivalent of payment-reliability:multiprocess (scripts/payment-reliability-
// multiprocess-smoke.js), which only exercises node:sqlite's file-level locking. This proves
// the same operation_locks / payment_reliability_jobs concurrency mechanisms serialize
// correctly against a real PostgreSQL server under genuinely separate OS processes -- not just
// separate in-process client connections (already covered for the settlement-specific lock key
// by group-buy-settlement-postgres-smoke.js's verifyCrossInstanceLock), and not just the SQL
// text correctness already covered by the fake-database repository unit smoke tests.

const workerPath = path.join(__dirname, "helpers", "postgres-reliability-process-worker.js");
const proofId = randomUUID();
const jobId = `job-postgres-multiprocess-${proofId}`;
const resourceId = `authorization-postgres-multiprocess-${proofId}`;
const lockKey = `order:order-postgres-multiprocess-${proofId}:payment-lifecycle`;

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, RELIABILITY_WORKER_INPUT: JSON.stringify(input) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with ${code}: ${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL reliability multiprocess smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    await seedJob(database);
    await verifyJobClaimAcrossProcesses();
    await verifyLockAcrossProcesses();
    console.log("PostgreSQL payment reliability multi-process smoke test passed.");
  } finally {
    await cleanup(database);
    await database.close();
  }
}

async function seedJob(database) {
  const dueAt = new Date(Date.now() - 60_000).toISOString();
  await database.query(`
    INSERT INTO payment_reliability_jobs (
      id, job_type, resource_type, resource_id, status,
      payload_json, attempt_count, max_attempts, run_after, alert_required, created_at, updated_at
    ) VALUES ($1, 'reconcile_line_pay_request', 'payment_authorization', $2,
      'queued', $3::jsonb, 0, 5, $4, false, $4, $4)
  `, [jobId, resourceId, JSON.stringify({ resourceId }), dueAt]);
}

async function verifyJobClaimAcrossProcesses() {
  // All timestamps below are fixed offsets from one base instant, not repeated Date.now()
  // calls -- spawning each worker as a real OS process costs real wall-clock milliseconds, so
  // computing "now + Xs" freshly at each step lets that overhead eat into the margin against a
  // lease boundary. Mirrors payment-reliability-multiprocess-smoke.js's fixed-constant approach.
  const base = Date.now();
  const atOffset = (ms) => new Date(base + ms).toISOString();
  const claimPayload = { jobType: "reconcile_line_pay_request", limit: 10, leaseMs: 120_000 };
  const [claimA, claimB] = await Promise.all([
    runWorker({ action: "claim", payload: { ...claimPayload, workerId: "claim-a", now: atOffset(0) } }),
    runWorker({ action: "claim", payload: { ...claimPayload, workerId: "claim-b", now: atOffset(0) } }),
  ]);
  const ownJobA = claimA.jobs.filter((job) => job.id === jobId);
  const ownJobB = claimB.jobs.filter((job) => job.id === jobId);
  assert.equal(ownJobA.length + ownJobB.length, 1, "Only one process may claim the same job");

  const earlyClaim = await runWorker({
    action: "claim",
    payload: { ...claimPayload, workerId: "claim-c", now: atOffset(1_000) },
  });
  assert.equal(
    earlyClaim.jobs.some((job) => job.id === jobId),
    false,
    "A live lease must block another process"
  );

  const takeoverClaim = await runWorker({
    action: "claim",
    payload: { ...claimPayload, workerId: "claim-d", now: atOffset(121_000) },
  });
  assert.equal(
    takeoverClaim.jobs.some((job) => job.id === jobId),
    true,
    "An expired lease must be recoverable"
  );
}

async function verifyLockAcrossProcesses() {
  const base = Date.now();
  const atOffset = (ms) => new Date(base + ms).toISOString();
  const lockPayload = { lockKey, leaseMs: 120_000 };
  const [lockA, lockB] = await Promise.all([
    runWorker({ action: "acquire-lock", payload: { ...lockPayload, ownerId: "lock-a", now: atOffset(0) } }),
    runWorker({ action: "acquire-lock", payload: { ...lockPayload, ownerId: "lock-b", now: atOffset(0) } }),
  ]);
  assert.equal(
    Number(lockA.lock.acquired) + Number(lockB.lock.acquired),
    1,
    "Only one process may own a lock"
  );
  const winningOwnerId = lockA.lock.acquired ? "lock-a" : "lock-b";

  const earlyLock = await runWorker({
    action: "acquire-lock",
    payload: { ...lockPayload, ownerId: "lock-c", now: atOffset(1_000) },
  });
  assert.equal(earlyLock.lock.acquired, false, "A live lock must block another process");

  const rejectedRelease = await runWorker({
    action: "release-lock",
    payload: { lockKey, ownerId: "lock-c" },
  });
  assert.equal(rejectedRelease.released, false, "A non-owner must not release an active lease");

  const ownedRelease = await runWorker({
    action: "release-lock",
    payload: { lockKey, ownerId: winningOwnerId },
  });
  assert.equal(ownedRelease.released, true, "The owning process must be able to release its own lease");

  const reacquireAfterRelease = await runWorker({
    action: "acquire-lock",
    payload: { ...lockPayload, ownerId: "lock-e", now: atOffset(2_000) },
  });
  assert.equal(reacquireAfterRelease.lock.acquired, true, "A released lock must be immediately reclaimable");

  // lock-e's lease runs from base+2s to base+122s (leaseMs=120_000) -- offset comfortably past
  // that, not past the original base+0s lease which no longer applies after the release above.
  const takeoverLock = await runWorker({
    action: "acquire-lock",
    payload: { ...lockPayload, ownerId: "lock-f", now: atOffset(130_000) },
  });
  assert.equal(takeoverLock.lock.acquired, true, "An expired lock must be recoverable without an explicit release");
}

async function cleanup(database) {
  await database.query("DELETE FROM payment_reliability_jobs WHERE id = $1", [jobId]);
  await database.query("DELETE FROM operation_locks WHERE lock_key = $1", [lockKey]);
  const residue = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM payment_reliability_jobs WHERE id = $1) AS job_count,
      (SELECT COUNT(*)::integer FROM operation_locks WHERE lock_key = $2) AS lock_count
  `, [jobId, lockKey]);
  assert.deepEqual(residue.rows[0], { job_count: 0, lock_count: 0 });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
