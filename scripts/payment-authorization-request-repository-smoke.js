"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentAuthorizationRequestRepository,
  resolvePaymentAuthorizationRequestRuntime,
} = require("../backend/database/repositories/paymentAuthorizationRequestRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresTransaction();
  await verifyPostgresRequestLock();
  await verifyPostgresIdempotency();
  verifyRuntimeValidation();
  console.log("Payment authorization request repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expected = { id: "authorization-sqlite" };
  const repository = createPaymentAuthorizationRequestRepository({
    env: {},
    sqliteGateway: {
      getOrderPaymentContext: (id) => ({ id }),
      getLatestAuthorizationForOrder: (id) => ({ orderId: id }),
      getLatestAuthorizationForOrderRevision: (id) => ({ orderRevisionId: id }),
      createPendingAuthorization: () => expected,
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.getOrderPaymentContext("order-001"), { id: "order-001" });
  assert.deepEqual(
    await repository.getLatestAuthorizationForOrderRevision("revision-001"),
    { orderRevisionId: "revision-001" }
  );
  assert.equal(await repository.createPendingAuthorization({}), expected);
}

async function verifyPostgresTransaction() {
  const calls = [];
  const database = createFakeDatabase(calls);
  const repository = createPaymentAuthorizationRequestRepository({
    runtime: "postgres",
    database,
  });
  const context = await repository.getOrderPaymentContext("order-001");
  assert.equal(context.originalAmount, 75);
  assert.equal((await repository.getLatestAuthorizationForOrder("order-001")), null);
  const result = await repository.createPendingAuthorization({
    orderId: "order-001",
    amount: 75,
    providerTransactionId: "transaction-001",
    now: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(database.transactionCount, 1);
  assert.equal(result.orderId, "order-001");
  assert.equal(result.status, "pending");
  assert.equal(result.providerAuthorizationId, "transaction-001");
  assert.ok(calls.some((call) => (
    call.sql.includes("FROM orders")
    && call.sql.includes("FOR UPDATE")
  )));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_authorizations")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_reliability_jobs")));
}

async function verifyPostgresRequestLock() {
  const calls = [];
  const database = createFakeDatabase(calls);
  const repository = createPaymentAuthorizationRequestRepository({
    runtime: "postgres",
    database,
  });
  const result = await repository.withRequestLock(
    "order-001",
    async () => "locked-operation-complete"
  );
  assert.equal(result, "locked-operation-complete");
  const acquireIndex = calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks"));
  const releaseIndex = calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"));
  assert.ok(acquireIndex >= 0);
  assert.ok(releaseIndex > acquireIndex);
}

async function verifyPostgresIdempotency() {
  const calls = [];
  const database = createFakeDatabase(calls, { existing: true });
  const repository = createPaymentAuthorizationRequestRepository({
    runtime: "postgres",
    database,
  });
  const result = await repository.createPendingAuthorization({
    orderId: "order-001",
    amount: 75,
    providerTransactionId: "transaction-001",
  });
  assert.equal(result.id, "authorization-existing");
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO")), false);
}

function createFakeDatabase(calls, options = {}) {
  const database = {
    kind: "postgres",
    transactionCount: 0,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      if (sql.includes("DELETE FROM operation_locks")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM orders")) return { rows: [orderRow()] };
      if (sql.includes("FROM payment_authorizations")) return { rows: [] };
      throw new Error(`Unexpected SQL outside transaction: ${sql}`);
    },
    async transaction(operation) {
      database.transactionCount += 1;
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM orders") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "order-001", original_amount: 75 }] };
    }
    if (
      sql.includes("FROM payment_authorizations")
      && sql.includes("provider_authorization_id")
    ) {
      return { rows: options.existing ? [authorizationRow("authorization-existing")] : [] };
    }
    if (sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    if (sql.includes("WHERE id = $1") && sql.includes("payment_authorizations")) {
      return { rows: [authorizationRow(parameters[0])] };
    }
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return database;
}

function orderRow() {
  return {
    id: "order-001",
    activity_id: "activity-001",
    customer_user_id: "customer-001",
    total_cups: 1,
    original_amount: 75,
    payment_status: "pending",
    authorization_status: "pending",
  };
}

function authorizationRow(id) {
  return {
    id,
    order_id: "order-001",
    provider: "line_pay",
    payment_flow: "authorization",
    status: "pending",
    original_amount: 75,
    authorized_amount: 0,
    provider_authorization_id: "transaction-001",
    expires_at: null,
    authorized_at: null,
    voided_at: null,
    failure_reason: null,
    created_at: new Date("2026-07-31T00:00:00.000Z"),
    updated_at: new Date("2026-07-31T00:00:00.000Z"),
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolvePaymentAuthorizationRequestRuntime({ env: {} }), "sqlite");
  assert.equal(resolvePaymentAuthorizationRequestRuntime({
    env: { PAYMENT_AUTHORIZATION_REQUEST_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolvePaymentAuthorizationRequestRuntime({ runtime: "mysql" }),
    /Unsupported PAYMENT_AUTHORIZATION_REQUEST_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
