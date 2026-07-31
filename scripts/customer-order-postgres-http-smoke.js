"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { Pool } = require("pg");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const {
  createPaymentAuthorizationRequestRepository,
} = require("../backend/database/repositories/paymentAuthorizationRequestRepository");
const {
  createPaymentAuthorizationConfirmRepository,
} = require("../backend/database/repositories/paymentAuthorizationConfirmRepository");

const repoRoot = path.join(__dirname, "..");
const port = 39950 + (process.pid % 100);
const baseUrl = `http://127.0.0.1:${port}`;
const proofId = randomUUID();
const activityId = `activity-order-proof-${proofId}`;
const tierId = `tier-order-proof-${proofId}`;
let backend;
let backendOutput = "";
let lockClient;
let lockTransactionOpen = false;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL customer order HTTP smoke skipped: DATABASE_URL is not set.");
    return;
  }

  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const lockPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const fixture = await createProofFixture(database);
    backend = spawn(process.execPath, [path.join(repoRoot, "backend", "server.js")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        AUTH_DEV_MODE: "true",
        AUTH_PROFILE_READ_RUNTIME: "postgres",
        STORE_MENU_READ_RUNTIME: "postgres",
        GROUP_BUY_ACTIVITY_READ_RUNTIME: "postgres",
        GROUP_BUY_ACTIVITY_WRITE_RUNTIME: "postgres",
        MERCHANT_MENU_RUNTIME: "postgres",
        CUSTOMER_ORDER_WRITE_RUNTIME: "postgres",
        CUSTOMER_ORDER_READ_RUNTIME: "postgres",
        PAYMENT_AUTHORIZATION_REQUEST_RUNTIME: "postgres",
        PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME: "postgres",
        LINE_PAY_CAPTURE_SEPARATED: "false",
        AUTH_SESSION_SECRET: "postgres-customer-order-http-smoke-secret",
        PAYMENT_RECONCILIATION_ENABLED: "false",
        SETTLEMENT_SCHEDULER_ENABLED: "false",
        PICKUP_EXPIRATION_SCHEDULER_ENABLED: "false",
      },
      windowsHide: true,
    });
    backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
    backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

    await waitForBackend();
    const [firstToken, secondToken, thirdToken] = await Promise.all(
      fixture.customerIds.map(createCustomerSession)
    );
    const merchantToken = await createCustomerSession(fixture.merchantUserId);

    lockClient = await lockPool.connect();
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    await lockClient.query(
      "SELECT id FROM group_buy_activities WHERE id = $1 FOR UPDATE",
      [activityId]
    );

    let requestSettled = false;
    const createPromise = postOrder(firstToken, fixture.orderBody)
      .finally(() => { requestSettled = true; });
    await delay(300);
    assert.equal(requestSettled, false, "Order create did not wait for activity row lock");

    await lockClient.query("COMMIT");
    lockTransactionOpen = false;
    const created = await createPromise;
    assert.equal(created.response.status, 201, created.text);
    const createdOrder = JSON.parse(created.text).order;
    assert.equal(createdOrder.activityId, activityId);
    assert.equal(createdOrder.customerUserId, fixture.customerIds[0]);
    assert.equal(createdOrder.totalCups, 1);
    assert.equal(createdOrder.originalAmount, fixture.unitPrice);
    assert.equal(createdOrder.items[0].customizations.length, fixture.optionIds.length);

    const detailResponse = await fetch(`${baseUrl}/api/orders/${createdOrder.id}`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    const detailText = await detailResponse.text();
    assert.equal(detailResponse.status, 200, detailText);
    const detailOrder = JSON.parse(detailText).order;
    assert.equal(detailOrder.id, createdOrder.id);
    assert.equal(detailOrder.items[0].customizations.length, fixture.optionIds.length);

    const customerListResponse = await fetch(`${baseUrl}/api/customers/me/orders`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    const customerListText = await customerListResponse.text();
    assert.equal(customerListResponse.status, 200, customerListText);
    assert.equal(JSON.parse(customerListText).orders[0].id, createdOrder.id);

    const merchantListResponse = await fetch(
      `${baseUrl}/api/merchant/stores/store-001/orders`,
      { headers: { Authorization: `Bearer ${merchantToken}` } }
    );
    const merchantListText = await merchantListResponse.text();
    assert.equal(merchantListResponse.status, 200, merchantListText);
    assert.equal(JSON.parse(merchantListText).orders[0].id, createdOrder.id);

    const paymentRequestResponse = await fetch(
      `${baseUrl}/api/payments/line-pay/request`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firstToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: createdOrder.id,
          amount: createdOrder.originalAmount,
          products: [],
        }),
      }
    );
    const paymentRequestText = await paymentRequestResponse.text();
    assert.equal(paymentRequestResponse.status, 409, paymentRequestText);
    assert.equal(
      JSON.parse(paymentRequestText).status,
      "capture_separated_not_enabled"
    );

    const authorizationRepository = createPaymentAuthorizationRequestRepository({
      runtime: "postgres",
      database,
    });
    const pendingAuthorization = await authorizationRepository.createPendingAuthorization({
      orderId: createdOrder.id,
      amount: createdOrder.originalAmount,
      providerTransactionId: `transaction-order-proof-${proofId}`,
      now: new Date().toISOString(),
    });
    assert.equal(pendingAuthorization.orderId, createdOrder.id);
    assert.equal(pendingAuthorization.status, "pending");
    const paymentPersistence = await database.query(`
      SELECT
        (SELECT COUNT(*)::integer
         FROM payment_authorizations
         WHERE id = $1) AS authorization_count,
        (SELECT COUNT(*)::integer
         FROM status_history
         WHERE resource_type = 'payment_authorization'
           AND resource_id = $1) AS history_count,
        (SELECT COUNT(*)::integer
         FROM audit_logs
         WHERE resource_type = 'payment_authorization'
           AND resource_id = $1) AS audit_count,
        (SELECT COUNT(*)::integer
         FROM payment_reliability_jobs
         WHERE resource_type = 'payment_authorization'
           AND resource_id = $1) AS job_count
    `, [pendingAuthorization.id]);
    assert.deepEqual(paymentPersistence.rows[0], {
      authorization_count: 1,
      history_count: 1,
      audit_count: 1,
      job_count: 1,
    });

    const confirmRepository = createPaymentAuthorizationConfirmRepository({
      runtime: "postgres",
      database,
      env: { LINE_PAY_CAPTURE_SEPARATED: "false", LINE_PAY_CURRENCY: "TWD" },
    });
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    await lockClient.query(
      "SELECT id FROM group_buy_activities WHERE id = $1 FOR UPDATE",
      [activityId]
    );
    let confirmSettled = false;
    const confirmPromise = confirmRepository.confirmAuthorization({
      orderId: createdOrder.id,
      providerTransactionId: pendingAuthorization.providerAuthorizationId,
      amount: createdOrder.originalAmount,
      providerPayload: { returnCode: "0000" },
      now: new Date().toISOString(),
    }).finally(() => { confirmSettled = true; });
    await delay(300);
    assert.equal(confirmSettled, false, "Authorization confirm did not wait for activity row lock");
    await lockClient.query("COMMIT");
    lockTransactionOpen = false;
    const confirmedAuthorization = await confirmPromise;
    assert.equal(confirmedAuthorization.status, "authorized");
    assert.equal(confirmedAuthorization.authorizedAmount, createdOrder.originalAmount);

    const confirmedPersistence = await database.query(`
      SELECT
        payment_auth.status,
        order_record.payment_status,
        order_record.authorization_status,
        order_record.merchant_acceptance_status,
        (SELECT COUNT(*)::integer FROM payment_provider_events
         WHERE resource_type = 'authorization' AND resource_id = payment_auth.id) AS event_count,
        (SELECT COUNT(*)::integer FROM status_history
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id) AS history_count,
        (SELECT COUNT(*)::integer FROM audit_logs
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id) AS audit_count,
        (SELECT status FROM payment_reliability_jobs
         WHERE resource_type = 'payment_authorization' AND resource_id = payment_auth.id
         LIMIT 1) AS job_status
      FROM payment_authorizations payment_auth
      JOIN orders order_record ON order_record.id = payment_auth.order_id
      WHERE payment_auth.id = $1
    `, [pendingAuthorization.id]);
    assert.deepEqual(confirmedPersistence.rows[0], {
      status: "authorized",
      payment_status: "authorized",
      authorization_status: "authorized",
      merchant_acceptance_status: "accepted",
      event_count: 1,
      history_count: 2,
      audit_count: 2,
      job_status: "succeeded",
    });

    const duplicate = await postOrder(firstToken, fixture.orderBody);
    assert.equal(duplicate.response.status, 409, duplicate.text);
    assert.equal(JSON.parse(duplicate.text).orderId, createdOrder.id);

    const staleBody = structuredClone(fixture.orderBody);
    staleBody.items[0].unitPrice -= 1;
    staleBody.items[0].subtotal -= 1;
    const stale = await postOrder(thirdToken, staleBody);
    assert.equal(stale.response.status, 409, stale.text);
    assert.equal(JSON.parse(stale.text).error, "order_price_changed");

    const capacityBody = structuredClone(fixture.orderBody);
    capacityBody.items[0].quantity = 2;
    capacityBody.items[0].subtotal = fixture.unitPrice * 2;
    const capacity = await postOrder(secondToken, capacityBody);
    assert.equal(capacity.response.status, 409, capacity.text);
    const capacityPayload = JSON.parse(capacity.text);
    assert.equal(capacityPayload.maximumCups, 2);
    assert.equal(capacityPayload.authorizedCups, 1);
    assert.equal(capacityPayload.requestedCups, 2);

    const persisted = await database.query(`
      SELECT
        order_record.id,
        COUNT(DISTINCT item.id)::integer AS item_count,
        COUNT(DISTINCT customization.id)::integer AS customization_count,
        COUNT(DISTINCT history.id)::integer AS history_count,
        COUNT(DISTINCT audit_log.id)::integer AS audit_count
      FROM orders order_record
      LEFT JOIN order_items item ON item.order_id = order_record.id
      LEFT JOIN order_item_customizations customization
        ON customization.order_item_id = item.id
      LEFT JOIN status_history history
        ON history.resource_type = 'order' AND history.resource_id = order_record.id
      LEFT JOIN audit_logs audit_log
        ON audit_log.resource_type = 'order' AND audit_log.resource_id = order_record.id
      WHERE order_record.id = $1
      GROUP BY order_record.id
    `, [createdOrder.id]);
    assert.deepEqual(persisted.rows[0], {
      id: createdOrder.id,
      item_count: 1,
      customization_count: fixture.optionIds.length,
      history_count: 1,
      audit_count: 1,
    });
    console.log("PostgreSQL order write/read, payment request, and authorization confirm proof passed.");
  } finally {
    if (lockTransactionOpen && lockClient) await lockClient.query("ROLLBACK");
    if (lockClient) lockClient.release();
    if (backend && backend.exitCode == null) backend.kill();
    await cleanupProofData(database);
    await lockPool.end();
    await database.close();
  }
}

