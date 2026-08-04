const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  computeEcpayCheckMacValue,
  getEcpayConfig
} = require("../backend/payments/ecpayClient");
const {
  handleEcpayReturnWebhook,
  renderEcpayCheckoutRedirectHtml,
  requestEcpayAuthorization
} = require("../backend/payments/ecpayService");
const { settleGroupBuyActivity } = require("../backend/payments/settlementService");
const {
  approveRefundRequest,
  createMerchantRefundRequest
} = require("../backend/payments/refundRequestService");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  `drink-group-buy-dev-ecpay-smoke-${process.pid}-${Date.now()}.sqlite`
);

process.env.ECPAY_RETURN_URL = process.env.ECPAY_RETURN_URL || "http://localhost:3000/api/payments/ecpay/return";
process.env.ECPAY_CLIENT_BACK_URL = process.env.ECPAY_CLIENT_BACK_URL || "http://localhost:3000/api/payments/ecpay/client-back";

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

function seedScenario(database, scenario, now) {
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
    ) VALUES (?, ?, ?, ?, 'ordering', ?, ?, ?, ?, ?, 30, ?, ?)
  `).run(
    scenario.activityId,
    scenario.storeId,
    scenario.merchantUserId,
    scenario.name,
    new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    new Date(Date.now() + 35 * 60 * 1000).toISOString(),
    new Date(Date.now() + 95 * 60 * 1000).toISOString(),
    scenario.maximumCups,
    now,
    now
  );

  database.prepare(`
    INSERT INTO promotion_tiers (id, activity_id, target_cups, discount_amount, sort_order)
    VALUES (?, ?, ?, ?, 1)
  `).run(scenario.tierId, scenario.activityId, scenario.targetCups, scenario.discountAmount);

  database.prepare(`
    INSERT INTO orders (
      id, activity_id, customer_user_id, status, fallback_purchase_preference,
      total_cups, original_amount, payment_status, authorization_status,
      merchant_acceptance_status, pickup_status, submitted_at, updated_at
    ) VALUES (?, ?, ?, 'submitted', 'decline_original_price', ?, ?, 'pending', 'pending', 'pending', 'not_ready', ?, ?)
  `).run(scenario.orderId, scenario.activityId, scenario.customerUserId, scenario.totalCups, scenario.originalAmount, now, now);

  database.prepare(`
    INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, quantity, unit_price_snapshot, subtotal)
    VALUES (?, ?, NULL, ?, ?, ?, ?)
  `).run(
    `order-item-${scenario.id}`,
    scenario.orderId,
    "ECPay smoke drink",
    scenario.totalCups,
    Math.floor(scenario.originalAmount / scenario.totalCups),
    scenario.originalAmount
  );
}

function buildScenario(name, totalCups, originalAmount, options = {}) {
  const id = `ecpay-smoke-${name}-${randomUUID()}`;
  return {
    id,
    name: `ECPay smoke ${name}`,
    merchantUserId: `user-${id}-merchant`,
    customerUserId: `user-${id}-customer`,
    merchantId: `merchant-${id}`,
    storeId: `store-${id}`,
    activityId: `activity-${id}`,
    tierId: `tier-${id}`,
    orderId: `order-${id}`,
    totalCups,
    originalAmount,
    targetCups: options.targetCups ?? totalCups,
    discountAmount: options.discountAmount ?? 0,
    maximumCups: options.maximumCups ?? totalCups
  };
}

function buildAuthUser({ id, roles, merchantStores = [] }) {
  return { id, roles, merchantStores };
}

function getOrderRow(orderId) {
  return withDatabase((database) => (
    database.prepare("SELECT payment_status, final_amount FROM orders WHERE id = ?").get(orderId)
  ));
}

function buildSignedWebhookFields(merchantTradeNo, amount, overrides = {}) {
  const config = getEcpayConfig();
  const fields = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TradeNo: `ECPAYSMOKE${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    RtnCode: "1",
    RtnMsg: "Succeeded",
    TradeAmt: String(amount),
    PaymentType: "Credit_CreditCard",
    ...overrides
  };
  fields.CheckMacValue = computeEcpayCheckMacValue(fields, config);
  return fields;
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

  let requestedCount = 0;
  let confirmedCount = 0;
  let tamperRejectedCount = 0;
  let capturedCount = 0;
  let voidedCount = 0;
  let refundedCount = 0;

  try {
    const now = new Date().toISOString();

    // Scenario A: qualified activity -> settlement should capture at the discounted amount.
    const scenarioA = buildScenario("capture", 2, 130, { targetCups: 2, discountAmount: 20, maximumCups: 5 });
    withDatabase((database) => seedScenario(database, scenarioA, now));

    const customerAuthUserA = buildAuthUser({ id: scenarioA.customerUserId, roles: ["customer"] });

    const requestResult = await requestEcpayAuthorization({
      authUser: customerAuthUserA,
      body: { orderId: scenarioA.orderId, amount: scenarioA.originalAmount, provider: "mock_ecpay" }
    });
    assert(requestResult.authorization.status === "pending", "ECPay authorization should start pending", requestResult);
    assert(requestResult.paymentUrl?.web?.includes("checkout-redirect"), "paymentUrl should point at the checkout-redirect route", requestResult);
    requestedCount += 1;

    const checkoutHtml = renderEcpayCheckoutRedirectHtml(scenarioA.orderId);
    assert(checkoutHtml?.includes("AioCheckOut"), "checkout redirect html should target ECPay AioCheckOut", checkoutHtml);
    assert(checkoutHtml?.includes(requestResult.authorization.providerAuthorizationId), "checkout form should carry the MerchantTradeNo", checkoutHtml);

    const merchantTradeNoA = requestResult.authorization.providerAuthorizationId;

    const tamperedFields = buildSignedWebhookFields(merchantTradeNoA, scenarioA.originalAmount);
    tamperedFields.TradeAmt = "999999";
    const tamperedResult = await handleEcpayReturnWebhook({ orderId: scenarioA.orderId, formFields: tamperedFields });
    assert(tamperedResult?.error === "invalid_check_mac_value", "Tampered webhook payload should be rejected", tamperedResult);
    tamperRejectedCount += 1;

    const confirmFields = buildSignedWebhookFields(merchantTradeNoA, scenarioA.originalAmount);
    const confirmResult = await handleEcpayReturnWebhook({ orderId: scenarioA.orderId, formFields: confirmFields });
    assert(confirmResult?.status === "authorized", "Valid webhook should authorize the order", confirmResult);
    confirmedCount += 1;

    const orderAfterAuth = getOrderRow(scenarioA.orderId);
    assert(orderAfterAuth.payment_status === "authorized", "Order should be authorized after webhook confirm", orderAfterAuth);

    const settlementResultA = await settleGroupBuyActivity({ activityId: scenarioA.activityId, actorUserId: scenarioA.merchantUserId, force: true });
    assert(!settlementResultA.error, "Qualified settlement should not error", settlementResultA);
    assert(settlementResultA.results?.[0]?.status === "captured", "Qualified ECPay order should be captured at settlement", settlementResultA);
    capturedCount += 1;

    const orderAfterCapture = getOrderRow(scenarioA.orderId);
    assert(orderAfterCapture.payment_status === "captured", "Order should be captured after settlement", orderAfterCapture);
    assert(orderAfterCapture.final_amount === scenarioA.originalAmount - scenarioA.discountAmount, "Final amount should reflect the discount", orderAfterCapture);

    // Scenario B: activity that never reaches its minimum tier and the customer declines
    // the original-price fallback -> settlement should void instead of capture.
    const scenarioB = buildScenario("void", 1, 65, { targetCups: 5, discountAmount: 50, maximumCups: 5 });
    withDatabase((database) => seedScenario(database, scenarioB, now));
    const customerAuthUserB = buildAuthUser({ id: scenarioB.customerUserId, roles: ["customer"] });

    const requestResultB = await requestEcpayAuthorization({
      authUser: customerAuthUserB,
      body: { orderId: scenarioB.orderId, amount: scenarioB.originalAmount, provider: "mock_ecpay" }
    });
    const confirmFieldsB = buildSignedWebhookFields(requestResultB.authorization.providerAuthorizationId, scenarioB.originalAmount);
    await handleEcpayReturnWebhook({ orderId: scenarioB.orderId, formFields: confirmFieldsB });

    const settlementResultB = await settleGroupBuyActivity({ activityId: scenarioB.activityId, actorUserId: scenarioB.merchantUserId, force: true });
    assert(settlementResultB.results?.[0]?.status === "authorization_voided", "Unqualified ECPay order should be voided at settlement", settlementResultB);
    voidedCount += 1;

    const orderAfterVoid = getOrderRow(scenarioB.orderId);
    assert(orderAfterVoid.payment_status === "authorization_voided", "Order should show authorization_voided after settlement", orderAfterVoid);

    // Scenario C: refund-request approval should auto-detect the ECPay provider rather
    // than trusting a client-supplied value (regression guard for refundRequestService).
    const merchantAuthUserA = buildAuthUser({
      id: scenarioA.merchantUserId,
      roles: ["merchant"],
      merchantStores: [{ id: scenarioA.storeId }]
    });
    const adminAuthUser = buildAuthUser({ id: "user-ecpay-smoke-admin", roles: ["admin"] });
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

    const refundRequest = await createMerchantRefundRequest({
      authUser: merchantAuthUserA,
      orderId: scenarioA.orderId,
      body: { requestedAmount: orderAfterCapture.final_amount, reason: "ECPay smoke 退款測試" }
    });
    const approvedRefund = await approveRefundRequest({
      authUser: adminAuthUser,
      requestId: refundRequest.refundRequest.id,
      body: {}
    });
    assert(approvedRefund.refund?.provider === "mock_ecpay", "Refund should auto-dispatch to the ECPay provider", approvedRefund.refund);
    assert(approvedRefund.refundRequest.status === "approved", "Refund request should be approved", approvedRefund.refundRequest);
    refundedCount += 1;

    const orderAfterRefund = getOrderRow(scenarioA.orderId);
    assert(orderAfterRefund.payment_status === "refunded", "Order should be refunded", orderAfterRefund);

    // Regression guard: creating a second authorization for an order that already has a
    // pending one should be rejected, same as the LINE Pay path.
    const scenarioD = buildScenario("duplicate", 1, 65, { targetCups: 1, discountAmount: 0, maximumCups: 5 });
    withDatabase((database) => seedScenario(database, scenarioD, now));
    const customerAuthUserD = buildAuthUser({ id: scenarioD.customerUserId, roles: ["customer"] });
    await requestEcpayAuthorization({
      authUser: customerAuthUserD,
      body: { orderId: scenarioD.orderId, amount: scenarioD.originalAmount, provider: "mock_ecpay" }
    });
    await assertThrowsPaymentServiceError(
      () => requestEcpayAuthorization({
        authUser: customerAuthUserD,
        body: { orderId: scenarioD.orderId, amount: scenarioD.originalAmount, provider: "mock_ecpay" }
      }),
      409,
      "A second authorization request for the same pending order should be rejected"
    );

    console.log("ECPay smoke passed");
    console.log(
      `requested=${requestedCount} confirmed=${confirmedCount} tamper_rejected=${tamperRejectedCount} `
      + `captured=${capturedCount} voided=${voidedCount} refunded=${refundedCount}`
    );
  } finally {
    fs.copyFileSync(backupPath, databasePath);
    fs.rmSync(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error("ECPay smoke failed:", error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
