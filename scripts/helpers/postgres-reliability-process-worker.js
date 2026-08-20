"use strict";

const { createRuntimeDatabaseAdapter } = require("../../backend/database");
const {
  createPaymentReliabilityJobRepository,
} = require("../../backend/database/repositories/paymentReliabilityJobRepository");

// Acquire/release are written here as standalone primitives, mirroring the SQL in
// withPostgresPaymentOperationLock (backend/database/repositories/paymentAuthorizationCancelRepository.js)
// exactly, rather than calling that function directly -- it only exposes a "run this callback
// while holding the lock" shape with an internally-generated ownerId, which can't be held open
// across two separate OS process invocations the way this multiprocess test needs (one process
// acquires and exits, a second process later attempts release with an explicit, caller-known
// ownerId to prove ownership is enforced).
async function acquireOperationLock(database, { lockKey, ownerId, leaseMs, now }) {
  const lockedUntil = new Date(Date.parse(now) + Number(leaseMs)).toISOString();
  const result = await database.query(`
    INSERT INTO operation_locks (lock_key, owner_id, locked_until, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (lock_key) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        locked_until = EXCLUDED.locked_until,
        updated_at = EXCLUDED.updated_at
    WHERE operation_locks.locked_until <= $4
    RETURNING lock_key, owner_id, locked_until
  `, [lockKey, ownerId, lockedUntil, now]);
  const row = result.rows[0];
  return { acquired: Boolean(row), lockedUntil: row ? row.locked_until : null };
}

async function releaseOperationLock(database, { lockKey, ownerId }) {
  const result = await database.query(`
    DELETE FROM operation_locks
    WHERE lock_key = $1 AND owner_id = $2
    RETURNING lock_key
  `, [lockKey, ownerId]);
  return { released: result.rows.length > 0 };
}

async function main() {
  const input = JSON.parse(process.env.RELIABILITY_WORKER_INPUT || "{}");
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    if (input.action === "claim") {
      const repository = createPaymentReliabilityJobRepository({ runtime: "postgres", database });
      const jobs = await repository.claimJobs(input.payload);
      process.stdout.write(JSON.stringify({ action: input.action, jobs }));
    } else if (input.action === "acquire-lock") {
      const lock = await acquireOperationLock(database, input.payload);
      process.stdout.write(JSON.stringify({ action: input.action, lock }));
    } else if (input.action === "release-lock") {
      const result = await releaseOperationLock(database, input.payload);
      process.stdout.write(JSON.stringify({ action: input.action, ...result }));
    } else {
      throw new Error(`Unsupported postgres reliability worker action: ${input.action}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  process.stderr.write(error.stack || String(error));
  process.exitCode = 1;
});
