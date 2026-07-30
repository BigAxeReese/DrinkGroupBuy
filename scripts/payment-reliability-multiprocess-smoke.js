"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const projectRoot = path.join(__dirname, "..");
const workerPath = path.join(__dirname, "helpers", "reliability-process-worker.js");
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-reliability-multiprocess-"));
const databasePath = path.join(tempDirectory, "multiprocess.sqlite");
process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;

function runWorker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: projectRoot,
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
  const setupDatabase = new DatabaseSync(databasePath);
  setupDatabase.exec(fs.readFileSync(path.join(projectRoot, "database", "schema.sql"), "utf8"));
  setupDatabase.close();

  const { enqueuePaymentReliabilityJob } = require("../backend/db");
  const dueAt = "2026-07-30T08:00:00.000Z";
  enqueuePaymentReliabilityJob({
    jobType: "reconcile_line_pay_request",
    resourceType: "payment_authorization",
    resourceId: "multiprocess-payment",
    runAfter: dueAt,
    payload: { paymentId: "multiprocess-payment" },
    now: dueAt,
  });

  const claimPayload = { jobType: "reconcile_line_pay_request", limit: 1, leaseMs: 120000, now: dueAt };
  const [claimA, claimB] = await Promise.all([
    runWorker({ action: "claim", payload: { ...claimPayload, workerId: "claim-a" } }),
    runWorker({ action: "claim", payload: { ...claimPayload, workerId: "claim-b" } }),
  ]);
  assert.equal(claimA.jobs.length + claimB.jobs.length, 1, "Only one process may claim the same job");

  const earlyClaim = await runWorker({
    action: "claim",
    payload: { ...claimPayload, workerId: "claim-c", now: "2026-07-30T08:01:59.000Z" },
  });
  assert.equal(earlyClaim.jobs.length, 0, "A live lease must block another process");

  const takeoverClaim = await runWorker({
    action: "claim",
    payload: { ...claimPayload, workerId: "claim-d", now: "2026-07-30T08:02:01.000Z" },
  });
  assert.equal(takeoverClaim.jobs.length, 1, "An expired lease must be recoverable");

  const lockPayload = { lockKey: "order:multiprocess-order:payment-lifecycle", leaseMs: 120000, now: dueAt };
  const [lockA, lockB] = await Promise.all([
    runWorker({ action: "lock", payload: { ...lockPayload, ownerId: "lock-a" } }),
    runWorker({ action: "lock", payload: { ...lockPayload, ownerId: "lock-b" } }),
  ]);
  assert.equal(Number(lockA.lock.acquired) + Number(lockB.lock.acquired), 1, "Only one process may own a lock");

  const earlyLock = await runWorker({
    action: "lock",
    payload: { ...lockPayload, ownerId: "lock-c", now: "2026-07-30T08:01:59.000Z" },
  });
  assert.equal(earlyLock.lock.acquired, false, "A live lock must block another process");

  const takeoverLock = await runWorker({
    action: "lock",
    payload: { ...lockPayload, ownerId: "lock-d", now: "2026-07-30T08:02:01.000Z" },
  });
  assert.equal(takeoverLock.lock.acquired, true, "An expired lock must be recoverable");

  const verificationDatabase = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(verificationDatabase.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(verificationDatabase.prepare("PRAGMA foreign_key_check").all(), []);
  verificationDatabase.close();
  console.log("Payment reliability multi-process smoke test passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tempDirectory, { recursive: true, force: true }));