async function createProofFixture(database) {
  const merchantResult = await database.query(`
    SELECT user_id
    FROM merchant_users
    WHERE store_id = 'store-001'
      AND status = 'active'
    LIMIT 1
  `);
  const customersResult = await database.query(`
    SELECT user_account.id
    FROM users user_account
    JOIN user_roles user_role ON user_role.user_id = user_account.id
    WHERE user_role.role = 'customer'
      AND user_role.status = 'active'
      AND user_account.status = 'active'
    ORDER BY user_account.id
    LIMIT 3
  `);
  assert.equal(customersResult.rows.length, 3, "Three active PostgreSQL customers are required");

  const menuResult = await database.query(`
    SELECT id, base_price
    FROM menu_items
    WHERE store_id = 'store-001'
      AND is_available = true
    ORDER BY id
    LIMIT 1
  `);
  const menuItem = menuResult.rows[0];
  assert.ok(menuItem, "An active store-001 menu item is required");
  const [rulesResult, optionsResult] = await Promise.all([
    database.query(`
      SELECT option_type, min_selections
      FROM menu_item_customization_rules
      WHERE menu_item_id = $1
      ORDER BY option_type
    `, [menuItem.id]),
    database.query(`
      SELECT id, option_type, price_delta
      FROM customization_options
      WHERE menu_item_id = $1
        AND is_available = true
      ORDER BY option_type, sort_order, id
    `, [menuItem.id]),
  ]);
  const selectedOptions = [];
  for (const rule of rulesResult.rows) {
    selectedOptions.push(...optionsResult.rows
      .filter((option) => option.option_type === rule.option_type)
      .slice(0, Number(rule.min_selections)));
  }
  const unitPrice = Number(menuItem.base_price)
    + selectedOptions.reduce((sum, option) => sum + Number(option.price_delta), 0);

  const start = new Date(Date.now() - 10 * 60 * 1000);
  const deadline = new Date(Date.now() + 60 * 60 * 1000);
  const pickupStart = new Date(deadline.getTime() + 30 * 60 * 1000);
  const pickupEnd = new Date(pickupStart.getTime() + 60 * 60 * 1000);
  await database.query(`
    INSERT INTO group_buy_activities (
      id, store_id, created_by_user_id, title, status,
      start_at, deadline_at, pickup_start_at, pickup_end_at,
      maximum_cups, withdrawal_lock_minutes, created_at, updated_at
    ) VALUES (
      $1, 'store-001', $2, 'PostgreSQL Customer Order Proof', 'recruiting',
      $3, $4, $5, $6, 2, 30, $3, $3
    )
  `, [
    activityId,
    merchantResult.rows[0].user_id,
    start.toISOString(),
    deadline.toISOString(),
    pickupStart.toISOString(),
    pickupEnd.toISOString(),
  ]);
  await database.query(`
    INSERT INTO promotion_tiers (
      id, activity_id, target_cups, discount_amount, sort_order
    ) VALUES ($1, $2, 2, 2, 0)
  `, [tierId, activityId]);

  return {
    customerIds: customersResult.rows.map((row) => row.id),
    merchantUserId: merchantResult.rows[0].user_id,
    optionIds: selectedOptions.map((option) => option.id),
    unitPrice,
    orderBody: {
      activityId,
      fallbackPurchasePreference: "decline_original_price",
      items: [{
        menuItemId: menuItem.id,
        quantity: 1,
        unitPrice,
        subtotal: unitPrice,
        customizationOptionIds: selectedOptions.map((option) => option.id),
      }],
    },
  };
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Backend may still be starting.
    }
    await delay(250);
  }
  throw new Error(`Backend did not become healthy.\n${backendOutput}`);
}

