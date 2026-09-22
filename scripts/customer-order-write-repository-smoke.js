"use strict";

const assert = require("node:assert/strict");
const {
  createCustomerOrderWriteRepository,
  resolveCustomerOrderWriteRuntime,
} = require("../backend/database/repositories/customerOrderWriteRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresTransactionContract();
  await verifyPostgresDuplicateBoundary();
  await verifyPostgresPriceBoundary();
  await verifyPostgresCapacityBoundary();
  await verifyPostgresDeadlineBoundary();
  await verifyPostgresUpdateTransactionContract();
  await verifyPostgresUpdateNotEditableBoundary();
  await verifyPostgresUpdateAccessDeniedBoundary();
  await verifyPostgresUpdateCapacityBoundary();
  verifyRuntimeValidation();
  console.log("Customer order write repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expectedCreate = { order: { id: "order-sqlite" } };
  const expectedUpdate = { order: { id: "order-sqlite", totalCups: 2 } };
  let receivedCreate;
  let receivedUpdate;
  const repository = createCustomerOrderWriteRepository({
    env: {},
    sqliteWriter(input) {
      receivedCreate = input;
      return expectedCreate;
    },
    sqliteUpdater(input) {
      receivedUpdate = input;
      return expectedUpdate;
    },
  });
  const createInput = { activityId: "activity-001" };
  const updateInput = { orderId: "order-sqlite" };
  assert.equal(repository.kind, "sqlite");
  assert.equal(await repository.createOrder(createInput), expectedCreate);
  assert.equal(receivedCreate, createInput);
  assert.equal(await repository.updateOrder(updateInput), expectedUpdate);
  assert.equal(receivedUpdate, updateInput);
  await repository.close();
}

async function verifyPostgresTransactionContract() {
  const calls = [];
  const database = createFakePostgresDatabase(calls);
  const repository = createCustomerOrderWriteRepository({ runtime: "postgres", database });
  const result = await repository.createOrder(validInput());

  assert.equal(database.transactionCount, 1);
  assert.equal(result.order.activityId, "activity-001");
  assert.equal(result.order.customerUserId, "customer-001");
  assert.equal(result.order.status, "submitted");
  assert.equal(result.order.totalCups, 1);
  assert.equal(result.order.originalAmount, 70);
  assert.equal(result.order.paymentStatus, "pending");
  assert.equal(result.order.items[0].unitPrice, 70);

  const activityLockIndex = calls.findIndex((call) => (
    call.sql.includes("FROM group_buy_activities") && call.sql.includes("FOR UPDATE")
  ));
  const menuLockIndex = calls.findIndex((call) => (
    call.sql.includes("FROM menu_items") && call.sql.includes("FOR SHARE")
  ));
  assert.ok(activityLockIndex >= 0);
  assert.ok(menuLockIndex > activityLockIndex);
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO orders")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO order_items")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
}

async function verifyPostgresDuplicateBoundary() {
  const calls = [];
  const repository = createCustomerOrderWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { existingOrderId: "order-existing" }),
  });
  assert.deepEqual(await repository.createOrder(validInput()), {
    error: "order_already_exists",
    orderId: "order-existing",
  });
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO")), false);
}

async function verifyPostgresPriceBoundary() {
  const calls = [];
  const repository = createCustomerOrderWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls),
  });
  const input = validInput();
  input.items[0].unitPrice = 60;
  input.items[0].subtotal = 60;
  const result = await repository.createOrder(input);
  assert.equal(result.error, "order_price_changed");
  assert.equal(result.originalAmount, 70);
  assert.equal(result.items[0].unitPrice, 70);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO orders")), false);
}

async function verifyPostgresCapacityBoundary() {
  const calls = [];
  const repository = createCustomerOrderWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { authorizedCups: 2 }),
  });
  assert.deepEqual(await repository.createOrder(validInput()), {
    error: "capacity_exceeded",
    maximumCups: 2,
    authorizedCups: 2,
    requestedCups: 1,
  });
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO orders")), false);
}

