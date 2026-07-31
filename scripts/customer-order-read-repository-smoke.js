"use strict";

const assert = require("node:assert/strict");
const {
  createCustomerOrderReadRepository,
  resolveCustomerOrderReadRuntime,
} = require("../backend/database/repositories/customerOrderReadRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresDetailAndLists();
  verifyRuntimeValidation();
  console.log("Customer order read repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const calls = [];
  const repository = createCustomerOrderReadRepository({
    env: {},
    sqliteReaders: {
      getOrderDetail: (id) => ({ id }),
      getOrderPaymentContext: (id) => ({ id }),
      listCustomerOrders: (id, query) => ({ id, query }),
      listMerchantStoreOrders: (id, query) => ({ id, query }),
    },
  });
  assert.equal(repository.kind, "sqlite");
  calls.push(await repository.getOrderDetail("order-sqlite"));
  assert.deepEqual(calls[0], { id: "order-sqlite" });
  assert.deepEqual(await repository.listCustomerOrders("customer-001", { scope: "active" }), {
    id: "customer-001",
    query: { scope: "active" },
  });
}

async function verifyPostgresDetailAndLists() {
  const calls = [];
  const database = createFakeDatabase(calls);
  const repository = createCustomerOrderReadRepository({ runtime: "postgres", database });
  const detail = await repository.getOrderDetail("order-001");
  assert.equal(detail.id, "order-001");
  assert.equal(detail.originalAmount, 75);
  assert.equal(detail.items[0].itemName, "珍珠紅茶");
  assert.equal(detail.items[0].customizations[0].label, "珍珠");
  assert.equal(detail.latestLinePayAuthorization.status, "pending");
  assert.equal(detail.latestPaymentCapture, null);
  assert.equal(detail.refundedAmount, 0);
  assert.equal(detail.pendingRevision, null);
  assert.equal(detail.manualRepayment, null);

  const context = await repository.getOrderPaymentContext("order-001");
  assert.deepEqual(context, {
    id: "order-001",
    activityId: "activity-001",
    customerUserId: "customer-001",
    totalCups: 1,
    originalAmount: 75,
    paymentStatus: "pending",
    authorizationStatus: "pending",
  });

  const customerList = await repository.listCustomerOrders("customer-001", {
    scope: "active",
    limit: 20,
    now: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(customerList.orders.length, 1);
  assert.equal(customerList.orders[0].activity.title, "測試團");
  assert.equal(customerList.orders[0].store.name, "測試店");
  assert.deepEqual(customerList.orders[0].availableActions, ["pay"]);
  assert.equal(customerList.orders[0].lifecycleBucket, "active");

  const merchantList = await repository.listMerchantStoreOrders("store-001", {
    scope: "active",
    now: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(merchantList.orders[0].customer.alias, "匿名顧客");
  assert.deepEqual(merchantList.orders[0].availableActions, []);
  assert.ok(calls.some((call) => call.sql.includes("$1::text IS NULL")));
}

function createFakeDatabase(calls) {
  return {
    kind: "postgres",
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("SELECT *") && sql.includes("FROM orders") && !sql.includes("payment_")) {
        return { rows: [orderRow()] };
      }
      if (sql.includes("FROM order_items item")) {
        return { rows: [{
          id: "item-001",
          menu_item_id: "menu-001",
          item_name_snapshot: "珍珠紅茶",
          quantity: 1,
          unit_price_snapshot: 75,
          subtotal: 75,
          customization_id: "customization-001",
          customization_option_id: "option-001",
          option_type: "topping",
          label_snapshot: "珍珠",
          price_delta_snapshot: 5,
          sort_order: 0,
        }] };
      }
      if (sql.includes("FROM payment_authorizations")) {
        return { rows: [authorizationRow()] };
      }
      if (sql.includes("FROM payment_refunds")) return { rows: [] };
      if (sql.includes("FROM payment_captures")) return { rows: [] };
      if (sql.includes("FROM orders") && sql.includes("activity_id")) {
        if (sql.includes("JOIN group_buy_activities")) return { rows: [listRow()] };
        return { rows: [orderRow()] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function orderRow() {
  return {
    id: "order-001",
    activity_id: "activity-001",
    customer_user_id: "customer-001",
    status: "submitted",
    fallback_purchase_preference: "decline_original_price",
    total_cups: 1,
    original_amount: 75,
    final_amount: null,
    payment_status: "pending",
    authorization_status: "pending",
    merchant_acceptance_status: "pending",
    pickup_status: "not_ready",
    submitted_at: new Date("2026-07-31T00:00:00.000Z"),
    updated_at: new Date("2026-07-31T00:00:00.000Z"),
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

function listRow() {
  return {
    id: "order-001",
    submitted_at: new Date("2026-07-31T00:00:00.000Z"),
    activity_id: "activity-001",
    activity_title: "測試團",
    activity_status: "recruiting",
    deadline_at: new Date("2026-08-01T00:00:00.000Z"),
    pickup_start_at: new Date("2026-08-01T01:00:00.000Z"),
    pickup_end_at: new Date("2026-08-01T02:00:00.000Z"),
    withdrawal_lock_minutes: 30,
    store_id: "store-001",
    store_name: "測試店",
    store_address: "測試路 1 號",
    pickup_credential_id: null,
    pickup_credential_status: null,
    pickup_credential_expires_at: null,
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolveCustomerOrderReadRuntime({ env: {} }), "sqlite");
  assert.equal(resolveCustomerOrderReadRuntime({
    env: { CUSTOMER_ORDER_READ_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveCustomerOrderReadRuntime({ runtime: "mysql" }),
    /Unsupported CUSTOMER_ORDER_READ_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
