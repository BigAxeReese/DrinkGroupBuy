"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentReliabilityJobRepository,
  resolvePaymentReliabilityJobRuntime,
} = require("../backend/database/repositories/paymentReliabilityJobRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresEnqueueClaimCompleteReschedule();
  await verifyPostgresListPendingLinePayAuthorizations();
  await verifyPostgresListAlerts();
  verifyRuntimeValidation();
  console.log("Payment reliability job repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const received = {};
  const repository = createPaymentReliabilityJobRepository({
    env: {},
    sqliteGateway: {
      enqueueJob: (v) => { received.enqueue = v; return { id: "job-1" }; },
      claimJobs: (v) => { received.claim = v; return [{ id: "job-1" }]; },
      completeJob: (v) => { received.complete = v; return { id: "job-1", status: "succeeded" }; },
      rescheduleJob: (v) => { received.reschedule = v; return { id: "job-1", status: "retry_wait" }; },
      listPendingLinePayAuthorizations: (v) => { received.listPending = v; return []; },
      listAlerts: (v) => { received.listAlerts = v; return []; },
    },
  });

  assert.equal(repository.kind, "sqlite");
  await repository.enqueueJob({ jobType: "reconcile_line_pay_request" });
  await repository.claimJobs({ jobType: "reconcile_line_pay_request", workerId: "w1" });
  await repository.completeJob({ jobId: "job-1", workerId: "w1" });
  await repository.rescheduleJob({ jobId: "job-1", workerId: "w1" });
  await repository.listPendingLinePayAuthorizations({ limit: 10 });
  await repository.listAlerts({});
  assert.ok(received.enqueue && received.claim && received.complete && received.reschedule);
  assert.ok(received.listPending !== undefined && received.listAlerts !== undefined);
  await repository.close();
}

async function verifyPostgresEnqueueClaimCompleteReschedule() {
  const calls = [];
  const database = createFakeJobDatabase(calls);
  const repository = createPaymentReliabilityJobRepository({ runtime: "postgres", database });

  const enqueued = await repository.enqueueJob({
    jobType: "reconcile_line_pay_request",
    resourceType: "payment_authorization",
    resourceId: "pay-auth-001",
    payload: { orderId: "order-001" },
    maxAttempts: 40,
    runAfter: "2026-06-25T10:16:30.000Z",
    now: "2026-06-25T10:16:00.000Z",
  });
  assert.equal(enqueued.jobType, "reconcile_line_pay_request");

  const claimed = await repository.claimJobs({
    jobType: "reconcile_line_pay_request",
    workerId: "worker-1",
    limit: 10,
    now: "2026-06-25T10:16:30.000Z",
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, "job-001");

  const completed = await repository.completeJob({
    jobId: "job-001",
    workerId: "worker-1",
    now: "2026-06-25T10:17:00.000Z",
  });
  assert.equal(completed.status, "succeeded");

  const rescheduled = await repository.rescheduleJob({
    jobId: "job-001",
    workerId: "worker-1",
    runAfter: "2026-06-25T10:20:00.000Z",
    error: { message: "provider timeout" },
    now: "2026-06-25T10:17:00.000Z",
  });
  assert.equal(rescheduled.status, "retry_wait");

  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO payment_reliability_jobs")));
  assert.ok(calls.some((c) => c.sql.includes("FOR UPDATE SKIP LOCKED")));
}

async function verifyPostgresListPendingLinePayAuthorizations() {
  const calls = [];
  const database = {
    kind: "postgres",
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      return { rows: [{
        id: "pay-auth-001",
        order_id: "order-001",
        order_revision_id: null,
        provider_authorization_id: "linepay-txn-001",
        payment_flow: "authorization",
        original_amount: 280,
        created_at: new Date("2026-06-25T10:15:00.000Z"),
      }] };
    },
  };
  const repository = createPaymentReliabilityJobRepository({ runtime: "postgres", database });
  const rows = await repository.listPendingLinePayAuthorizations({ limit: 100 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].providerTransactionId, "linepay-txn-001");
  assert.equal(rows[0].createdAt, "2026-06-25T10:15:00.000Z");
  assert.match(calls[0].sql, /provider = 'line_pay'/);
  assert.match(calls[0].sql, /status = 'pending'/);
}

async function verifyPostgresListAlerts() {
  const calls = [];
  const database = {
    kind: "postgres",
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      return { rows: [{
        id: "job-001",
        job_type: "reconcile_line_pay_request",
        resource_type: "payment_authorization",
        resource_id: "pay-auth-001",
        status: "failed",
        payload_json: "{}",
        attempt_count: 40,
        max_attempts: 40,
        run_after: new Date("2026-06-25T10:20:00.000Z"),
        locked_by: null,
        locked_until: null,
        last_error_json: "{\"message\":\"provider timeout\"}",
        alert_required: true,
        created_at: new Date("2026-06-25T10:16:00.000Z"),
        updated_at: new Date("2026-06-25T10:20:00.000Z"),
        completed_at: new Date("2026-06-25T10:20:00.000Z"),
      }] };
    },
  };
  const repository = createPaymentReliabilityJobRepository({ runtime: "postgres", database });
  const alerts = await repository.listAlerts({ jobType: "reconcile_line_pay_request" });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alertRequired, true);
  assert.match(calls[0].sql, /alert_required = true/);
}

