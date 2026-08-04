const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  approveRefundRequest,
  createMerchantRefundRequest,
  rejectRefundRequest
} = require("../backend/payments/refundRequestService");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  `drink-group-buy-dev-refund-request-smoke-${process.pid}-${Date.now()}.sqlite`
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

function seedCapturedOrder(database, scenario, now) {
  insertUser(database, scenario.merchantUserId, "merchant", now);
  insertUser(database, scenario.customerUserId, "customer", now);

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
    ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, 20, 30, ?, ?)
  `).run(
    scenario.activityId,
    scenario.storeId,
    scenario.merchantUserId,
    scenario.name,
    new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    now,
    now
  );

  database.prepare(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, fallback_purchase_preference,
      total_cups, original_amount, final_amount, payment_status, authorization_status,
      merchant_acceptance_status, pickup_status, submitted_at, updated_at
    ) VALUES (?, ?, ?, 'completed', 'decline_original_price', ?, ?, ?, 'captured', 'captured', 'accepted', 'picked_up', ?, ?)
  `).run(
    scenario.orderId,
    scenario.activityId,
    scenario.customerUserId,
    scenario.totalCups,
    scenario.originalAmount,
    scenario.finalAmount,
    now,
    now
  );

  database.prepare(`
    INSERT INTO payment_authorizations (
      id, order_id, provider, status, original_amount, authorized_amount,
      provider_authorization_id, expires_at, authorized_at, created_at, updated_at
    ) VALUES (?, ?, 'mock_line_pay', 'captured', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scenario.authorizationId,
    scenario.orderId,
    scenario.originalAmount,
    scenario.finalAmount,
    `mock-line-pay-${scenario.orderId}`,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    now,
    now,
    now
  );

  database.prepare(`
    INSERT INTO payment_captures (
      id, payment_authorization_id, order_id, status, final_amount, capture_amount,
      released_amount, provider_capture_id, captured_at, attempt_number, retryable, created_at, updated_at
    ) VALUES (?, ?, ?, 'captured', ?, ?, 0, ?, ?, 1, 0, ?, ?)
  `).run(
    scenario.captureId,
    scenario.authorizationId,
    scenario.orderId,
    scenario.finalAmount,
    scenario.finalAmount,
    `mock-capture-${scenario.orderId}`,
    now,
    now,
    now
  );
}

function insertScenario(database, scenario) {
  const now = new Date().toISOString();
  database.exec("BEGIN;");
  try {
    seedCapturedOrder(database, scenario, now);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function buildScenario(name, totalCups, originalAmount, finalAmount) {
  const id = `refund-request-smoke-${name}-${randomUUID()}`;
  return {
    id,
    name: `退款申請 smoke ${name}`,
    merchantUserId: `user-${id}-merchant`,
    customerUserId: `user-${id}-customer`,
    merchantId: `merchant-${id}`,
    storeId: `store-${id}`,
    activityId: `activity-${id}`,
    orderId: `order-${id}`,
    authorizationId: `payment-authorization-${id}`,
    captureId: `payment-capture-${id}`,
    totalCups,
    originalAmount,
    finalAmount
  };
}

function buildAuthUser({ id, roles, merchantStores = [] }) {
  return { id, roles, merchantStores };
}

function getOrderPaymentStatus(orderId) {
  return withDatabase((database) => (
    database.prepare("SELECT payment_status FROM orders WHERE id = ?").get(orderId)
  ));
}

async function assertThrowsPaymentServiceError(fn, expectedStatusCode, message) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert(caught?.statusCode === expectedStatusCode, message, caught?.payload);
  return caught;
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Development database not found: ${databasePath}`);
  }

  fs.copyFileSync(databasePath, backupPath);
  resetDatabaseForSmoke();

  let approvedCount = 0;
  let rejectedCount = 0;
  let duplicateSuppressedCount = 0;
  let nonOwnerBlockedCount = 0;

  try {
    const adminAuthUser = buildAuthUser({ id: "user-refund-request-smoke-admin", roles: ["admin"] });
    withDatabase((database) => {
      database.exec("BEGIN;");
      try {
        insertUser(database, adminAuthUser.id, "admin", new Date().toISOString());
        database.exec("COMMIT;");
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }
    });

    // Scenario A: merchant requests refund on a captured order, admin approves it.
    const scenarioA = buildScenario("approve", 2, 130, 99);
    withDatabase((database) => insertScenario(database, scenarioA));

    const merchantAuthUserA = buildAuthUser({
      id: scenarioA.merchantUserId,
      roles: ["merchant"],
      merchantStores: [{ id: scenarioA.storeId }]
    });
    const outsiderMerchantAuthUser = buildAuthUser({
      id: "user-refund-request-smoke-outsider",
      roles: ["merchant"],
      merchantStores: [{ id: "store-not-owned" }]
    });

    await assertThrowsPaymentServiceError(
      () => createMerchantRefundRequest({
        authUser: outsiderMerchantAuthUser,
        orderId: scenarioA.orderId,
        body: { requestedAmount: scenarioA.finalAmount, reason: "顧客反映飲品品質異常" }
      }),
      403,
      "Non-owning merchant should be blocked with 403"
    );
    nonOwnerBlockedCount += 1;

    const createdA = await createMerchantRefundRequest({
      authUser: merchantAuthUserA,
      orderId: scenarioA.orderId,
      body: { requestedAmount: scenarioA.finalAmount, reason: "顧客反映飲品品質異常" }
    });
    assert(createdA.refundRequest?.status === "pending", "Refund request should be created as pending", createdA);

    await assertThrowsPaymentServiceError(
      () => createMerchantRefundRequest({
        authUser: merchantAuthUserA,
        orderId: scenarioA.orderId,
        body: { requestedAmount: scenarioA.finalAmount, reason: "重複申請測試" }
      }),
      409,
      "Duplicate pending refund request should be rejected with 409"
    );
    duplicateSuppressedCount += 1;

    const approved = await approveRefundRequest({
      authUser: adminAuthUser,
      requestId: createdA.refundRequest.id,
      body: { provider: "mock_line_pay" }
    });
    assert(approved.refundRequest.status === "approved", "Refund request should be approved", approved.refundRequest);
    assert(approved.refund?.status === "refunded", "Underlying LINE Pay refund should be refunded", approved.refund);
    assert(!!approved.refundRequest.resultingPaymentRefundId, "Approved request should link resulting payment refund id", approved.refundRequest);
    approvedCount += 1;

    const orderAfterApproval = getOrderPaymentStatus(scenarioA.orderId);
    assert(orderAfterApproval.payment_status === "refunded", "Order payment_status should be refunded after full refund", orderAfterApproval);

    await assertThrowsPaymentServiceError(
      () => approveRefundRequest({ authUser: adminAuthUser, requestId: createdA.refundRequest.id, body: { provider: "mock_line_pay" } }),
      409,
      "Re-approving an already-approved request should return 409"
    );

    // Scenario B: merchant requests refund, ops rejects it without touching order payment state.
    const scenarioB = buildScenario("reject", 1, 65, 65);
    withDatabase((database) => insertScenario(database, scenarioB));

    const merchantAuthUserB = buildAuthUser({
      id: scenarioB.merchantUserId,
      roles: ["merchant"],
      merchantStores: [{ id: scenarioB.storeId }]
    });

    const createdB = await createMerchantRefundRequest({
      authUser: merchantAuthUserB,
      orderId: scenarioB.orderId,
      body: { requestedAmount: scenarioB.finalAmount, reason: "商家誤上錯誤品項" }
    });
    const rejected = await rejectRefundRequest({
      authUser: adminAuthUser,
      requestId: createdB.refundRequest.id,
      body: { reason: "已與顧客協調改為重新製作" }
    });
    assert(rejected.refundRequest.status === "rejected", "Refund request should be rejected", rejected.refundRequest);
    assert(
      rejected.refundRequest.rejectionReason === "已與顧客協調改為重新製作",
      "Rejection reason should be stored",
      rejected.refundRequest
    );
    rejectedCount += 1;

    const orderAfterRejection = getOrderPaymentStatus(scenarioB.orderId);
    assert(orderAfterRejection.payment_status === "captured", "Rejected request should not touch order payment_status", orderAfterRejection);

    console.log("Refund request smoke passed");
    console.log(
      `approved=${approvedCount} rejected=${rejectedCount} `
      + `duplicate_suppressed=${duplicateSuppressedCount} non_owner_blocked=${nonOwnerBlockedCount}`
    );
  } finally {
    fs.copyFileSync(backupPath, databasePath);
    fs.rmSync(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error("Refund request smoke failed:", error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
