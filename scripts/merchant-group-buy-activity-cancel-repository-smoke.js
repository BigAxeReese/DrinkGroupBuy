"use strict";

const assert = require("node:assert/strict");
const {
  createMerchantGroupBuyActivityCancelRepository,
  resolveMerchantActivityCancelRuntime,
} = require("../backend/database/repositories/merchantGroupBuyActivityCancelRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresActivityAndOrderLookups();
  await verifyPostgresCancellation();
  await verifyAuthorizedRequiresVoid();
  await verifyUnrecognizedPaymentStatusRejected();
  await verifyOwnershipMismatchRejected();
  await verifyAlreadyCancelledIsIdempotent();
  await verifyPostgresActivityStatusCancellation();
  await verifyPostgresActivityStatusAlreadyCancelledIsIdempotent();
  verifyRuntimeValidation();
  console.log("Merchant group-buy activity cancel repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createMerchantGroupBuyActivityCancelRepository({
    env: {},
    sqliteGateway: {
      getActivityForCancellation: (activityId) => ({ activityId }),
      listEligibleOrders: (activityId) => [{ activityId }],
      cancelOrder: (value) => value,
      cancelActivityStatus: (activityId) => ({ activityId }),
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(
    await repository.getActivityForCancellation({ activityId: "activity-001" }),
    { activityId: "activity-001" }
  );
  assert.deepEqual(
    await repository.listEligibleOrders({ activityId: "activity-001" }),
    [{ activityId: "activity-001" }]
  );
  assert.deepEqual(
    await repository.cancelActivityStatus({ activityId: "activity-001" }),
    { activityId: "activity-001" }
  );
  assert.equal(typeof repository.withOperationLock, "function");
}

async function verifyPostgresActivityAndOrderLookups() {
  const calls = [];
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("FROM group_buy_activities")) {
        return { rows: [{ id: "activity-001", store_id: "store-001", status: "recruiting" }] };
      }
      if (sql.includes("FROM orders")) {
        return { rows: [{ id: "order-001", payment_status: "pending", payment_provider: null }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const repository = createMerchantGroupBuyActivityCancelRepository({ runtime: "postgres", database });
  const activity = await repository.getActivityForCancellation({ activityId: "activity-001" });
  assert.equal(activity.status, "recruiting");
  const orders = await repository.listEligibleOrders({ activityId: "activity-001" });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].id, "order-001");
}

async function verifyPostgresCancellation() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.cancelOrder(input());
  assert.equal(result.status, "cancelled");
  assert.equal(result.idempotent, false);
  const orderLock = calls.findIndex((call) => (
    call.sql.includes("FROM orders WHERE id") && call.sql.includes("FOR UPDATE")
  ));
  assert.ok(orderLock >= 0);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE orders")));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE payment_authorizations")));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO order_action_idempotency") && call.sql.includes("merchant_cancel_order")
  )));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO audit_logs") && call.sql.includes("merchant_cancel_order")
  )));
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

async function verifyUnrecognizedPaymentStatusRejected() {
  const calls = [];
  const repository = createRepository(calls, { paymentStatus: "refund_pending" });
  const result = await repository.cancelOrder(input());
  assert.deepEqual(result, {
    error: "order_not_cancellable",
    paymentStatus: "refund_pending",
  });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

async function verifyOwnershipMismatchRejected() {
  const calls = [];
  const repository = createRepository(calls, { activityId: "activity-999" });
  const result = await repository.cancelOrder(input());
  assert.deepEqual(result, { error: "order_access_denied" });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

async function verifyAlreadyCancelledIsIdempotent() {
  const calls = [];
  const repository = createRepository(calls, { status: "cancelled" });
  const result = await repository.cancelOrder(input());
  assert.equal(result.status, "cancelled");
  assert.equal(result.idempotent, true);
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders SET status = 'cancelled'")), false);
}

async function verifyPostgresActivityStatusCancellation() {
  const calls = [];
  const repository = createActivityStatusRepository(calls, { status: "recruiting" });
  const result = await repository.cancelActivityStatus({
    activityId: "activity-001",
    reason: "merchant requested",
    actorUserId: "user-001",
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.idempotent, false);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE group_buy_activities")));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO status_history") && call.sql.includes("'activity'")
  )));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO audit_logs") && call.parameters.includes("merchant_cancel_group_buy_activity")
  )));
}

async function verifyPostgresActivityStatusAlreadyCancelledIsIdempotent() {
  const calls = [];
  const repository = createActivityStatusRepository(calls, { status: "cancelled" });
  const result = await repository.cancelActivityStatus({ activityId: "activity-001" });
  assert.equal(result.status, "cancelled");
  assert.equal(result.idempotent, true);
  assert.equal(calls.some((call) => call.sql.includes("UPDATE group_buy_activities")), false);
}

function createActivityStatusRepository(calls, options = {}) {
  const status = options.status || "recruiting";
  const database = {
    async transaction(operation) {
      return operation({ query });
    },
  };
  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "activity-001", status }] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return createMerchantGroupBuyActivityCancelRepository({ runtime: "postgres", database });
}

function createRepository(calls, options = {}) {
  const activityId = options.activityId || "activity-001";
  const status = options.status || "submitted";
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("SELECT activity_id FROM orders")) {
        return { rows: [{ activity_id: activityId }] };
      }
      throw new Error(`Unexpected SQL outside transaction: ${sql}`);
    },
    async transaction(operation) {
      return operation({ query });
    },
  };
  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM order_action_idempotency")) return { rows: [] };
    if (sql.includes("FROM orders WHERE id") && sql.includes("FOR UPDATE")) {
      return { rows: [orderRow(status, options.paymentStatus)] };
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
  return createMerchantGroupBuyActivityCancelRepository({ runtime: "postgres", database });
}

function orderRow(status = "submitted", paymentStatus = "pending") {
  return {
    id: "order-001",
    activity_id: "activity-001",
    status,
    payment_status: paymentStatus,
  };
}

function input() {
  return {
    activityId: "activity-001",
    orderId: "order-001",
    actorUserId: "user-merchant-001",
    idempotencyKey: "merchant-cancel-activity-activity-001-order-order-001",
    reason: "food_shortage",
    now: "2026-07-31T00:00:00.000Z",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolveMerchantActivityCancelRuntime({ env: {} }), "sqlite");
  assert.equal(resolveMerchantActivityCancelRuntime({
    env: { MERCHANT_ACTIVITY_CANCEL_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveMerchantActivityCancelRuntime({ runtime: "mysql" }),
    /Unsupported MERCHANT_ACTIVITY_CANCEL_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
