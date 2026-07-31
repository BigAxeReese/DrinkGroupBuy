"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentCaptureRepository,
  resolvePaymentCaptureRuntime,
} = require("../backend/database/repositories/paymentCaptureRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresCaptureSuccess();
  await verifyPostgresCaptureFailure();
  await verifyPostgresOperationLock();
  verifyRuntimeValidation();
  console.log("Payment capture repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createPaymentCaptureRepository({
    env: {},
    sqliteGateway: {
      getAuthorizationContext: (value) => value,
      captureAuthorization: (value) => value,
      recordCaptureFailure: (value) => value,
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.captureAuthorization({ orderId: "order-001" }), {
    orderId: "order-001",
  });
}

async function verifyPostgresCaptureSuccess() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.captureAuthorization({
    ...captureInput(),
    providerPayload: { returnCode: "0000" },
  });
  assert.equal(result.status, "captured");
  assert.equal(result.capture.captureAmount, 70);
  assert.equal(result.capture.releasedAmount, 5);
  assertLockOrder(calls);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE orders")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
}

async function verifyPostgresCaptureFailure() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.recordCaptureFailure({
    ...captureInput(),
    retryable: true,
    providerPayload: { returnCode: "9000" },
  });
  assert.equal(result.status, "retry_pending");
  assert.equal(result.attemptCount, 1);
  assert.equal(result.retryable, true);
  assert.ok(result.nextRetryAt);
  assertLockOrder(calls);
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO payment_provider_events")
      && call.parameters.includes("capture_failed")
  )));
}

async function verifyPostgresOperationLock() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.withOperationLock({ orderId: "order-001" }, async () => "captured");
  assert.equal(result, "captured");
  const acquire = calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks"));
  const release = calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"));
  assert.ok(acquire >= 0);
  assert.ok(release > acquire);
}

function createRepository(calls) {
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      if (sql.includes("DELETE FROM operation_locks")) return { rows: [] };
      if (sql.includes("LIMIT 1")) return { rows: [authorizationRow("authorized")] };
      throw new Error(`Unexpected SQL outside transaction: ${sql}`);
    },
    async transaction(operation) {
      return operation({ query });
    },
  };
  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "activity-001" }] };
    }
    if (sql.includes("FOR UPDATE OF payment_auth")) {
      return { rows: [authorizationRow("authorized")] };
    }
    if (sql.includes("FROM payment_captures") && sql.includes("status = 'failed'")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO payment_captures") && sql.includes("RETURNING *")) {
      const failed = sql.includes("'failed'");
      return { rows: [captureRow(failed ? "failed" : "captured")] };
    }
    if (sql.includes("UPDATE payment_authorizations") && sql.includes("RETURNING *")) {
      return { rows: [authorizationRow("captured")] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return createPaymentCaptureRepository({ runtime: "postgres", database });
}

function assertLockOrder(calls) {
  const activityLock = calls.findIndex((call) => (
    call.sql.includes("FROM group_buy_activities") && call.sql.includes("FOR UPDATE")
  ));
  const authorizationLock = calls.findIndex((call) => call.sql.includes("FOR UPDATE OF payment_auth"));
  assert.ok(activityLock >= 0);
  assert.ok(authorizationLock > activityLock);
}

function authorizationRow(status) {
  return {
    id: "authorization-001",
    order_id: "order-001",
    activity_id: "activity-001",
    provider: "line_pay",
    payment_flow: "authorization",
    status,
    original_amount: 75,
    authorized_amount: 75,
    provider_authorization_id: "transaction-001",
    expires_at: null,
    authorized_at: new Date("2026-07-31T00:00:00.000Z"),
    voided_at: null,
    failure_reason: null,
    created_at: new Date("2026-07-31T00:00:00.000Z"),
    updated_at: new Date("2026-07-31T00:00:00.000Z"),
  };
}

function captureRow(status) {
  return {
    id: "capture-001",
    payment_authorization_id: "authorization-001",
    order_id: "order-001",
    status,
    final_amount: 70,
    capture_amount: 70,
    released_amount: status === "captured" ? 5 : 0,
    provider_capture_id: "transaction-001",
    captured_at: status === "captured" ? new Date("2026-07-31T00:01:00.000Z") : null,
    failure_reason: status === "failed" ? "line_pay_capture_failed" : null,
    attempt_number: 1,
    retryable: status === "failed",
    next_retry_at: status === "failed" ? new Date("2026-07-31T00:01:30.000Z") : null,
    created_at: new Date("2026-07-31T00:01:00.000Z"),
    updated_at: new Date("2026-07-31T00:01:00.000Z"),
  };
}

function captureInput() {
  return {
    orderId: "order-001",
    providerTransactionId: "transaction-001",
    amount: 70,
    finalAmount: 70,
    now: "2026-07-31T00:01:00.000Z",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolvePaymentCaptureRuntime({ env: {} }), "sqlite");
  assert.equal(resolvePaymentCaptureRuntime({
    env: { PAYMENT_CAPTURE_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolvePaymentCaptureRuntime({ runtime: "mysql" }),
    /Unsupported PAYMENT_CAPTURE_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