function verifyRuntimeValidation() {
  assert.equal(resolvePaymentReliabilityJobRuntime({ env: {} }), "sqlite");
  assert.equal(
    resolvePaymentReliabilityJobRuntime({ env: { PAYMENT_RELIABILITY_JOB_RUNTIME: "POSTGRESQL" } }),
    "postgres"
  );
  assert.throws(
    () => resolvePaymentReliabilityJobRuntime({ runtime: "mysql" }),
    /Unsupported PAYMENT_RELIABILITY_JOB_RUNTIME/
  );
  assert.throws(
    () => createPaymentReliabilityJobRepository({ env: {} }),
    /enqueueJob is required/
  );
  assert.throws(
    () => createPaymentReliabilityJobRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakeJobDatabase(calls) {
  const database = {
    kind: "postgres",
    async transaction(operation) {
      return operation({ query });
    },
    async query(sql, parameters = []) {
      return query(sql, parameters);
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("INSERT INTO payment_reliability_jobs")) {
      return { rows: [{
        id: "job-001",
        job_type: "reconcile_line_pay_request",
        resource_type: "payment_authorization",
        resource_id: "pay-auth-001",
        status: "queued",
        payload_json: "{}",
        attempt_count: 0,
        max_attempts: 40,
        run_after: new Date("2026-06-25T10:16:30.000Z"),
        locked_by: null,
        locked_until: null,
        last_error_json: null,
        alert_required: false,
        created_at: new Date("2026-06-25T10:16:00.000Z"),
        updated_at: new Date("2026-06-25T10:16:00.000Z"),
        completed_at: null,
      }] };
    }
    if (sql.includes("SET status = 'failed', locked_by = NULL")) {
      return { rows: [] };
    }
    if (sql.includes("FOR UPDATE SKIP LOCKED")) {
      return { rows: [{
        id: "job-001",
        job_type: "reconcile_line_pay_request",
        resource_type: "payment_authorization",
        resource_id: "pay-auth-001",
        status: "running",
        payload_json: "{}",
        attempt_count: 1,
        max_attempts: 40,
        run_after: new Date("2026-06-25T10:16:30.000Z"),
        locked_by: "worker-1",
        locked_until: new Date("2026-06-25T10:18:30.000Z"),
        last_error_json: null,
        alert_required: false,
        created_at: new Date("2026-06-25T10:16:00.000Z"),
        updated_at: new Date("2026-06-25T10:16:30.000Z"),
        completed_at: null,
      }] };
    }
    if (sql.includes("SET status = 'succeeded'")) {
      return { rows: [{
        id: "job-001",
        job_type: "reconcile_line_pay_request",
        resource_type: "payment_authorization",
        resource_id: "pay-auth-001",
        status: "succeeded",
        payload_json: "{}",
        attempt_count: 1,
        max_attempts: 40,
        run_after: new Date("2026-06-25T10:16:30.000Z"),
        locked_by: null,
        locked_until: null,
        last_error_json: null,
        alert_required: false,
        created_at: new Date("2026-06-25T10:16:00.000Z"),
        updated_at: new Date("2026-06-25T10:17:00.000Z"),
        completed_at: new Date("2026-06-25T10:17:00.000Z"),
      }] };
    }
    if (sql.includes("SELECT * FROM payment_reliability_jobs") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "job-001",
        attempt_count: 1,
        max_attempts: 40,
      }] };
    }
    if (sql.includes("SET status = $1, run_after = $2")) {
      return { rows: [{
        id: "job-001",
        job_type: "reconcile_line_pay_request",
        resource_type: "payment_authorization",
        resource_id: "pay-auth-001",
        status: "retry_wait",
        payload_json: "{}",
        attempt_count: 1,
        max_attempts: 40,
        run_after: new Date("2026-06-25T10:20:00.000Z"),
        locked_by: null,
        locked_until: null,
        last_error_json: "{\"message\":\"provider timeout\"}",
        alert_required: false,
        created_at: new Date("2026-06-25T10:16:00.000Z"),
        updated_at: new Date("2026-06-25T10:17:00.000Z"),
        completed_at: null,
      }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return database;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
