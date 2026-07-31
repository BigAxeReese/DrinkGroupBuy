const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-order-flow-smoke-"));
const databasePath = path.join(tempDirectory, "order-flow-smoke.sqlite");
process.env.DRINK_GROUP_BUY_DB_PATH = databasePath;

const {
  cancelCustomerOrderInDatabase,
  createOrder,
  getCustomerOrderCancellationEligibility,
  listCustomerOrders,
  listMerchantStoreOrders,
  listStoreMenu
} = require("../backend/db");

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "..", "database", "seed-dev.sql"), "utf8");
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(schema);
    database.exec(seed);
  } finally {
    database.close();
  }
}

function insertActivity(id, deadlineOffsetMinutes) {
  const database = new DatabaseSync(databasePath);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.prepare(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status, start_at, deadline_at,
        pickup_start_at, pickup_end_at, maximum_cups, withdrawal_lock_minutes,
        created_at, updated_at
      ) VALUES (?, 'store-001', 'user-merchant-001', ?, 'recruiting', ?, ?, ?, ?, 30, 30, ?, ?)
    `).run(
      id,
      id,
      new Date(now - 60_000).toISOString(),
      new Date(now + deadlineOffsetMinutes * 60_000).toISOString(),
      new Date(now + (deadlineOffsetMinutes + 60) * 60_000).toISOString(),
      new Date(now + (deadlineOffsetMinutes + 120) * 60_000).toISOString(),
      createdAt,
      createdAt
    );
  } finally {
    database.close();
  }
}

function buildOrderInput(activityId, customerUserId) {
  const menuItem = listStoreMenu("store-001").menuItems[0];
  const selectedOptions = menuItem.customizationGroups.flatMap((group) => (
    group.options.slice(0, group.minSelections)
  ));
  const unitPrice = menuItem.basePrice
    + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  return {
    activityId,
    customerUserId,
    fallbackPurchasePreference: "decline_original_price",
    items: [{
      menuItemId: menuItem.id,
      quantity: 1,
      unitPrice,
      subtotal: unitPrice,
      customizationOptionIds: selectedOptions.map((option) => option.id)
    }]
  };
}

function countCancellationRecords(orderId) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      history: database.prepare(`
        SELECT COUNT(*) AS count FROM status_history
        WHERE resource_type = 'order' AND resource_id = ? AND to_status = 'cancelled'
      `).get(orderId).count,
      audits: database.prepare(`
        SELECT COUNT(*) AS count FROM audit_logs
        WHERE action_type = 'customer_cancel_order' AND resource_id = ?
      `).get(orderId).count,
      idempotency: database.prepare(`
        SELECT COUNT(*) AS count FROM order_action_idempotency
        WHERE action_type = 'customer_cancel_order' AND order_id = ?
      `).get(orderId).count
    };
  } finally {
    database.close();
  }
}

function main() {
  initializeDatabase();
  insertActivity("order-flow-active-a", 120);
  insertActivity("order-flow-active-b", 180);
  insertActivity("order-flow-locked", 20);
  insertActivity("order-flow-expired", -1);

  const expired = createOrder(buildOrderInput("order-flow-expired", "user-customer-lixuan"));
  assert(
    expired.error === "activity_not_joinable" && expired.reason === "deadline_passed",
    "expired activity should reject order creation",
    expired
  );

  const first = createOrder(buildOrderInput("order-flow-active-a", "user-customer-yinji"));
  assert(first.order, "first order should be created", first);
  const duplicate = createOrder(buildOrderInput("order-flow-active-a", "user-customer-yinji"));
  assert(duplicate.error === "order_already_exists", "duplicate active order should be rejected", duplicate);
  assert(duplicate.orderId === first.order.id, "duplicate response should expose the existing order", duplicate);

  const second = createOrder(buildOrderInput("order-flow-active-b", "user-customer-yinji"));
  assert(second.order, "second activity order should be created", second);
  const locked = createOrder(buildOrderInput("order-flow-locked", "user-customer-lixuan"));
  assert(locked.order, "locked-window fixture order should be created", locked);

  const firstPage = listCustomerOrders("user-customer-yinji", { scope: "active", limit: 1 });
  assert(firstPage.orders.length === 1 && firstPage.nextCursor, "customer list should paginate", firstPage);
  const secondPage = listCustomerOrders("user-customer-yinji", {
    scope: "active",
    limit: 1,
    cursor: firstPage.nextCursor
  });
  assert(secondPage.orders.length === 1, "customer cursor should return the next order", secondPage);
  assert(firstPage.orders[0].id !== secondPage.orders[0].id, "cursor pages must not overlap");
  assert(
    ["pay", "edit", "cancel"].every((action) => firstPage.orders[0].availableActions.includes(action)),
    "pending customer order should expose pay/edit/cancel",
    firstPage.orders[0]
  );

  const merchantOrders = listMerchantStoreOrders("store-001", {
    scope: "active",
    activityId: "order-flow-active-a"
  });
  assert(merchantOrders.orders.length === 1, "merchant activity filter should isolate one order", merchantOrders);
  assert(merchantOrders.orders[0].customer?.alias === "匿名顧客", "merchant list should expose only public alias");

  const lockedEligibility = getCustomerOrderCancellationEligibility({
    orderId: locked.order.id,
    customerUserId: "user-customer-lixuan"
  });
  assert(lockedEligibility.error === "order_locked_by_deadline", "locked order cancellation should be rejected", lockedEligibility);

  const idempotencyKey = `order-flow-cancel-${first.order.id}`;
  const cancelled = cancelCustomerOrderInDatabase({
    orderId: first.order.id,
    customerUserId: "user-customer-yinji",
    idempotencyKey
  });
  assert(cancelled.order?.status === "cancelled", "order should move to cancelled", cancelled);
  const repeated = cancelCustomerOrderInDatabase({
    orderId: first.order.id,
    customerUserId: "user-customer-yinji",
    idempotencyKey
  });
  assert(repeated.idempotent, "repeated cancellation should be idempotent", repeated);
  const conflict = cancelCustomerOrderInDatabase({
    orderId: second.order.id,
    customerUserId: "user-customer-yinji",
    idempotencyKey
  });
  assert(conflict.error === "idempotency_key_conflict", "idempotency key reuse should be rejected", conflict);

  const activeAfterCancel = listCustomerOrders("user-customer-yinji", { scope: "active" });
  const historyAfterCancel = listCustomerOrders("user-customer-yinji", { scope: "history" });
  assert(!activeAfterCancel.orders.some((order) => order.id === first.order.id), "cancelled order must leave active list");
  assert(historyAfterCancel.orders.some((order) => order.id === first.order.id), "cancelled order must enter history list");

  const records = countCancellationRecords(first.order.id);
  assert(records.history === 1 && records.audits === 1 && records.idempotency === 1,
    "cancellation should write one history, audit and idempotency record", records);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all().length;
  database.close();
  assert(integrity === "ok" && foreignKeyErrors === 0, "database checks should pass", { integrity, foreignKeyErrors });

  console.log("Order flow smoke passed");
  console.log("lists: customer_cursor=1, merchant_activity_filter=1, anonymous_alias=1");
  console.log("orders: deadline_rejected=1, duplicate_active_rejected=1, locked_cancel_rejected=1");
  console.log("cancel: history=1, idempotent_retry=1, key_conflict_rejected=1");
  console.log("database: integrity=ok, foreign_key_errors=0");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
