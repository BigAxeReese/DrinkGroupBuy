const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(
  os.tmpdir(),
  `drink-group-buy-payment-reliability-${process.pid}-${Date.now()}.sqlite`
);
process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;

const schemaPath = path.resolve(__dirname, "../database/schema.sql");
const setupDatabase = new DatabaseSync(databasePath);
setupDatabase.exec(fs.readFileSync(schemaPath, "utf8"));
seedPaymentContext(setupDatabase);
setupDatabase.close();

const {
  acquireOperationLock,
  claimPaymentReliabilityJobs,
  getPaymentReliabilityJob,
  releaseOperationLock,
  reschedulePaymentReliabilityJob
} = require("../backend/db");
const {
  enqueueLinePayReconciliationJob,
  runLinePayReconciliationJobs
} = require("../backend/payments/reliabilityService");
const {
  cancelLinePayAuthorization,
  requestManualLinePayRepayment
} = require("../backend/payments/linePayService");

async function main() {
  const initialNow = "2026-07-30T00:00:00.000Z";
  const retryNow = "2026-07-30T00:00:31.000Z";
  const expiredLockNow = "2026-07-30T00:02:01.000Z";

  const firstJob = enqueueLinePayReconciliationJob({
    authorizationId: "authorization-1",
    orderId: "order-1",
    providerTransactionId: "line-pay-transaction-1",
    paymentFlow: "authorization",
    amount: 120,
    maxAttempts: 3,
    now: initialNow,
    runAfter: initialNow
  });
  const duplicateJob = enqueueLinePayReconciliationJob({
    authorizationId: "authorization-1",
    orderId: "order-1",
    providerTransactionId: "line-pay-transaction-1",
    paymentFlow: "authorization",
    amount: 120,
    maxAttempts: 3,
    now: initialNow,
    runAfter: initialNow
  });
  assert.equal(duplicateJob.id, firstJob.id, "active job must be unique per resource");

  const workerAJobs = claimPaymentReliabilityJobs({
    jobType: "reconcile_line_pay_request",
    workerId: "worker-a",
    limit: 1,
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(workerAJobs.length, 1, "worker A should claim the due job");

  const workerBJobs = claimPaymentReliabilityJobs({
    jobType: "reconcile_line_pay_request",
    workerId: "worker-b",
    limit: 1,
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(workerBJobs.length, 0, "worker B must not claim an active lease");

  const retryJob = reschedulePaymentReliabilityJob({
    jobId: firstJob.id,
    workerId: "worker-a",
    runAfter: retryNow,
    error: { reason: "provider_temporarily_unavailable" },
    now: initialNow
  });
  assert.equal(retryJob.status, "retry_wait");

  const backfilledRetry = enqueueLinePayReconciliationJob({
    authorizationId: "authorization-1",
    orderId: "order-1",
    providerTransactionId: "line-pay-transaction-1",
    paymentFlow: "authorization",
    amount: 120,
    maxAttempts: 3,
    now: initialNow,
    runAfter: initialNow
  });
  assert.equal(
    backfilledRetry.runAfter,
    retryNow,
    "backfill must preserve the retry schedule of an active job"
  );
  const tooEarlyRetry = claimPaymentReliabilityJobs({
    jobType: "reconcile_line_pay_request",
    workerId: "worker-b",
    limit: 1,
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(tooEarlyRetry.length, 0, "retry must not run before run_after");


  const reclaimedJobs = claimPaymentReliabilityJobs({
    jobType: "reconcile_line_pay_request",
    workerId: "worker-b",
    limit: 1,
    leaseMs: 60_000,
    now: retryNow
  });
  assert.equal(reclaimedJobs.length, 1, "a due retry should be claimable");
  const terminalJob = reschedulePaymentReliabilityJob({
    jobId: firstJob.id,
    workerId: "worker-b",
    terminal: true,
    error: { reason: "manual_review_required" },
    now: retryNow
  });
  assert.equal(terminalJob.status, "failed");
  assert.equal(terminalJob.alertRequired, true);

  const lockA = acquireOperationLock({
    lockKey: "line-pay:line-pay-transaction-1",
    ownerId: "lock-owner-a",
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(lockA.acquired, true);
  const lockBBlocked = acquireOperationLock({
    lockKey: "line-pay:line-pay-transaction-1",
    ownerId: "lock-owner-b",
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(lockBBlocked.acquired, false, "second instance must respect the active lease");
  const lockBTakeover = acquireOperationLock({
    lockKey: "line-pay:line-pay-transaction-1",
    ownerId: "lock-owner-b",
    leaseMs: 60_000,
    now: expiredLockNow
  });
  assert.equal(lockBTakeover.acquired, true, "expired lease should be recoverable");
  assert.equal(
    releaseOperationLock({
      lockKey: "line-pay:line-pay-transaction-1",
      ownerId: "lock-owner-a"
    }),
    false,
    "previous owner must not release a replacement lease"
  );
  assert.equal(
    releaseOperationLock({
      lockKey: "line-pay:line-pay-transaction-1",
      ownerId: "lock-owner-b"
    }),
    true
  );
  const lifecycleLockKey = "order:order-1:payment-lifecycle";
  const lifecycleLock = acquireOperationLock({
    lockKey: lifecycleLockKey,
    ownerId: "lifecycle-blocker",
    leaseMs: 60_000,
    now: initialNow
  });
  assert.equal(lifecycleLock.acquired, true);
  await assert.rejects(
    requestManualLinePayRepayment({
      authUser: { id: "user-1", roles: ["customer"] },
      body: { orderId: "order-1" },
      now: initialNow
    }),
    (error) => error.payload?.error === "payment_operation_locked",
    "order lease must block manual repayment creation"
  );
  await assert.rejects(
    cancelLinePayAuthorization({
      orderId: "order-1",
      now: initialNow
    }),
    (error) => error.payload?.error === "payment_operation_locked",
    "order lease must block LINE Pay cancel redirect mutation"
  );
  assert.equal(
    releaseOperationLock({
      lockKey: lifecycleLockKey,
      ownerId: lifecycleLock.ownerId
    }),
    true
  );


  const reconciliation = await runLinePayReconciliationJobs({
    workerId: "reconciliation-worker",
    now: expiredLockNow,
    limit: 1,
    checker: async () => ({
      returnCode: "0121",
      returnMessage: "cancelled or expired"
    })
  });
  assert.equal(reconciliation.claimed, 1);
  assert.equal(reconciliation.results[0].job.status, "succeeded");

  const verificationDatabase = new DatabaseSync(databasePath);
  const authorization = verificationDatabase.prepare(
    "SELECT status, failure_reason FROM payment_authorizations WHERE id = ?"
  ).get("authorization-1");
  const integrity = verificationDatabase.prepare("PRAGMA integrity_check").get();
  const foreignKeyViolations = verificationDatabase.prepare("PRAGMA foreign_key_check").all();
  verificationDatabase.close();

  assert.equal(authorization.status, "failed");
  assert.equal(authorization.failure_reason, "line_pay_request_cancelled_or_expired");
  assert.equal(integrity.integrity_check, "ok");
  assert.equal(foreignKeyViolations.length, 0);
  assert.equal(getPaymentReliabilityJob(firstJob.id).status, "failed");

  console.log("Payment reliability smoke passed");
  console.log("job deduplication: 1 active job per resource");
  console.log("cross-instance claim: active lease blocked, due retry reclaimed");
  console.log("operation lock: active lease blocked, expired lease taken over");
  console.log("order lifecycle lock: repayment_blocked=1, cancel_redirect_blocked=1");
  console.log("provider reconciliation: 0121 persisted as failed authorization");
  console.log("database: integrity_check=ok, foreign_key_check=0");
}

function seedPaymentContext(database) {
  const now = "2026-07-30T00:00:00.000Z";
  database.prepare(`
    INSERT INTO users (id, login_name, display_name, created_at, updated_at)
    VALUES ('user-1', 'reliability-user', 'Reliability User', ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO merchants (id, name, created_at, updated_at)
    VALUES ('merchant-1', 'Reliability Merchant', ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO stores (
      id, merchant_id, name, address, latitude, longitude, created_at, updated_at
    ) VALUES ('store-1', 'merchant-1', 'Reliability Store', 'Test Address', 25.0, 121.5, ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO group_buy_activities (
      id, store_id, created_by_user_id, title, status, start_at, deadline_at,
      pickup_start_at, pickup_end_at, created_at, updated_at
    ) VALUES (
      'activity-1', 'store-1', 'user-1', 'Reliability Activity', 'recruiting',
      ?, ?, ?, ?, ?, ?
    )
  `).run(now, "2026-07-30T01:00:00.000Z", "2026-07-30T02:00:00.000Z",
    "2026-07-30T03:00:00.000Z", now, now);
  database.prepare(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, total_cups, original_amount,
      payment_status, authorization_status, submitted_at, updated_at
    ) VALUES (
      'order-1', 'activity-1', 'user-1', 'submitted', 1, 120,
      'pending', 'pending', ?, ?
    )
  `).run(now, now);
  database.prepare(`
    INSERT INTO payment_authorizations (
      id, order_id, provider, payment_flow, status, original_amount,
      authorized_amount, provider_authorization_id, created_at, updated_at
    ) VALUES (
      'authorization-1', 'order-1', 'line_pay', 'authorization', 'pending',
      120, 0, 'line-pay-transaction-1', ?, ?
    )
  `).run(now, now);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(databasePath, { force: true });
    } catch {
      // The temporary file is best-effort cleanup only.
    }
  });
