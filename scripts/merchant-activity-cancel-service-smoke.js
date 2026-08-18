const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { cancelMerchantGroupBuyActivity } = require("../backend/payments/merchantActivityCancelService");
const {
  createMerchantGroupBuyActivityCancelRepository
} = require("../backend/database/repositories/merchantGroupBuyActivityCancelRepository");
const {
  createPaymentAuthorizationCancelRepository
} = require("../backend/database/repositories/paymentAuthorizationCancelRepository");
const {
  cancelGroupBuyActivity,
  cancelMerchantOrderInDatabase,
  cancelPendingLinePayAuthorizationInDatabase,
  getLinePayAuthorizationContext,
  getMerchantGroupBuyActivityForCancellation,
  listEligibleOrdersForMerchantCancellation,
  recordLinePayVoidFailureInDatabase,
  voidLinePayAuthorizationInDatabase
} = require("../backend/db");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  `drink-group-buy-dev-merchant-activity-cancel-smoke-${process.pid}-${Date.now()}.sqlite`
);

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function resetDatabaseForSmoke() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  fs.rmSync(databasePath, { force: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(schema);
  } finally {
    database.close();
  }
}

function withDatabase(callback) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

function insertUser(database, id, role, now) {
  database.prepare(`
    INSERT INTO users (id, login_name, email, display_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, `${id}-login`, `${id}@example.test`, id, now, now);
  database.prepare(`
    INSERT INTO user_roles (id, user_id, role, status, granted_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(`role-${id}-${role}`, id, role, now);
}

function insertOrder(database, order, now) {
  database.prepare(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, fallback_purchase_preference,
      total_cups, original_amount, payment_status, authorization_status,
      merchant_acceptance_status, pickup_status, submitted_at, updated_at
    ) VALUES (?, ?, ?, 'submitted', 'decline_original_price', 1, 65, ?, ?, 'accepted', 'not_ready', ?, ?)
  `).run(order.id, order.activityId, order.customerUserId, order.paymentStatus, order.authorizationStatus, now, now);

  if (order.withAuthorization) {
    database.prepare(`
      INSERT INTO payment_authorizations (
        id, order_id, provider, status, original_amount, authorized_amount,
        provider_authorization_id, expires_at, authorized_at, created_at, updated_at
      ) VALUES (?, ?, 'mock_line_pay', ?, 65, 65, ?, ?, ?, ?, ?)
    `).run(
      `payment-authorization-${order.id}`,
      order.id,
      order.authorizationRowStatus,
      `mock-line-pay-${order.id}`,
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      now,
      now,
      now
    );
  }
}

function buildScenario(name, deadlineOffsetMs) {
  const id = `merchant-activity-cancel-smoke-${name}-${randomUUID()}`;
  const now = Date.now();
  return {
    id,
    name: `商家取消團購 smoke ${name}`,
    merchantUserId: `user-${id}-merchant`,
    merchantId: `merchant-${id}`,
    storeId: `store-${id}`,
    activityId: `activity-${id}`,
    deadlineAt: new Date(now + deadlineOffsetMs).toISOString(),
    startAt: new Date(now - 60 * 60 * 1000).toISOString(),
    pickupStartAt: new Date(now + deadlineOffsetMs + 30 * 60 * 1000).toISOString(),
    pickupEndAt: new Date(now + deadlineOffsetMs + 90 * 60 * 1000).toISOString()
  };
}

function insertScenario(database, scenario) {
  const now = new Date().toISOString();
  database.exec("BEGIN;");
  try {
    insertUser(database, scenario.merchantUserId, "merchant", now);
    database.prepare(`
      INSERT INTO merchants (id, name, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `).run(scenario.merchantId, `${scenario.name} 商家`, now, now);
    database.prepare(`
      INSERT INTO merchant_users (id, merchant_id, user_id, permission_level, status, created_at)
      VALUES (?, ?, ?, 'owner', 'active', ?)
    `).run(`merchant-user-${scenario.id}`, scenario.merchantId, scenario.merchantUserId, now);
    database.prepare(`
      INSERT INTO stores (id, merchant_id, name, address, business_status, latitude, longitude, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', 24.1511, 120.6817, ?, ?)
    `).run(scenario.storeId, scenario.merchantId, `${scenario.name} 店`, "台中市北區測試路 1 號", now, now);
    database.prepare(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status, start_at, deadline_at,
        pickup_start_at, pickup_end_at, maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'recruiting', ?, ?, ?, ?, 20, 30, ?, ?)
    `).run(
      scenario.activityId, scenario.storeId, scenario.merchantUserId, scenario.name,
      scenario.startAt, scenario.deadlineAt, scenario.pickupStartAt, scenario.pickupEndAt, now, now
    );
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function createRepositories() {
  const merchantGroupBuyActivityCancelRepository = createMerchantGroupBuyActivityCancelRepository({
    sqliteGateway: {
      getActivityForCancellation: getMerchantGroupBuyActivityForCancellation,
      listEligibleOrders: listEligibleOrdersForMerchantCancellation,
      cancelOrder: cancelMerchantOrderInDatabase,
      cancelActivityStatus: cancelGroupBuyActivity
    }
  });
  const paymentAuthorizationCancelRepository = createPaymentAuthorizationCancelRepository({
    sqliteGateway: {
      getAuthorizationContext: getLinePayAuthorizationContext,
      cancelPendingAuthorization: cancelPendingLinePayAuthorizationInDatabase,
      voidAuthorization: voidLinePayAuthorizationInDatabase,
      recordVoidFailure: recordLinePayVoidFailureInDatabase
    }
  });
  return { merchantGroupBuyActivityCancelRepository, paymentAuthorizationCancelRepository };
}

function getOrderRow(orderId) {
  return withDatabase((database) => database.prepare(`
    SELECT id, status, payment_status FROM orders WHERE id = ?
  `).get(orderId));
}

function getAuthorizationRow(orderId) {
  return withDatabase((database) => database.prepare(`
    SELECT status FROM payment_authorizations WHERE order_id = ?
  `).get(orderId));
}

function getAuditLogCount(actionType, resourceId) {
  return withDatabase((database) => database.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs WHERE action_type = ? AND resource_id = ?
  `).get(actionType, resourceId).count);
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Development database not found: ${databasePath}`);
  }

  fs.copyFileSync(databasePath, backupPath);

  try {
    resetDatabaseForSmoke();
    const { merchantGroupBuyActivityCancelRepository, paymentAuthorizationCancelRepository } = createRepositories();
    const alwaysAllow = () => true;
    const alwaysDeny = () => false;

    // Scenario 1: happy path — pending + authorized + captured orders under one recruiting activity.
    const scenario = buildScenario("happy-path", 60 * 60 * 1000);
    withDatabase((database) => {
      insertScenario(database, scenario);
      const now = new Date().toISOString();
      insertUser(database, `${scenario.id}-customer-1`, "customer", now);
      insertUser(database, `${scenario.id}-customer-2`, "customer", now);
      insertUser(database, `${scenario.id}-customer-3`, "customer", now);
      insertOrder(database, {
        id: `order-${scenario.id}-pending`,
        activityId: scenario.activityId,
        customerUserId: `${scenario.id}-customer-1`,
        paymentStatus: "pending",
        authorizationStatus: "pending",
        withAuthorization: false
      }, now);
      insertOrder(database, {
        id: `order-${scenario.id}-authorized`,
        activityId: scenario.activityId,
        customerUserId: `${scenario.id}-customer-2`,
        paymentStatus: "authorized",
        authorizationStatus: "authorized",
        withAuthorization: true,
        authorizationRowStatus: "authorized"
      }, now);
      insertOrder(database, {
        id: `order-${scenario.id}-captured`,
        activityId: scenario.activityId,
        customerUserId: `${scenario.id}-customer-3`,
        paymentStatus: "captured",
        authorizationStatus: "captured",
        withAuthorization: true,
        authorizationRowStatus: "captured"
      }, now);
    });

    const result = await cancelMerchantGroupBuyActivity({
      activityId: scenario.activityId,
      reason: "food_shortage",
      actorUserId: scenario.merchantUserId,
      now: new Date().toISOString(),
      canManageStore: alwaysAllow,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository
    });

    assert(!result.error, "happy-path cancellation should not fail", result);
    assert(result.activity.status === "cancelled", "activity should be cancelled", result.activity);
    assert(result.cancelledOrderCount === 2, "pending + authorized orders should be cancelled", result);
    assert(result.failedOrderIds.length === 0, "no order should fail in the happy path", result);
    assert(
      new Set(result.cancelledOrderIds).size === 2
        && result.cancelledOrderIds.includes(`order-${scenario.id}-pending`)
        && result.cancelledOrderIds.includes(`order-${scenario.id}-authorized`)
        && !result.cancelledOrderIds.includes(`order-${scenario.id}-captured`),
      "cancelledOrderIds should list exactly the pending + authorized orders, not the captured one",
      result
    );

    const pendingOrder = getOrderRow(`order-${scenario.id}-pending`);
    assert(pendingOrder.status === "cancelled", "pending order should be cancelled", pendingOrder);

    const authorizedOrder = getOrderRow(`order-${scenario.id}-authorized`);
    assert(authorizedOrder.status === "cancelled", "authorized order should be cancelled", authorizedOrder);
    const authorizedOrderAuthorization = getAuthorizationRow(`order-${scenario.id}-authorized`);
    assert(
      authorizedOrderAuthorization.status === "authorization_voided",
      "authorized order's authorization should be voided",
      authorizedOrderAuthorization
    );

    const capturedOrder = getOrderRow(`order-${scenario.id}-captured`);
    assert(capturedOrder.status !== "cancelled", "captured order should be left untouched", capturedOrder);
    assert(capturedOrder.payment_status === "captured", "captured order's payment status should be untouched", capturedOrder);

    assert(
      getAuditLogCount("merchant_cancel_group_buy_activity", scenario.activityId) === 1,
      "activity cancellation should write exactly one audit log entry"
    );
    assert(
      getAuditLogCount("merchant_cancel_order", `order-${scenario.id}-pending`) === 1,
      "pending order cancellation should write an audit log entry"
    );
    assert(
      getAuditLogCount("merchant_cancel_order", `order-${scenario.id}-authorized`) === 1,
      "authorized order cancellation should write an audit log entry"
    );

    // Re-call: idempotent no-op, no orders touched again.
    const repeatResult = await cancelMerchantGroupBuyActivity({
      activityId: scenario.activityId,
      reason: "food_shortage",
      actorUserId: scenario.merchantUserId,
      now: new Date().toISOString(),
      canManageStore: alwaysAllow,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository
    });
    assert(repeatResult.idempotent, "re-cancelling an already-cancelled activity should be a no-op", repeatResult);
    assert(repeatResult.cancelledOrderCount === 0, "idempotent re-call should not touch any order", repeatResult);

    // Scenario 2: activity within the 30-minute deadline lock window — reject, touch nothing.
    const lockedScenario = buildScenario("locked", 10 * 60 * 1000);
    withDatabase((database) => insertScenario(database, lockedScenario));
    const lockedResult = await cancelMerchantGroupBuyActivity({
      activityId: lockedScenario.activityId,
      reason: "food_shortage",
      actorUserId: lockedScenario.merchantUserId,
      now: new Date().toISOString(),
      canManageStore: alwaysAllow,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository
    });
    assert(
      lockedResult.error === "activity_locked_by_deadline",
      "activity within the lock window should be rejected",
      lockedResult
    );
    const lockedActivityAfter = withDatabase((database) => database.prepare(`
      SELECT status FROM group_buy_activities WHERE id = ?
    `).get(lockedScenario.activityId));
    assert(lockedActivityAfter.status === "recruiting", "locked activity should remain untouched", lockedActivityAfter);

    // Scenario 3: store ownership check must be enforced.
    const foreignScenario = buildScenario("foreign-store", 60 * 60 * 1000);
    withDatabase((database) => insertScenario(database, foreignScenario));
    const deniedResult = await cancelMerchantGroupBuyActivity({
      activityId: foreignScenario.activityId,
      reason: "food_shortage",
      actorUserId: foreignScenario.merchantUserId,
      now: new Date().toISOString(),
      canManageStore: alwaysDeny,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository
    });
    assert(deniedResult.error === "store_access_denied", "mismatched store ownership should be rejected", deniedResult);
    const deniedActivityAfter = withDatabase((database) => database.prepare(`
      SELECT status FROM group_buy_activities WHERE id = ?
    `).get(foreignScenario.activityId));
    assert(deniedActivityAfter.status === "recruiting", "denied activity should remain untouched", deniedActivityAfter);

    // Scenario 4: unknown activity id.
    const notFoundResult = await cancelMerchantGroupBuyActivity({
      activityId: "activity-does-not-exist",
      reason: "food_shortage",
      actorUserId: "user-does-not-exist",
      now: new Date().toISOString(),
      canManageStore: alwaysAllow,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository
    });
    assert(notFoundResult.error === "activity_not_found", "unknown activity id should be rejected", notFoundResult);

    // Scenario 5: one order's void fails (authorized in `orders` but no matching payment_authorizations
    // row exists, so voidLinePayAuthorization cannot find context) — activity still cancels (fail-soft),
    // the failing order is NOT in cancelledOrderIds, and the failure is logged with its orderId.
    const partialFailureScenario = buildScenario("partial-failure", 60 * 60 * 1000);
    withDatabase((database) => {
      insertScenario(database, partialFailureScenario);
      const now = new Date().toISOString();
      insertUser(database, `${partialFailureScenario.id}-customer-1`, "customer", now);
      insertUser(database, `${partialFailureScenario.id}-customer-2`, "customer", now);
      insertOrder(database, {
        id: `order-${partialFailureScenario.id}-pending`,
        activityId: partialFailureScenario.activityId,
        customerUserId: `${partialFailureScenario.id}-customer-1`,
        paymentStatus: "pending",
        authorizationStatus: "pending",
        withAuthorization: false
      }, now);
      insertOrder(database, {
        id: `order-${partialFailureScenario.id}-broken-authorized`,
        activityId: partialFailureScenario.activityId,
        customerUserId: `${partialFailureScenario.id}-customer-2`,
        paymentStatus: "authorized",
        authorizationStatus: "authorized",
        withAuthorization: false
      }, now);
    });
    const loggedErrors = [];
    const partialFailureResult = await cancelMerchantGroupBuyActivity({
      activityId: partialFailureScenario.activityId,
      reason: "food_shortage",
      actorUserId: partialFailureScenario.merchantUserId,
      now: new Date().toISOString(),
      canManageStore: alwaysAllow,
      merchantGroupBuyActivityCancelRepository,
      paymentAuthorizationCancelRepository,
      logger: { error: (message, details) => loggedErrors.push({ message, details }) }
    });
    assert(!partialFailureResult.error, "partial-failure cancellation should still succeed overall", partialFailureResult);
    assert(
      partialFailureResult.activity.status === "cancelled",
      "activity should still be cancelled despite one order failing",
      partialFailureResult
    );
    assert(
      partialFailureResult.cancelledOrderIds.length === 1
        && partialFailureResult.cancelledOrderIds[0] === `order-${partialFailureScenario.id}-pending`,
      "only the pending order should be in cancelledOrderIds",
      partialFailureResult
    );
    assert(
      partialFailureResult.failedOrderIds.length === 1
        && partialFailureResult.failedOrderIds[0] === `order-${partialFailureScenario.id}-broken-authorized`,
      "the broken-authorization order should be in failedOrderIds",
      partialFailureResult
    );
    assert(
      loggedErrors.length === 1
        && loggedErrors[0].message === "[merchant-cancel-activity] order cancel failed"
        && loggedErrors[0].details.orderId === `order-${partialFailureScenario.id}-broken-authorized`,
      "the per-order failure should be logged with its orderId",
      loggedErrors
    );
    const brokenOrderAfter = getOrderRow(`order-${partialFailureScenario.id}-broken-authorized`);
    assert(
      brokenOrderAfter.status !== "cancelled",
      "the order whose void failed should not be marked cancelled",
      brokenOrderAfter
    );

    console.log("Merchant activity cancel service smoke test passed.");
    console.log(`happy-path: cancelledOrderCount=${result.cancelledOrderCount}, failedOrderIds=${result.failedOrderIds.length}`);
  } finally {
    fs.copyFileSync(backupPath, databasePath);
    fs.rmSync(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
