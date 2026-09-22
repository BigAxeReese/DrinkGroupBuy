const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  runDueGroupBuySettlementJobs,
  settleGroupBuyActivity
} = require("../backend/payments/settlementService");
const {
  classifyLinePayCaptureError,
  inferLinePayPaymentState,
  refundLinePayPayment
} = require("../backend/payments/linePayService");
const {
  authorizeLinePayPaymentInDatabase,
  completeManualLinePayRepaymentInDatabase,
  createPendingLinePayAuthorization,
  createOrderRevision,
  getOrderDetail,
  getLinePayCaptureRetryState,
  getManualLinePayRepaymentContext,
  recordLinePayCaptureFailureInDatabase,
  voidLinePayAuthorizationInDatabase
} = require("../backend/db");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");
const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
const backupPath = path.join(
  os.tmpdir(),
  `drink-group-buy-dev-smoke-${process.pid}-${Date.now()}.sqlite`
);

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
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

function insertUser(database, id, role, now) {
  database.prepare(`
    INSERT INTO users (
      id,
      login_name,
      email,
      display_name,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id,
    `${id}-login`,
    `${id}@example.test`,
    id,
    now,
    now
  );

  database.prepare(`
    INSERT INTO user_roles (
      id,
      user_id,
      role,
      status,
      granted_at
    ) VALUES (?, ?, ?, 'active', ?)
  `).run(`role-${id}-${role}`, id, role, now);
}

function insertOrder(database, scenario, order, now) {
  database.prepare(`
    INSERT INTO orders (
      id,
      activity_id,
      customer_user_id,
      status,
      fallback_purchase_preference,
      total_cups,
      original_amount,
      payment_status,
      authorization_status,
      merchant_acceptance_status,
      pickup_status,
      submitted_at,
      updated_at
    ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, 'authorized', 'authorized', 'accepted', 'not_ready', ?, ?)
  `).run(
    order.id,
    scenario.activityId,
    order.customerUserId,
    order.fallbackPurchasePreference,
    order.totalCups,
    order.originalAmount,
    now,
    now
  );

  database.prepare(`
    INSERT INTO order_items (
      id,
      order_id,
      menu_item_id,
      item_name_snapshot,
      quantity,
      unit_price_snapshot,
      subtotal
    ) VALUES (?, ?, NULL, ?, ?, ?, ?)
  `).run(
    `order-item-${order.id}`,
    order.id,
    order.itemName,
    order.totalCups,
    Math.floor(order.originalAmount / order.totalCups),
    order.originalAmount
  );

  database.prepare(`
    INSERT INTO payment_authorizations (
      id,
      order_id,
      provider,
      status,
      original_amount,
      authorized_amount,
      provider_authorization_id,
      expires_at,
      authorized_at,
      created_at,
      updated_at
    ) VALUES (?, ?, 'mock_line_pay', 'authorized', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `payment-authorization-${order.id}`,
    order.id,
    order.originalAmount,
    order.originalAmount,
    `mock-line-pay-${order.id}`,
    scenario.expiresAt,
    now,
    now,
    now
  );
}

function insertScenario(database, scenario) {
  const now = new Date().toISOString();

  database.exec("BEGIN;");
  try {
    insertUser(database, scenario.adminUserId, "admin", now);
    insertUser(database, scenario.merchantUserId, "merchant", now);
    scenario.orders.forEach((order) => insertUser(database, order.customerUserId, "customer", now));

    database.prepare(`
      INSERT INTO merchants (
        id,
        name,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, 'active', ?, ?)
    `).run(scenario.merchantId, `${scenario.name} 商家`, now, now);

    database.prepare(`
      INSERT INTO merchant_users (
        id,
        merchant_id,
        user_id,
        permission_level,
        status,
        created_at
      ) VALUES (?, ?, ?, 'owner', 'active', ?)
    `).run(
      `merchant-user-${scenario.id}`,
      scenario.merchantId,
      scenario.merchantUserId,
      now
    );

    database.prepare(`
      INSERT INTO stores (
        id,
        merchant_id,
        name,
        address,
        business_status,
        latitude,
        longitude,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'open', 24.1511, 120.6817, ?, ?)
    `).run(
      scenario.storeId,
      scenario.merchantId,
      `${scenario.name} 店`,
      "台中市北區測試路 1 號",
      now,
      now
    );

    database.prepare(`
      INSERT INTO group_buy_activities (
        id,
        store_id,
        created_by_user_id,
        title,
        status,
        start_at,
        deadline_at,
        pickup_start_at,
        pickup_end_at,
        maximum_cups,
        withdrawal_lock_minutes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'recruiting', ?, ?, ?, ?, ?, 30, ?, ?)
    `).run(
      scenario.activityId,
      scenario.storeId,
      scenario.merchantUserId,
      scenario.name,
      scenario.startAt,
      scenario.deadlineAt,
      scenario.pickupStartAt,
      scenario.pickupEndAt,
      scenario.maximumCups,
      now,
      now
    );

    database.prepare(`
      INSERT INTO menu_items (
        id, store_id, name, category, description, base_price,
        is_available, created_at, updated_at
      ) VALUES (?, ?, '青山烏龍拿鐵', '奶茶', '結算 smoke 權威菜單品項', 65, 1, ?, ?)
    `).run(scenario.menuItemId, scenario.storeId, now, now);

    database.prepare(`
      INSERT INTO promotion_tiers (
        id,
        activity_id,
        target_cups,
        discount_amount,
        sort_order
      ) VALUES (?, ?, ?, ?, 1)
    `).run(
      scenario.tierId,
      scenario.activityId,
      scenario.targetCups,
      scenario.discountAmount
    );

    (scenario.extraTiers || []).forEach((tier, index) => {
      database.prepare(`
        INSERT INTO promotion_tiers (
          id,
          activity_id,
          target_cups,
          discount_amount,
          sort_order
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        `tier-${scenario.id}-extra-${index + 1}`,
        scenario.activityId,
        tier.targetCups,
        tier.discountAmount,
        index + 2
      );
    });

    scenario.orders.forEach((order) => insertOrder(database, scenario, order, now));

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function buildScenario(name, targetCups, orders, options = {}) {
  const id = `settlement-smoke-${name}-${randomUUID()}`;
  const now = Date.now();

  return {
    id,
    name: `結算 smoke ${name}`,
    adminUserId: `user-${id}-admin`,
    merchantUserId: `user-${id}-merchant`,
    merchantId: `merchant-${id}`,
    storeId: `store-${id}`,
    activityId: `activity-${id}`,
    menuItemId: `menu-item-${id}`,
    tierId: `tier-${id}`,
    targetCups,
    discountAmount: options.discountAmount ?? 30,
    maximumCups: options.maximumCups ?? 20,
    extraTiers: options.extraTiers || [],
    startAt: new Date(now - 60 * 60 * 1000).toISOString(),
    deadlineAt: new Date(now - 5 * 60 * 1000).toISOString(),
    pickupStartAt: new Date(now + 30 * 60 * 1000).toISOString(),
    pickupEndAt: new Date(now + 90 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    orders: orders.map((order, index) => ({
      ...order,
      id: `order-${id}-${index + 1}`,
      customerUserId: `user-${id}-customer-${index + 1}`
    }))
  };
}

function getOrderPaymentSummary(orderIds) {
  return withDatabase((database) => {
    const placeholders = orderIds.map(() => "?").join(", ");
    return database.prepare(`
      SELECT
        orders.id,
        orders.payment_status,
        orders.authorization_status,
        orders.final_amount,
        authorization.provider,
        authorization.status AS authorization_status_row,
        capture.status AS capture_status,
        capture.final_amount AS capture_final_amount,
        capture.capture_amount AS capture_amount
      FROM orders
      LEFT JOIN payment_authorizations authorization ON authorization.order_id = orders.id
      LEFT JOIN payment_captures capture ON capture.order_id = orders.id
      WHERE orders.id IN (${placeholders})
      ORDER BY orders.id ASC
    `).all(...orderIds);
  });
}

function insertMockPendingRevisionAuthorization(orderId, revision) {
  const providerTransactionId = `mock-line-pay-revision-${revision.id}`;
  withDatabase((database) => {
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO payment_authorizations (
        id,
        order_id,
        order_revision_id,
        provider,
        status,
        original_amount,
        authorized_amount,
        provider_authorization_id,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'mock_line_pay', 'pending', ?, 0, ?, ?, ?, ?)
    `).run(
      `payment-authorization-${revision.id}`,
      orderId,
      revision.id,
      revision.originalAmount,
      providerTransactionId,
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      now,
      now
    );
  });

  return providerTransactionId;
}

function insertMockPendingAuthorization(orderId, amount) {
  const providerTransactionId = `mock-line-pay-pending-${orderId}`;
  withDatabase((database) => {
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO payment_authorizations (
        id,
        order_id,
        provider,
        status,
        original_amount,
        authorized_amount,
        provider_authorization_id,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, ?, 'mock_line_pay', 'pending', ?, 0, ?, ?, ?, ?)
    `).run(
      `payment-authorization-pending-${orderId}`,
      orderId,
      amount,
      providerTransactionId,
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      now,
      now
    );

    database.prepare(`
      UPDATE orders
      SET payment_status = 'pending',
          authorization_status = 'pending'
      WHERE id = ?
    `).run(orderId);
  });

  return providerTransactionId;
}

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Development database not found: ${databasePath}`);
  }

  fs.copyFileSync(databasePath, backupPath);
  resetDatabaseForSmoke();

  try {
    const qualifiedScenario = buildScenario("qualified", 2, [
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 2,
        originalAmount: 130,
        itemName: "青山烏龍拿鐵"
      },
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 1,
        originalAmount: 65,
        itemName: "青山烏龍拿鐵"
      }
    ], {
      discountAmount: 31,
      maximumCups: 5,
      extraTiers: [
        {
          targetCups: 5,
          discountAmount: 80
        }
      ]
    });
    const failedScenario = buildScenario("failed", 5, [
      {
        fallbackPurchasePreference: "accept_original_price",
        totalCups: 2,
        originalAmount: 130,
        itemName: "青山烏龍拿鐵"
      },
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 1,
        originalAmount: 65,
        itemName: "青山烏龍拿鐵"
      }
    ]);
    const scheduledScenario = buildScenario("scheduled", 2, [
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 2,
        originalAmount: 130,
        itemName: "青山烏龍拿鐵"
      }
    ]);
    const revisionScenario = buildScenario("revision", 2, [
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 1,
        originalAmount: 65,
        itemName: "青山烏龍拿鐵"
      }
    ]);
    revisionScenario.deadlineAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    revisionScenario.pickupStartAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    revisionScenario.pickupEndAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const cutoffScenario = buildScenario("cutoff", 2, [
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 1,
        originalAmount: 65,
        itemName: "青山烏龍拿鐵"
      }
    ]);
    cutoffScenario.deadlineAt = new Date(Date.now() + 60 * 1000).toISOString();
    cutoffScenario.pickupStartAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    cutoffScenario.pickupEndAt = new Date(Date.now() + 75 * 60 * 1000).toISOString();
    const retryScenario = buildScenario("capture-retry", 1, [
      {
        fallbackPurchasePreference: "decline_original_price",
        totalCups: 1,
        originalAmount: 65,
        itemName: "青山烏龍拿鐵"
      }
    ]);
    retryScenario.deadlineAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    retryScenario.pickupStartAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    retryScenario.pickupEndAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    withDatabase((database) => {
      insertScenario(database, qualifiedScenario);
      insertScenario(database, failedScenario);
      insertScenario(database, scheduledScenario);
      insertScenario(database, revisionScenario);
      insertScenario(database, cutoffScenario);
      insertScenario(database, retryScenario);
    });

    const qualifiedResult = await settleGroupBuyActivity({
      activityId: qualifiedScenario.activityId,
      actorUserId: qualifiedScenario.adminUserId,
      force: true
    });
    const failedResult = await settleGroupBuyActivity({
      activityId: failedScenario.activityId,
      actorUserId: failedScenario.adminUserId,
      force: true
    });
    const scheduledResult = await runDueGroupBuySettlementJobs({
      actorUserId: scheduledScenario.adminUserId,
      limit: 10
    });

    assert(!qualifiedResult.error, "qualified settlement should not fail", qualifiedResult);
    assert(qualifiedResult.plan.outcome === "qualified", "qualified settlement outcome mismatch", qualifiedResult.plan);
    assert(qualifiedResult.capturedOrderCount === 2, "qualified settlement should capture two orders", qualifiedResult);
    assert(qualifiedResult.voidedOrderCount === 0, "qualified settlement should not void orders", qualifiedResult);

    assert(!failedResult.error, "failed settlement should not fail", failedResult);
    assert(failedResult.plan.outcome === "failed", "failed settlement outcome mismatch", failedResult.plan);
    assert(failedResult.capturedOrderCount === 1, "failed settlement should capture one fallback order", failedResult);
    assert(failedResult.voidedOrderCount === 1, "failed settlement should void one declined fallback order", failedResult);

    const qualifiedSummary = getOrderPaymentSummary(qualifiedScenario.orders.map((order) => order.id));
    const failedSummary = getOrderPaymentSummary(failedScenario.orders.map((order) => order.id));

    assert(
      qualifiedSummary.every((row) => row.provider === "mock_line_pay" && row.payment_status === "captured"),
      "qualified orders should be captured through mock_line_pay",
      qualifiedSummary
    );
    assert(
      qualifiedSummary.find((row) => row.id === qualifiedScenario.orders[0].id)?.capture_amount === 110
        && qualifiedSummary.find((row) => row.id === qualifiedScenario.orders[1].id)?.capture_amount === 55,
      "qualified settlement should split total discount by actual authorized cups and keep remainder undistributed",
      qualifiedSummary
    );
    assert(
      failedSummary.some((row) => row.payment_status === "captured")
        && failedSummary.some((row) => row.payment_status === "authorization_voided"),
      "failed settlement should contain one captured and one voided order",
      failedSummary
    );
    assert(
      scheduledResult.results.some((entry) => (
        entry.job?.resourceId === scheduledScenario.activityId
        && entry.job?.status === "succeeded"
      )),
      "scheduler settlement should settle the scheduled due activity",
      scheduledResult
    );
    const scheduledSummary = getOrderPaymentSummary(scheduledScenario.orders.map((order) => order.id));
    assert(
      scheduledSummary.every((row) => row.provider === "mock_line_pay" && row.payment_status === "captured"),
      "scheduled due activity should be captured through mock_line_pay",
      scheduledSummary
    );

    const refundOrder = qualifiedScenario.orders[0];
    const refundIdempotencyKey = `settlement-smoke-refund-${refundOrder.id}`;
    const refundResult = await refundLinePayPayment({
      authUser: {
        id: qualifiedScenario.adminUserId,
        roles: ["admin"]
      },
      body: {
        orderId: refundOrder.id,
        provider: "mock_line_pay",
        idempotencyKey: refundIdempotencyKey,
        reason: "settlement_smoke_full_refund"
      }
    });
    assert(refundResult?.status === "refunded", "captured order should be refundable", refundResult);
    assert(refundResult.fullyRefunded, "full refund should mark the payment fully refunded", refundResult);
    assert(
      getOrderDetail(refundOrder.id).paymentStatus === "refunded",
      "fully refunded order should update payment status",
      getOrderDetail(refundOrder.id)
    );
    const repeatedRefundResult = await refundLinePayPayment({
      authUser: {
        id: qualifiedScenario.adminUserId,
        roles: ["admin"]
      },
      body: {
        orderId: refundOrder.id,
        provider: "mock_line_pay",
        idempotencyKey: refundIdempotencyKey,
        reason: "settlement_smoke_full_refund"
      }
    });
    assert(repeatedRefundResult?.idempotent, "duplicate refund key should return idempotently", repeatedRefundResult);
    const refundRecordCount = withDatabase((database) => database.prepare(`
      SELECT COUNT(*) AS count
      FROM payment_refunds
      WHERE order_id = ?
        AND status = 'refunded'
    `).get(refundOrder.id).count);
    assert(refundRecordCount === 1, "duplicate refund must not create another refunded row", { refundRecordCount });

    const revisionOrder = revisionScenario.orders[0];
    const revisionResult = createOrderRevision({
      orderId: revisionOrder.id,
      customerUserId: revisionOrder.customerUserId,
      fallbackPurchasePreference: "accept_original_price",
      items: [
        {
          menuItemId: revisionScenario.menuItemId,
          itemName: "青山烏龍拿鐵",
          quantity: 2,
          unitPrice: 65,
          subtotal: 130
        }
      ]
    });
    assert(!revisionResult.error, "order revision should be created", revisionResult);
    assert(revisionResult.revision.status === "pending_authorization", "order revision should wait for authorization", revisionResult);
    assert(getOrderDetail(revisionOrder.id).totalCups === 1, "original order should remain unchanged before revision authorization");

    const revisionTransactionId = insertMockPendingRevisionAuthorization(revisionOrder.id, revisionResult.revision);
    const revisionAuthorizationResult = authorizeLinePayPaymentInDatabase({
      orderId: revisionOrder.id,
      orderRevisionId: revisionResult.revision.id,
      provider: "mock_line_pay",
      providerTransactionId: revisionTransactionId,
      amount: revisionResult.revision.originalAmount,
      providerPayload: { returnCode: "0000", returnMessage: "mock_revision_confirm" }
    });
    assert(
      revisionAuthorizationResult?.appliedOrderRevision?.status === "applied",
      "revision authorization should apply the order revision",
      revisionAuthorizationResult
    );

    const originalAuthorizationTransactionId = `mock-line-pay-${revisionOrder.id}`;
    const originalVoidResult = voidLinePayAuthorizationInDatabase({
      orderId: revisionOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: originalAuthorizationTransactionId,
      reason: "revision_smoke_void_original_authorization"
    });
    assert(originalVoidResult.status === "authorization_voided", "old authorization should be voided after revision apply", originalVoidResult);

    const revisedOrderDetail = getOrderDetail(revisionOrder.id);
    assert(revisedOrderDetail.totalCups === 2, "revised order should use revision total cups", revisedOrderDetail);
    assert(revisedOrderDetail.originalAmount === 130, "revised order should use revision amount", revisedOrderDetail);
    assert(revisedOrderDetail.paymentStatus === "authorized", "revised order should remain authorized after old authorization void", revisedOrderDetail);
    assert(!revisedOrderDetail.pendingRevision, "applied revision should no longer be pending", revisedOrderDetail);

    const cutoffOrder = cutoffScenario.orders[0];
    const cutoffTransactionId = insertMockPendingAuthorization(cutoffOrder.id, cutoffOrder.originalAmount);
    const cutoffAuthorizationResult = authorizeLinePayPaymentInDatabase({
      orderId: cutoffOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: cutoffTransactionId,
      amount: cutoffOrder.originalAmount,
      now: new Date(Date.parse(cutoffScenario.deadlineAt) + 1000).toISOString(),
      providerPayload: { returnCode: "0000", returnMessage: "mock_cutoff_confirm" }
    });
    assert(
      cutoffAuthorizationResult?.error === "authorization_confirmed_after_deadline",
      "authorization confirmed after deadline should be rejected",
      cutoffAuthorizationResult
    );
    assert(
      getOrderDetail(cutoffOrder.id).paymentStatus === "pending",
      "deadline-rejected order should not become authorized",
      getOrderDetail(cutoffOrder.id)
    );

    const retryOrder = retryScenario.orders[0];
    const retryTransactionId = `mock-line-pay-${retryOrder.id}`;
    const retryStartedAt = Date.now();
    const recordRetryFailure = (attemptOffsetMs) => recordLinePayCaptureFailureInDatabase({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: retryTransactionId,
      amount: retryOrder.originalAmount,
      finalAmount: retryOrder.originalAmount,
      reason: "settlement_smoke_retryable_capture_failed",
      retryable: true,
      maxAttempts: 3,
      retryIntervalMs: 30_000,
      now: new Date(retryStartedAt + attemptOffsetMs).toISOString(),
      providerPayload: { returnCode: "9000", returnMessage: "mock temporary error" }
    });
    const firstRetryFailure = recordRetryFailure(0);
    assert(firstRetryFailure.status === "retry_pending", "first capture failure should schedule retry", firstRetryFailure);
    assert(firstRetryFailure.attemptCount === 1, "first capture failure attempt count mismatch", firstRetryFailure);

    const retryPendingSettlement = await settleGroupBuyActivity({
      activityId: retryScenario.activityId,
      actorUserId: retryScenario.adminUserId,
      force: true,
      now: new Date(retryStartedAt + 29_000).toISOString()
    });
    assert(
      retryPendingSettlement.error === "settlement_retry_pending",
      "settlement should wait until the 30-second retry interval passes",
      retryPendingSettlement
    );
    assert(
      retryPendingSettlement.pendingRetries?.[0]?.attemptCount === 1,
      "pending settlement should expose the current capture attempt count",
      retryPendingSettlement
    );

    const earlyRetryState = getLinePayCaptureRetryState({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: retryTransactionId,
      maxAttempts: 3,
      now: new Date(retryStartedAt + 29_000).toISOString()
    });
    assert(!earlyRetryState.retryDue, "retry should not be due before 30 seconds", earlyRetryState);

    const dueRetryState = getLinePayCaptureRetryState({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: retryTransactionId,
      maxAttempts: 3,
      now: new Date(retryStartedAt + 30_000).toISOString()
    });
    assert(dueRetryState.retryDue, "retry should be due at 30 seconds", dueRetryState);

    const secondRetryFailure = recordRetryFailure(30_000);
    const thirdRetryFailure = recordRetryFailure(60_000);
    const fourthRetryFailure = recordRetryFailure(90_000);
    assert(secondRetryFailure.attemptCount === 2, "second capture failure attempt count mismatch", secondRetryFailure);
    assert(thirdRetryFailure.status === "retry_exhausted", "third capture failure should exhaust retries", thirdRetryFailure);
    assert(thirdRetryFailure.attemptCount === 3, "third capture failure attempt count mismatch", thirdRetryFailure);
    assert(fourthRetryFailure.status === "retry_exhausted", "fourth capture call should remain exhausted", fourthRetryFailure);

    const retryCaptureCount = withDatabase((database) => database.prepare(`
      SELECT COUNT(*) AS count
      FROM payment_captures
      WHERE order_id = ?
        AND status = 'failed'
    `).get(retryOrder.id).count);
    assert(retryCaptureCount === 3, "retry exhaustion must not create a fourth capture row", { retryCaptureCount });
    assert(
      getOrderDetail(retryOrder.id).paymentStatus === "failed",
      "retry-exhausted order should become payment failed",
      getOrderDetail(retryOrder.id)
    );
    assert(
      classifyLinePayCaptureError({ linePayPayload: { returnCode: "9000" } }).retryable,
      "LINE Pay temporary errors should be retryable"
    );
    assert(
      !classifyLinePayCaptureError({ linePayPayload: { returnCode: "1153" } }).retryable,
      "LINE Pay amount mismatch should not be retryable"
    );
    assert(
      !classifyLinePayCaptureError({ linePayPayload: { returnCode: "1150" } }).retryable,
      "LINE Pay missing transaction should not be retryable"
    );
    assert(
      !classifyLinePayCaptureError({ linePayPayload: { returnCode: "1199" } }).retryable,
      "LINE Pay auto-cancel internal error should not be retryable"
    );
    assert(
      !classifyLinePayCaptureError({ linePayPayload: { returnCode: "1280" } }).retryable,
      "LINE Pay auto-cancel card errors should not be retryable"
    );

    const repaymentEligibleAt = new Date(retryStartedAt + 90_000).toISOString();
    const repaymentContext = getManualLinePayRepaymentContext(retryOrder.id, {
      now: repaymentEligibleAt
    });
    assert(repaymentContext?.eligible, "retry-exhausted order should allow manual repayment", repaymentContext);
    assert(
      repaymentContext.finalAmount === retryOrder.originalAmount,
      "manual repayment should use the settled final amount",
      repaymentContext
    );
    const expiredRepaymentContext = getManualLinePayRepaymentContext(retryOrder.id, {
      now: new Date(Date.parse(retryScenario.pickupStartAt) - 14 * 60 * 1000).toISOString()
    });
    assert(
      expiredRepaymentContext?.reason === "manual_repayment_expired",
      "manual repayment should close 15 minutes before pickup",
      expiredRepaymentContext
    );

    const repaymentTransactionId = `mock-line-pay-repayment-${retryOrder.id}`;
    const pendingRepayment = createPendingLinePayAuthorization({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: repaymentTransactionId,
      paymentFlow: "direct_repayment",
      amount: repaymentContext.finalAmount
    });
    assert(
      pendingRepayment?.paymentFlow === "direct_repayment" && pendingRepayment.status === "pending",
      "manual repayment should persist as a separate pending payment flow",
      pendingRepayment
    );
    const repaymentPendingContext = getManualLinePayRepaymentContext(retryOrder.id, {
      now: repaymentEligibleAt
    });
    assert(
      repaymentPendingContext?.reason === "repayment_already_pending",
      "a second manual repayment request should be blocked while one is pending",
      repaymentPendingContext
    );

    const completedRepayment = completeManualLinePayRepaymentInDatabase({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: repaymentTransactionId,
      providerCaptureId: repaymentTransactionId,
      amount: repaymentContext.finalAmount,
      now: new Date(retryStartedAt + 91_000).toISOString(),
      providerPayload: { returnCode: "0000", returnMessage: "mock direct repayment" }
    });
    assert(completedRepayment?.status === "captured", "manual repayment should be captured", completedRepayment);
    assert(
      completedRepayment.order?.paymentStatus === "captured",
      "manual repayment should update the order payment status",
      completedRepayment
    );
    const repeatedRepayment = completeManualLinePayRepaymentInDatabase({
      orderId: retryOrder.id,
      provider: "mock_line_pay",
      providerTransactionId: repaymentTransactionId,
      amount: repaymentContext.finalAmount,
      now: new Date(retryStartedAt + 92_000).toISOString()
    });
    assert(repeatedRepayment?.status === "captured", "manual repayment confirm should be idempotent", repeatedRepayment);
    const repaymentCaptureCount = withDatabase((database) => database.prepare(`
      SELECT COUNT(*) AS count
      FROM payment_captures
      WHERE payment_authorization_id = ?
        AND status = 'captured'
    `).get(pendingRepayment.id).count);
    assert(repaymentCaptureCount === 1, "manual repayment must create only one captured record", { repaymentCaptureCount });
    assert(
      inferLinePayPaymentState({
        info: [{ transactionType: "PAYMENT", payStatus: "AUTHORIZATION" }]
      }) === "authorized",
      "explicit authorization status must not be treated as captured"
    );
    assert(
      inferLinePayPaymentState({
        info: [{ transactionType: "PAYMENT", payStatus: "VOIDED_AUTHORIZATION" }]
      }) === "not_capturable",
      "voided authorization must not be retried"
    );
    console.log("Settlement smoke passed");
    console.log(`qualified: captured=${qualifiedResult.capturedOrderCount}, voided=${qualifiedResult.voidedOrderCount}`);
    console.log(`failed: captured=${failedResult.capturedOrderCount}, voided=${failedResult.voidedOrderCount}`);
    console.log(`scheduler: settled=${scheduledResult.succeededCount}, failed=${scheduledResult.failedCount}`);
    console.log("revision: applied=1, old_authorization_voided=1");
    console.log("cutoff: rejected_after_deadline=1");
    console.log("capture retry: interval=30s, attempts=3, fourth_attempt_suppressed=1");
    console.log("manual repayment: cutoff=15m, captured=1, duplicate_capture_suppressed=1");
    console.log("refund: full_refund=1, duplicate_refund_suppressed=1");
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