async function verifyPostgresDeadlineBoundary() {
  const calls = [];
  const repository = createCustomerOrderWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { deadlinePassed: true }),
  });
  assert.deepEqual(await repository.createOrder(validInput()), {
    error: "activity_not_joinable",
    status: "recruiting",
    reason: "deadline_passed",
  });
  assert.equal(calls.some((call) => call.sql.includes("FROM menu_items")), false);
}

async function verifyPostgresUpdateTransactionContract() {
  const calls = [];
  const database = createFakePostgresUpdateDatabase(calls, { pendingAuthorizationId: "pay-auth-001" });
  const repository = createCustomerOrderWriteRepository({ runtime: "postgres", database });
  const result = await repository.updateOrder(validUpdateInput());

  assert.equal(database.transactionCount, 1);
  assert.equal(result.order.id, "order-001");
  assert.equal(result.order.totalCups, 1);
  assert.equal(result.order.originalAmount, 70);
  assert.equal(result.order.paymentStatus, "pending");
  assert.equal(result.order.finalAmount, null);
  assert.equal(result.order.items[0].unitPrice, 70);
  assert.deepEqual(result.failedAuthorizations, [
    { id: "pay-auth-001", providerAuthorizationId: "linepay-txn-001" },
  ]);

  assert.ok(calls.some((call) => (
    call.sql.includes("UPDATE payment_authorizations") && call.sql.includes("'failed'")
  )));
  assert.ok(calls.some((call) => call.sql.includes("DELETE FROM order_item_customizations")));
  assert.ok(calls.some((call) => call.sql.includes("DELETE FROM order_items")));
  assert.ok(calls.some((call) => (
    call.sql.includes("UPDATE orders") && call.sql.includes("final_amount = NULL")
  )));
  assert.ok(calls.some((call) => (
    call.sql.includes("INSERT INTO status_history") && call.sql.includes("customer_update_pending_order")
  )));
  const orderLockIndex = calls.findIndex((call) => (
    call.sql.includes("FROM orders") && call.sql.includes("FOR UPDATE") && !call.sql.includes("UPDATE orders")
  ));
  assert.ok(orderLockIndex === 0);
}

