"use strict";

const assert = require("node:assert/strict");
const {
  createCustomerOrderCancelRepository,
  resolveCustomerOrderCancelRuntime,
} = require("../backend/database/repositories/customerOrderCancelRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresCancellation();
  await verifyAuthorizedRequiresVoid();
  await verifyDeadlineRejection();
  verifyRuntimeValidation();
  console.log("Customer order cancel repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createCustomerOrderCancelRepository({
    env: {},
    sqliteGateway: {
      getEligibility: (value) => value,
      cancelOrder: (value) => value,
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.getEligibility({ orderId: "order-001" }), {
    orderId: "order-001",
  });
}

async function verifyPostgresCancellation() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.cancelOrder(input());
  assert.equal(result.status, "cancelled");
  assert.equal(result.idempotent, false);
  const activityLock = calls.findIndex((call) => (
    call.sql.includes("FROM group_buy_activities") && call.sql.includes("FOR UPDATE")
  ));
  const orderLock = calls.findIndex((call) => (
    call.sql.includes("FROM orders order_record") && call.sql.includes("FOR UPDATE")
  ));
  assert.ok(activityLock >= 0);
  assert.ok(orderLock > activityLock);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE orders")));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE payment_authorizations")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO order_action_idempotency")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
}

async function verifyAuthorizedRequiresVoid() {
  const calls = [];
  const repository = createRepository(calls, { paymentStatus: "authorized" });
  const result = await repository.cancelOrder(input());
  assert.deepEqual(result, {
    error: "authorization_void_required",
    paymentStatus: "authorized",
  });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

async function verifyDeadlineRejection() {
  const calls = [];
  const repository = createRepository(calls, { deadlineAt: "2026-07-31T00:15:00.000Z" });
  const result = await repository.cancelOrder(input());
  assert.equal(result.error, "order_locked_by_deadline");
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

function createRepository(calls, options = {}) {
  const deadlineAt = options.deadlineAt || "2026-07-31T03:00:00.000Z";
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("SELECT activity_id FROM orders")) {
        return { rows: [{ activity_id: "activity-001" }] };
      }
      if (sql.includes("JOIN group_buy_activities")) {
        return { rows: [orderRow(deadlineAt, options.paymentStatus)] };
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
        deadline_at: new Date(deadlineAt),
        withdrawal_lock_minutes: 30,
      }] };
    }
    if (sql.includes("FROM order_action_idempotency")) return { rows: [] };
    if (sql.includes("FROM orders order_record") && sql.includes("FOR UPDATE")) {
      return { rows: [orderRow(deadlineAt, options.paymentStatus)] };
    }
    if (sql.includes("FROM payment_authorizations") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "authorization-001", status: "pending" }] };
    }
    if (sql.includes("UPDATE orders") && sql.includes("RETURNING id")) {
      return { rows: [{ id: "order-001" }] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return createCustomerOrderCancelRepository({ runtime: "postgres", database });
}

function orderRow(deadlineAt, paymentStatus = "pending") {
  return {
    id: "order-001",
    activity_id: "activity-001",
    customer_user_id: "user-customer-001",
    status: "submitted",
    payment_status: paymentStatus,
    deadline_at: new Date(deadlineAt),
    withdrawal_lock_minutes: 30,
  };
}

function input() {
  return {
    orderId: "order-001",
    customerUserId: "user-customer-001",
    idempotencyKey: "cancel-order-001",
    reason: "customer_withdrawal",
    now: "2026-07-31T00:00:00.000Z",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolveCustomerOrderCancelRuntime({ env: {} }), "sqlite");
  assert.equal(resolveCustomerOrderCancelRuntime({
    env: { CUSTOMER_ORDER_CANCEL_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveCustomerOrderCancelRuntime({ runtime: "mysql" }),
    /Unsupported CUSTOMER_ORDER_CANCEL_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
