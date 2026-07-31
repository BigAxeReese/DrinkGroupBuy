"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentAuthorizationCancelRepository,
  resolvePaymentAuthorizationCancelRuntime,
} = require("../backend/database/repositories/paymentAuthorizationCancelRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPendingCancelTransaction();
  await verifyVoidTransaction();
  await verifyVoidFailureAudit();
  await verifyOperationLock();
  verifyRuntimeValidation();
  console.log("Payment authorization cancel repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createPaymentAuthorizationCancelRepository({
    env: {},
    sqliteGateway: {
      getAuthorizationContext: (value) => value,
      cancelPendingAuthorization: (value) => value,
      voidAuthorization: (value) => value,
      recordVoidFailure: (value) => value,
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.cancelPendingAuthorization({ orderId: "order-001" }), {
    orderId: "order-001",
  });
}

async function verifyPendingCancelTransaction() {
  const calls = [];
  const repository = createRepository(calls, "pending");
  const result = await repository.cancelPendingAuthorization(input());
  assert.equal(result.status, "failed");
  assertLockOrder(calls);
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO payment_provider_events")
      && call.parameters.includes("cancel_redirect")
  )));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE payment_reliability_jobs")));
}

async function verifyVoidTransaction() {
  const calls = [];
  const repository = createRepository(calls, "authorized");
  const result = await repository.voidAuthorization({
    ...input(),
    providerPayload: { returnCode: "0000" },
  });
  assert.equal(result.status, "authorization_voided");
  assertLockOrder(calls);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE orders")));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO payment_provider_events")
      && call.parameters.includes("void_success")
  )));
}

async function verifyVoidFailureAudit() {
  const calls = [];
  const repository = createRepository(calls, "authorized");
  const result = await repository.recordVoidFailure({
    ...input(),
    reason: "provider_void_failed",
  });
  assert.equal(result.status, "authorized");
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO payment_provider_events")
      && call.parameters.includes("void_failed")
  )));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO audit_logs")
      && call.parameters.includes("line_pay_void_authorization_failed")
  )));
}

async function verifyOperationLock() {
  const calls = [];
  const repository = createRepository(calls, "pending");
  const result = await repository.withOperationLock({ orderId: "order-001" }, async () => "done");
  assert.equal(result, "done");
  const acquire = calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks"));
  const release = calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"));
  assert.ok(acquire >= 0);
  assert.ok(release > acquire);
}

function createRepository(calls, stateStatus) {
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      if (sql.includes("DELETE FROM operation_locks")) return { rows: [] };
      if (sql.includes("LIMIT 1")) return { rows: [row(stateStatus)] };
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
    if (sql.includes("FOR UPDATE OF payment_auth")) return { rows: [row(stateStatus)] };
    if (sql.includes("UPDATE payment_authorizations") && sql.includes("RETURNING *")) {
      const status = sql.includes("authorization_voided") ? "authorization_voided" : "failed";
      return { rows: [row(status)] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return createPaymentAuthorizationCancelRepository({ runtime: "postgres", database });
}

function assertLockOrder(calls) {
  const activityLock = calls.findIndex((call) => (
    call.sql.includes("FROM group_buy_activities") && call.sql.includes("FOR UPDATE")
  ));
  const authorizationLock = calls.findIndex((call) => call.sql.includes("FOR UPDATE OF payment_auth"));
  assert.ok(activityLock >= 0);
  assert.ok(authorizationLock > activityLock);
}

function row(status) {
  return {
    id: "authorization-001",
    order_id: "order-001",
    activity_id: "activity-001",
    provider: "line_pay",
    payment_flow: "authorization",
    status,
    original_amount: 75,
    authorized_amount: status === "authorized" ? 75 : 0,
    provider_authorization_id: "transaction-001",
    expires_at: null,
    authorized_at: null,
    voided_at: null,
    failure_reason: null,
    created_at: new Date("2026-07-31T00:00:00.000Z"),
    updated_at: new Date("2026-07-31T00:00:00.000Z"),
  };
}

function input() {
  return {
    orderId: "order-001",
    providerTransactionId: "transaction-001",
    now: "2026-07-31T00:00:00.000Z",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolvePaymentAuthorizationCancelRuntime({ env: {} }), "sqlite");
  assert.equal(resolvePaymentAuthorizationCancelRuntime({
    env: { PAYMENT_AUTHORIZATION_CANCEL_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolvePaymentAuthorizationCancelRuntime({ runtime: "mysql" }),
    /Unsupported PAYMENT_AUTHORIZATION_CANCEL_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