async function verifyPostgresUpdateNotEditableBoundary() {
  const calls = [];
  const database = createFakePostgresUpdateDatabase(calls, { paymentStatus: "authorized" });
  const repository = createCustomerOrderWriteRepository({ runtime: "postgres", database });
  const result = await repository.updateOrder(validUpdateInput());
  assert.deepEqual(result, {
    error: "order_not_editable",
    status: "submitted",
    paymentStatus: "authorized",
  });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

async function verifyPostgresUpdateAccessDeniedBoundary() {
  const calls = [];
  const database = createFakePostgresUpdateDatabase(calls);
  const repository = createCustomerOrderWriteRepository({ runtime: "postgres", database });
  const input = validUpdateInput();
  input.customerUserId = "someone-else";
  const result = await repository.updateOrder(input);
  assert.deepEqual(result, { error: "order_access_denied" });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

async function verifyPostgresUpdateCapacityBoundary() {
  const calls = [];
  const database = createFakePostgresUpdateDatabase(calls, { authorizedCups: 2 });
  const repository = createCustomerOrderWriteRepository({ runtime: "postgres", database });
  const result = await repository.updateOrder(validUpdateInput());
  assert.deepEqual(result, {
    error: "capacity_exceeded",
    maximumCups: 2,
    authorizedCups: 2,
    requestedCups: 1,
  });
  assert.equal(calls.some((call) => call.sql.includes("UPDATE orders")), false);
}

function verifyRuntimeValidation() {
  assert.equal(resolveCustomerOrderWriteRuntime({ env: {} }), "sqlite");
  assert.equal(resolveCustomerOrderWriteRuntime({
    env: { CUSTOMER_ORDER_WRITE_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveCustomerOrderWriteRuntime({ runtime: "mysql" }),
    /Unsupported CUSTOMER_ORDER_WRITE_RUNTIME/
  );
  assert.throws(
    () => createCustomerOrderWriteRepository({ env: {} }),
    /sqliteWriter is required/
  );
  assert.throws(
    () => createCustomerOrderWriteRepository({ env: {}, sqliteWriter: () => {} }),
    /sqliteUpdater is required/
  );
  assert.throws(
    () => createCustomerOrderWriteRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakePostgresDatabase(calls, options = {}) {
  const database = {
    kind: "postgres",
    transactionCount: 0,
    async transaction(operation) {
      database.transactionCount += 1;
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "activity-001",
        store_id: "store-001",
        status: "recruiting",
        deadline_at: new Date(options.deadlinePassed
          ? "2000-01-01T00:00:00.000Z"
          : "2099-01-01T00:00:00.000Z"),
        maximum_cups: 2,
      }] };
    }
    if (sql.includes("FROM users user_account")) {
      return { rows: [{ id: "customer-001" }] };
    }
    if (sql.includes("FROM orders") && sql.includes("customer_user_id")) {
      return { rows: options.existingOrderId ? [{ id: options.existingOrderId }] : [] };
    }
    if (sql.includes("FROM menu_items")) {
      return { rows: [{
        id: "menu-001",
        store_id: "store-001",
        name: "測試茶",
        base_price: 70,
        is_available: true,
      }] };
    }
    if (sql.includes("FROM customization_options")) return { rows: [] };
    if (sql.includes("FROM menu_item_customization_rules")) return { rows: [] };
    if (sql.includes("FROM promotion_tiers")) {
      return { rows: [{
        id: "tier-001",
        target_cups: 2,
        discount_amount: 2,
        sort_order: 0,
      }] };
    }
    if (sql.includes("AS authorized_cups")) {
      return { rows: [{ authorized_cups: options.authorizedCups || 0 }] };
    }
    if (sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return database;
}

function validInput() {
  return {
    activityId: "activity-001",
    customerUserId: "customer-001",
    fallbackPurchasePreference: "decline_original_price",
    items: [{
      menuItemId: "menu-001",
      quantity: 1,
      unitPrice: 70,
      subtotal: 70,
      customizationOptionIds: [],
    }],
  };
}

function validUpdateInput() {
  return {
    orderId: "order-001",
    customerUserId: "customer-001",
    fallbackPurchasePreference: "decline_original_price",
    items: [{
      menuItemId: "menu-001",
      quantity: 1,
      unitPrice: 70,
      subtotal: 70,
      customizationOptionIds: [],
    }],
  };
}

function createFakePostgresUpdateDatabase(calls, options = {}) {
  const database = {
    kind: "postgres",
    transactionCount: 0,
    async transaction(operation) {
      database.transactionCount += 1;
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("UPDATE payment_authorizations")) return { rows: [], rowCount: 1 };
    if (sql.includes("UPDATE orders")) return { rows: [], rowCount: 1 };
    if (sql.includes("DELETE FROM")) return { rows: [], rowCount: 0 };
    if (sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    if (sql.includes("AS authorized_cups")) {
      return { rows: [{ authorized_cups: options.authorizedCups || 0 }] };
    }
    if (sql.includes("FROM orders")) {
      return { rows: [{
        id: "order-001",
        activity_id: "activity-001",
        customer_user_id: "customer-001",
        status: "submitted",
        payment_status: options.paymentStatus || "pending",
        submitted_at: new Date("2026-06-25T10:00:00.000Z"),
      }] };
    }
    if (sql.includes("FROM group_buy_activities")) {
      return { rows: [{
        id: "activity-001",
        store_id: "store-001",
        status: "recruiting",
        maximum_cups: 2,
      }] };
    }
    if (sql.includes("FROM menu_items")) {
      return { rows: [{
        id: "menu-001",
        store_id: "store-001",
        name: "測試茶",
        base_price: 70,
        is_available: true,
      }] };
    }
    if (sql.includes("FROM customization_options")) return { rows: [] };
    if (sql.includes("FROM menu_item_customization_rules")) return { rows: [] };
    if (sql.includes("FROM promotion_tiers")) {
      return { rows: [{
        id: "tier-001",
        target_cups: 2,
        discount_amount: 2,
        sort_order: 0,
      }] };
    }
    if (sql.includes("FROM payment_authorizations")) {
      return {
        rows: options.pendingAuthorizationId ? [{
          id: options.pendingAuthorizationId,
          status: "pending",
          provider_authorization_id: "linepay-txn-001",
        }] : [],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return database;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
