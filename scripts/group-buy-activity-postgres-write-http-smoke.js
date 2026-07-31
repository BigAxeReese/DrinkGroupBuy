"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { Pool } = require("pg");
const { createRuntimeDatabaseAdapter } = require("../backend/database");

const repoRoot = path.join(__dirname, "..");
const port = 39600 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${port}`;
const proofKey = `pg-activity-write-proof-${randomUUID()}`;
let backend;
let backendOutput = "";
let lockClient;
let lockTransactionOpen = false;

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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL activity write HTTP smoke skipped: DATABASE_URL is not set.");
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
        AUTH_SESSION_SECRET: "postgres-activity-write-http-smoke-secret",
        PAYMENT_RECONCILIATION_ENABLED: "false",
        SETTLEMENT_SCHEDULER_ENABLED: "false",
        PICKUP_EXPIRATION_SCHEDULER_ENABLED: "false",
      },
      windowsHide: true,
    });
    backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
    backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

    await waitForBackend();
    const sessionResponse = await fetch(`${baseUrl}/api/auth/dev-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-merchant-001" }),
    });
    const sessionBody = await sessionResponse.text();
    assert.equal(sessionResponse.ok, true, sessionBody);
    const session = JSON.parse(sessionBody);
    const merchantMenuResponse = await fetch(
      `${baseUrl}/api/merchant/stores/store-001/menu`,
      { headers: { Authorization: `Bearer ${session.token}` } }
    );
    assert.equal(merchantMenuResponse.status, 200);
    assert.ok((await merchantMenuResponse.json()).menuItems.length > 0);

    lockClient = await lockPool.connect();
    await lockClient.query("BEGIN");
    lockTransactionOpen = true;
    await lockClient.query(`
      SELECT merchant_user.id
      FROM merchant_users merchant_user
      JOIN stores store_record ON store_record.id = merchant_user.store_id
      WHERE merchant_user.user_id = 'user-merchant-001'
        AND merchant_user.store_id = 'store-001'
      FOR UPDATE OF merchant_user, store_record
    `);

    const body = createActivityBody();
    let requestSettled = false;
    const createPromise = postActivity(session.token, body)
      .finally(() => { requestSettled = true; });
    await delay(300);
    assert.equal(
      requestSettled,
      false,
      "Activity write did not wait for the merchant/store row lock"
    );

    await lockClient.query("COMMIT");
    lockTransactionOpen = false;
    const firstResponse = await createPromise;
    assert.equal(firstResponse.response.ok, true, firstResponse.text);
    assert.equal(firstResponse.response.status, 201);
    const firstPayload = JSON.parse(firstResponse.text);
    const activity = firstPayload.activity;
    assert.equal(activity.storeId, "store-001");
    assert.equal(activity.createdByUserId, "user-merchant-001");
    assert.equal(activity.title, "PostgreSQL Activity Write Runtime Proof");
    assert.equal(activity.status, "recruiting");
    assert.equal(activity.targetCups, 10);
    assert.equal(activity.tiers.length, 1);

    const secondResponse = await postActivity(session.token, body);
    assert.equal(secondResponse.response.ok, true, secondResponse.text);
    const secondPayload = JSON.parse(secondResponse.text);
    assert.equal(secondPayload.activity.id, activity.id);

    const persisted = await database.query(`
      SELECT
        activity.id,
        COUNT(DISTINCT tier.id)::integer AS tier_count,
        COUNT(DISTINCT notice.id)::integer AS notice_count,
        COUNT(DISTINCT history.id)::integer AS history_count,
        COUNT(DISTINCT audit_log.id)::integer AS audit_count
      FROM group_buy_activities activity
      LEFT JOIN promotion_tiers tier ON tier.activity_id = activity.id
      LEFT JOIN activity_notices notice ON notice.activity_id = activity.id
      LEFT JOIN status_history history
        ON history.resource_type = 'activity' AND history.resource_id = activity.id
      LEFT JOIN audit_logs audit_log
        ON audit_log.resource_type = 'activity' AND audit_log.resource_id = activity.id
      WHERE activity.id = $1
      GROUP BY activity.id
    `, [activity.id]);
    assert.deepEqual(persisted.rows[0], {
      id: activity.id,
      tier_count: 1,
      notice_count: 1,
      history_count: 1,
      audit_count: 1,
    });
    console.log("PostgreSQL activity write transaction, row-lock, and HTTP proof passed.");
  } finally {
    if (lockTransactionOpen && lockClient) {
      await lockClient.query("ROLLBACK");
      lockTransactionOpen = false;
    }
    if (lockClient) lockClient.release();
    if (backend && backend.exitCode == null) backend.kill();
    await cleanupProofData(database);
    await lockPool.end();
    await database.close();
  }
}

async function postActivity(token, body) {
  const response = await fetch(`${baseUrl}/api/merchant/group-buy-activities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, text: await response.text() };
}

function createActivityBody() {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const deadline = new Date(start.getTime() + 60 * 60 * 1000);
  const pickupStart = new Date(deadline.getTime() + 30 * 60 * 1000);
  const pickupEnd = new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000);
  return {
    storeId: "store-001",
    title: "PostgreSQL Activity Write Runtime Proof",
    startAt: start.toISOString(),
    deadlineAt: deadline.toISOString(),
    pickupStartAt: pickupStart.toISOString(),
    pickupEndAt: pickupEnd.toISOString(),
    withdrawalLockMinutes: 30,
    tiers: [{ targetCups: 10, discountAmount: 100 }],
    notice: "PostgreSQL write source proof notice",
    idempotencyKey: proofKey,
  };
}

async function cleanupProofData(database) {
  const proofActivities = await database.query(`
    SELECT DISTINCT resource_id
    FROM audit_logs
    WHERE action_type = 'merchant_create_group_buy_activity'
      AND metadata_json->>'idempotencyKey' = $1
  `, [proofKey]);
  const activityIds = proofActivities.rows.map((row) => row.resource_id);
  if (activityIds.length > 0) {
    await database.query(`
      DELETE FROM audit_logs
      WHERE resource_type = 'activity' AND resource_id = ANY($1::text[])
    `, [activityIds]);
    await database.query(`
      DELETE FROM status_history
      WHERE resource_type = 'activity' AND resource_id = ANY($1::text[])
    `, [activityIds]);
    await database.query(
      "DELETE FROM group_buy_activities WHERE id = ANY($1::text[])",
      [activityIds]
    );
  }
  const cleanup = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM audit_logs
       WHERE metadata_json->>'idempotencyKey' = $1) AS audit_count,
      (SELECT COUNT(*)::integer FROM group_buy_activities
       WHERE title = 'PostgreSQL Activity Write Runtime Proof') AS activity_count
  `, [proofKey]);
  assert.deepEqual(cleanup.rows[0], { audit_count: 0, activity_count: 0 });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
