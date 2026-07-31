"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentAuthorizationConfirmRepository,
  resolvePaymentAuthorizationConfirmRuntime,
} = require("../backend/database/repositories/paymentAuthorizationConfirmRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresSuccessTransaction();
  await verifyPostgresCapacityRejection();
  await verifyPostgresConfirmLock();
  verifyRuntimeValidation();
  console.log("Payment authorization confirm repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createPaymentAuthorizationConfirmRepository({
    env: {},
    sqliteGateway: {
      getAuthorizationContext: (input) => ({ input }),
      confirmAuthorization: (input) => ({ input }),
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.getAuthorizationContext({ orderId: "order-001" }), {
    input: { orderId: "order-001" },
  });
}

async function verifyPostgresSuccessTransaction() {
  const calls = [];
  const database = createFakeDatabase(calls);
  const repository = createPaymentAuthorizationConfirmRepository({
    runtime: "postgres",
    database,
    env: { LINE_PAY_CAPTURE_SEPARATED: "false" },
  });
  const result = await repository.confirmAuthorization(validConfirmation());
  assert.equal(result.status, "authorized");
  assert.equal(result.authorizedAmount, 75);
  const activityLock = calls.findIndex((call) => (
    call.sql.includes("FROM group_buy_activities") && call.sql.includes("FOR UPDATE")
  ));
  const orderLock = calls.findIndex((call) => call.sql.includes("FOR UPDATE OF payment_auth"));
  assert.ok(activityLock >= 0);
  assert.ok(orderLock > activityLock);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE orders")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_provider_events")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE payment_reliability_jobs")));
}

async function verifyPostgresCapacityRejection() {
  const calls = [];
  const repository = createPaymentAuthorizationConfirmRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls, { authorizedCups: 2 }),
    env: { LINE_PAY_CAPTURE_SEPARATED: "false" },
  });
  const result = await repository.confirmAuthorization(validConfirmation());
  assert.equal(result.error, "capacity_exceeded");
  assert.equal(result.maximumCups, 2);
  assert.equal(result.authorizedCups, 2);
  assert.equal(result.requestedCups, 1);
  assert.equal(result.authorization.status, "failed");
  assert.equal(calls.some((call) => (
    call.sql.includes("UPDATE orders") && call.sql.includes("payment_status = 'authorized'")
  )), false);
}

async function verifyPostgresConfirmLock() {
  const calls = [];
  const repository = createPaymentAuthorizationConfirmRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const result = await repository.withConfirmLock(
    { transactionId: "transaction-001" },
    async () => "confirmed"
  );
  assert.equal(result, "confirmed");
  const acquire = calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks"));
  const release = calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"));
  assert.ok(acquire >= 0);
  assert.ok(release > acquire);
}

function createFakeDatabase(calls, options = {}) {
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      if (sql.includes("DELETE FROM operation_locks")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM payment_authorizations payment_auth") && sql.includes("LIMIT 1")) {
        return { rows: [contextRow()] };
      }
      throw new Error(`Unexpected SQL outside transaction: ${sql}`);
    },
    async transaction(operation) {
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "activity-001",
        deadline_at: new Date("2099-01-01T00:00:00.000Z"),
        maximum_cups: 2,
      }] };
    }
    if (sql.includes("FOR UPDATE OF payment_auth")) return { rows: [stateRow()] };
    if (sql.includes("AS authorized_cups")) {
      return { rows: [{ authorized_cups: options.authorizedCups || 0 }] };
    }
    if (sql.includes("UPDATE payment_authorizations") && sql.includes("RETURNING *")) {
      return { rows: [{
        ...stateRow(),
        status: options.authorizedCups ? "failed" : "authorized",
        authorized_amount: options.authorizedCups ? 0 : 75,
        failure_reason: options.authorizedCups ? "capacity_exceeded_at_confirm" : null,
      }] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return database;
}

function contextRow() {
  return {
    ...authorizationRow(),
    activity_id: "activity-001",
    order_original_amount: 75,
  };
}

function stateRow() {
  return {
    ...authorizationRow(),
    activity_id: "activity-001",
    total_cups: 1,
    order_original_amount: 75,
    order_payment_status: "pending",
  };
}

function authorizationRow() {
  return {
    id: "authorization-001",
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

function validConfirmation() {
  return {
    orderId: "order-001",
    providerTransactionId: "transaction-001",
    amount: 75,
    providerPayload: { returnCode: "0000" },
    now: "2026-07-31T00:00:00.000Z",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolvePaymentAuthorizationConfirmRuntime({ env: {} }), "sqlite");
  assert.equal(resolvePaymentAuthorizationConfirmRuntime({
    env: { PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolvePaymentAuthorizationConfirmRuntime({ runtime: "mysql" }),
    /Unsupported PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
