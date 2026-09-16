"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { Pool } = require("pg");
const { createRuntimeDatabaseAdapter } = require("../backend/database");

const repoRoot = path.join(__dirname, "..");
const port = 39800 + (process.pid % 150);
const baseUrl = `http://127.0.0.1:${port}`;
const proofName = `PostgreSQL Menu Proof ${process.pid}`;
let backend;
let backendOutput = "";
let lockClient;
let lockTransactionOpen = false;
let createdMenuItemId;
let originalPickupClosingTime;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL merchant menu HTTP smoke skipped: DATABASE_URL is not set.");
    return;
  }

  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const lockPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
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
        // The boot-time consistency checks in server.js cascade: once CUSTOMER_ORDER_WRITE_RUNTIME
        // is postgres, the full order-write stack must be too, which in turn requires the
        // capture/settlement/refund/reliability stacks to be postgres as well. This list drifted
        // out of sync with those checks as more *_RUNTIME flags were added over time (pre-existing,
        // not something this proof's own scenario introduced); restored to the full current
        // requirement so the backend actually boots instead of refusing to start.
        CUSTOMER_ORDER_READ_RUNTIME: "postgres",
        PAYMENT_AUTHORIZATION_REQUEST_RUNTIME: "postgres",
        PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME: "postgres",
        PAYMENT_AUTHORIZATION_CANCEL_RUNTIME: "postgres",
        CUSTOMER_ORDER_CANCEL_RUNTIME: "postgres",
        MERCHANT_ACTIVITY_CANCEL_RUNTIME: "postgres",
        PAYMENT_CAPTURE_RUNTIME: "postgres",
        GROUP_BUY_SETTLEMENT_RUNTIME: "postgres",
        PAYMENT_REFUND_RUNTIME: "postgres",
        STORE_DIRECTORY_READ_RUNTIME: "postgres",
        PAYMENT_RELIABILITY_JOB_RUNTIME: "postgres",
        MANUAL_LINE_PAY_REPAYMENT_RUNTIME: "postgres",
        AUTH_SESSION_SECRET: "postgres-merchant-menu-http-smoke-secret",
        PAYMENT_RECONCILIATION_ENABLED: "false",
        SETTLEMENT_SCHEDULER_ENABLED: "false",
        PICKUP_EXPIRATION_SCHEDULER_ENABLED: "false",
      },
      windowsHide: true,
    });
    backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
    backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

    await waitForBackend();
    const token = await createMerchantSession();
    const otherStoreMerchantResult = await database.query(`
      SELECT user_id FROM merchant_users WHERE store_id != 'store-001' AND status = 'active' LIMIT 1
    `);
    assert.ok(otherStoreMerchantResult.rows[0], "A merchant user from a different store is required");
    const otherStoreMerchantUserId = otherStoreMerchantResult.rows[0].user_id;

    const initialMenuResponse = await fetch(
      `${baseUrl}/api/merchant/stores/store-001/menu`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(initialMenuResponse.ok, true, await initialMenuResponse.text());

    lockClient = await lockPool.connect();
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    await lockClient.query("SELECT id FROM stores WHERE id = 'store-001' FOR UPDATE");

    let requestSettled = false;
    const createPromise = saveMenuItem(token, "POST", null, createBody())
      .finally(() => { requestSettled = true; });
    await delay(300);
    assert.equal(requestSettled, false, "Merchant menu write did not wait for store row lock");

    await lockClient.query("COMMIT");
    lockTransactionOpen = false;
    const created = await createPromise;
    assert.equal(created.response.status, 201, created.text);
    const createdPayload = JSON.parse(created.text);
    createdMenuItemId = createdPayload.menuItem.id;
    assert.equal(createdPayload.menuItem.name, proofName);
    assert.equal(createdPayload.menuItem.customizationGroups[0].maxSelections, 1);

    const updateBody = createBody();
    updateBody.name = `${proofName} Updated`;
    updateBody.isAvailable = false;
    updateBody.customizationGroups[0].options[0].id = (
      createdPayload.menuItem.customizationGroups[0].options[0].id
    );
    updateBody.customizationGroups[0].options[0].isAvailable = false;
    updateBody.customizationGroups[0].maxSelections = 0;
    const updated = await saveMenuItem(token, "PATCH", createdMenuItemId, updateBody);
    assert.equal(updated.response.ok, true, updated.text);
    const updatedPayload = JSON.parse(updated.text);
    assert.equal(updatedPayload.menuItem.isAvailable, false);
    assert.equal(updatedPayload.menuItem.customizationGroups[0].options[0].isAvailable, false);

    const publicMenuResponse = await fetch(`${baseUrl}/api/stores/store-001/menu`);
    const publicMenu = await publicMenuResponse.json();
    assert.equal(publicMenu.menuItems.some((item) => item.id === createdMenuItemId), false);

    const merchantMenuResponse = await fetch(
      `${baseUrl}/api/merchant/stores/store-001/menu`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const merchantMenu = await merchantMenuResponse.json();
    assert.equal(
      merchantMenu.menuItems.find((item) => item.id === createdMenuItemId).isAvailable,
      false
    );

    const persisted = await database.query(`
      SELECT
        menu_item.id,
        menu_item.is_available,
        COUNT(DISTINCT rule.option_type)::integer AS rule_count,
        COUNT(DISTINCT option.id)::integer AS option_count,
        COUNT(DISTINCT audit_log.id)::integer AS audit_count
      FROM menu_items menu_item
      LEFT JOIN menu_item_customization_rules rule
        ON rule.menu_item_id = menu_item.id
      LEFT JOIN customization_options option
        ON option.menu_item_id = menu_item.id
      LEFT JOIN audit_logs audit_log
        ON audit_log.resource_type = 'menu_item'
       AND audit_log.resource_id = menu_item.id
      WHERE menu_item.id = $1
      GROUP BY menu_item.id
    `, [createdMenuItemId]);
    assert.deepEqual(persisted.rows[0], {
      id: createdMenuItemId,
      is_available: false,
      rule_count: 1,
      option_count: 1,
      audit_count: 2,
    });

    // Pickup closing time: real HTTP round trip against real PostgreSQL, covering the
    // mobile -> API -> repository -> database path end to end, not just the repository unit.
    const originalClosingTimeRow = await database.query(
      "SELECT pickup_closing_time FROM stores WHERE id = 'store-001'"
    );
    originalPickupClosingTime = originalClosingTimeRow.rows[0].pickup_closing_time;

    const setResponse = await updatePickupClosingTime(token, "22:00");
    assert.equal(setResponse.response.ok, true, setResponse.text);
    assert.equal(JSON.parse(setResponse.text).store.pickupClosingTime, "22:00");

    const menuAfterSet = await (await fetch(
      `${baseUrl}/api/merchant/stores/store-001/menu`,
      { headers: { Authorization: `Bearer ${token}` } }
    )).json();
    assert.equal(menuAfterSet.store.pickupClosingTime, "22:00");

    const invalidResponse = await updatePickupClosingTime(token, "not-a-time");
    assert.equal(invalidResponse.response.status, 400, invalidResponse.text);

    const outOfRangeResponse = await updatePickupClosingTime(token, "24:00");
    assert.equal(outOfRangeResponse.response.status, 400, outOfRangeResponse.text);

    const otherStoreToken = await createSessionForUser(otherStoreMerchantUserId);
    const crossStoreResponse = await updatePickupClosingTime(otherStoreToken, "18:00", "store-001");
    assert.equal(crossStoreResponse.response.status, 403, crossStoreResponse.text);
    const menuAfterCrossStoreAttempt = await (await fetch(
      `${baseUrl}/api/merchant/stores/store-001/menu`,
      { headers: { Authorization: `Bearer ${token}` } }
    )).json();
    assert.equal(
      menuAfterCrossStoreAttempt.store.pickupClosingTime, "22:00",
      "a denied cross-store attempt must not change the value"
    );

    const clearResponse = await updatePickupClosingTime(token, null);
    assert.equal(clearResponse.response.ok, true, clearResponse.text);
    assert.equal(JSON.parse(clearResponse.text).store.pickupClosingTime, null);

    const auditRow = await database.query(`
      SELECT COUNT(*)::integer AS count
      FROM audit_logs
      WHERE resource_type = 'store'
        AND resource_id = 'store-001'
        AND action_type = 'merchant_update_store_pickup_closing_time'
    `);
    assert.equal(auditRow.rows[0].count, 2, "set + clear should each write one audit log entry");

    console.log("PostgreSQL merchant menu transaction, store-lock, and HTTP proof passed.");
  } finally {
    if (lockTransactionOpen && lockClient) await lockClient.query("ROLLBACK");
    if (lockClient) lockClient.release();
    if (backend && backend.exitCode == null) backend.kill();
    await cleanupProofData(database);
    await lockPool.end();
    await database.close();
  }
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

async function createMerchantSession() {
  return createSessionForUser("user-merchant-001");
}

async function createSessionForUser(userId) {
  const response = await fetch(`${baseUrl}/api/auth/dev-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text).token;
}

async function updatePickupClosingTime(token, pickupClosingTime, storeId = "store-001") {
  const response = await fetch(
    `${baseUrl}/api/merchant/stores/${storeId}/pickup-closing-time`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pickupClosingTime }),
    }
  );
  return { response, text: await response.text() };
}

async function saveMenuItem(token, method, menuItemId, body) {
  const suffix = menuItemId ? `/${menuItemId}` : "";
  const response = await fetch(
    `${baseUrl}/api/merchant/stores/store-001/menu-items${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  return { response, text: await response.text() };
}

function createBody() {
  return {
    name: proofName,
    category: "PostgreSQL Proof",
    description: "Temporary integration proof",
    basePrice: 90,
    isAvailable: true,
    customizationGroups: [{
      optionType: "topping",
      minSelections: 0,
      maxSelections: 1,
      options: [{
        label: "Proof topping",
        priceDelta: 10,
        isAvailable: true,
      }],
    }],
  };
}

async function cleanupProofData(database) {
  const idsResult = await database.query(`
    SELECT id
    FROM menu_items
    WHERE name IN ($1, $2)
       OR id = $3
  `, [proofName, `${proofName} Updated`, createdMenuItemId || ""]);
  const ids = idsResult.rows.map((row) => row.id);
  if (ids.length > 0) {
    await database.query(`
      DELETE FROM audit_logs
      WHERE resource_type = 'menu_item'
        AND resource_id = ANY($1::text[])
    `, [ids]);
    await database.query("DELETE FROM menu_items WHERE id = ANY($1::text[])", [ids]);
  }
  const cleanup = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM menu_items
       WHERE name IN ($1, $2)) AS menu_count,
      (SELECT COUNT(*)::integer FROM audit_logs
       WHERE resource_type = 'menu_item'
         AND resource_id = ANY($3::text[])) AS audit_count
  `, [proofName, `${proofName} Updated`, ids]);
  assert.deepEqual(cleanup.rows[0], { menu_count: 0, audit_count: 0 });

  // Restore store-001's pickup_closing_time to whatever it was before this proof ran, and
  // remove the audit trail this proof generated for it -- store-001 is shared seed data, not
  // something this script created, so it must be left exactly as it found it.
  if (originalPickupClosingTime !== undefined) {
    await database.query(
      "UPDATE stores SET pickup_closing_time = $1 WHERE id = 'store-001'",
      [originalPickupClosingTime]
    );
  }
  await database.query(`
    DELETE FROM audit_logs
    WHERE resource_type = 'store'
      AND resource_id = 'store-001'
      AND action_type = 'merchant_update_store_pickup_closing_time'
  `);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