async function createCustomerSession(userId) {
  const response = await fetch(`${baseUrl}/api/auth/dev-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text).token;
}

async function postOrder(token, body) {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, text: await response.text() };
}

async function cleanupProofData(database) {
  const orderIdsResult = await database.query(
    "SELECT id FROM orders WHERE activity_id = $1",
    [activityId]
  );
  const orderIds = orderIdsResult.rows.map((row) => row.id);
  const authorizationIds = [];
  if (orderIds.length > 0) {
    const authorizationIdsResult = await database.query(
      "SELECT id FROM payment_authorizations WHERE order_id = ANY($1::text[])",
      [orderIds]
    );
    authorizationIds.push(...authorizationIdsResult.rows.map((row) => row.id));
    if (authorizationIds.length > 0) {
      await database.query(`
        DELETE FROM payment_reliability_jobs
        WHERE resource_type = 'payment_authorization'
          AND resource_id = ANY($1::text[])
      `, [authorizationIds]);
      await database.query(`
        DELETE FROM payment_provider_events
        WHERE resource_type = 'authorization'
          AND resource_id = ANY($1::text[])
      `, [authorizationIds]);
      await database.query(`
        DELETE FROM status_history
        WHERE resource_type = 'payment_authorization'
          AND resource_id = ANY($1::text[])
      `, [authorizationIds]);
      await database.query(`
        DELETE FROM audit_logs
        WHERE resource_type = 'payment_authorization'
          AND resource_id = ANY($1::text[])
      `, [authorizationIds]);
      await database.query(
        "DELETE FROM payment_authorizations WHERE id = ANY($1::text[])",
        [authorizationIds]
      );
    }
    await database.query(`
      DELETE FROM status_history
      WHERE resource_type = 'order'
        AND resource_id = ANY($1::text[])
    `, [orderIds]);
    await database.query(`
      DELETE FROM audit_logs
      WHERE resource_type = 'order'
        AND resource_id = ANY($1::text[])
    `, [orderIds]);
    await database.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
  }
  await database.query("DELETE FROM group_buy_activities WHERE id = $1", [activityId]);
  const cleanup = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM orders WHERE activity_id = $1) AS order_count,
      (SELECT COUNT(*)::integer FROM group_buy_activities WHERE id = $1) AS activity_count,
      (SELECT COUNT(*)::integer FROM audit_logs
       WHERE resource_type = 'order' AND resource_id = ANY($2::text[])) AS audit_count,
      (SELECT COUNT(*)::integer FROM payment_authorizations
       WHERE order_id = ANY($2::text[])) AS authorization_count,
      (SELECT COUNT(*)::integer FROM payment_reliability_jobs
       WHERE resource_type = 'payment_authorization'
         AND resource_id = ANY($3::text[])) AS proof_job_count,
      (SELECT COUNT(*)::integer FROM payment_provider_events
       WHERE resource_type = 'authorization'
         AND resource_id = ANY($3::text[])) AS provider_event_count
  `, [activityId, orderIds, authorizationIds]);
  assert.deepEqual(cleanup.rows[0], {
    order_count: 0,
    activity_count: 0,
    audit_count: 0,
    authorization_count: 0,
    proof_job_count: 0,
    provider_event_count: 0,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
