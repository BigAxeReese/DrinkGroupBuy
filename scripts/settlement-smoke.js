const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  runDueGroupBuySettlements,
  settleGroupBuyActivity
} = require("../backend/payments/settlementService");
const {
  authorizeLinePayPaymentInDatabase,
  createOrderRevision,
  getOrderDetail,
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

    scenario.orders.forEach((order) => insertOrder(database, scenario, order, now));

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function buildScenario(name, targetCups, orders) {
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
    tierId: `tier-${id}`,
    targetCups,
    discountAmount: 30,
    maximumCups: 20,
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
        capture.final_amount AS capture_final_amount
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

async function main() {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Development database not found: ${databasePath}`);
  }

  fs.copyFileSync(databasePath, backupPath);
  resetDatabaseForSmoke();

  try {
    const qualifiedScenario = buildScenario("qualified", 3, [
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
    ]);
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

    withDatabase((database) => {
      insertScenario(database, qualifiedScenario);
      insertScenario(database, failedScenario);
      insertScenario(database, scheduledScenario);
      insertScenario(database, revisionScenario);
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
    const scheduledResult = await runDueGroupBuySettlements({
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
      failedSummary.some((row) => row.payment_status === "captured")
        && failedSummary.some((row) => row.payment_status === "authorization_voided"),
      "failed settlement should contain one captured and one voided order",
      failedSummary
    );
    assert(
      scheduledResult.results.some((result) => (
        result.activityId === scheduledScenario.activityId
        && result.status === "settled"
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

    const revisionOrder = revisionScenario.orders[0];
    const revisionResult = createOrderRevision({
      orderId: revisionOrder.id,
      customerUserId: revisionOrder.customerUserId,
      fallbackPurchasePreference: "accept_original_price",
      items: [
        {
          itemName: "青山烏龍拿鐵",
          quantity: 2,
          unitPrice: 65,
          subtotal: 130,
          sweetness: "半糖",
          ice: "少冰",
          toppings: []
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

    console.log("Settlement smoke passed");
    console.log(`qualified: captured=${qualifiedResult.capturedOrderCount}, voided=${qualifiedResult.voidedOrderCount}`);
    console.log(`failed: captured=${failedResult.capturedOrderCount}, voided=${failedResult.voidedOrderCount}`);
    console.log(`scheduler: settled=${scheduledResult.settledCount}, failed=${scheduledResult.failedCount}`);
    console.log("revision: applied=1, old_authorization_voided=1");
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
