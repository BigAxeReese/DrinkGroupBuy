"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { createRuntimeDatabaseAdapter } = require("../backend/database");

const repoRoot = path.join(__dirname, "..");
const port = 39200 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${port}`;
const proofId = `pg-activity-proof-${randomUUID()}`;
const tierId = `pg-tier-proof-${randomUUID()}`;
let backend;
let backendOutput = "";

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Backend may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become healthy.\n${backendOutput}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL activity HTTP smoke skipped: DATABASE_URL is not set.");
    return;
  }

  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    await database.query(
      `INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status,
        start_at, deadline_at, pickup_start_at, pickup_end_at,
        maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES (
        $1, 'store-001', 'user-merchant-001', $2, 'recruiting',
        NOW(), NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW() + INTERVAL '3 days',
        20, 30, NOW(), NOW()
      )`,
      [proofId, "PostgreSQL Activity Runtime Proof"]
    );
    await database.query(
      `INSERT INTO promotion_tiers (
        id, activity_id, target_cups, discount_amount, sort_order
      ) VALUES ($1, $2, 10, 100, 0)`,
      [tierId, proofId]
    );

    backend = spawn(process.execPath, [path.join(repoRoot, "backend", "server.js")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        STORE_MENU_READ_RUNTIME: "sqlite",
        GROUP_BUY_ACTIVITY_READ_RUNTIME: "postgres",
        PAYMENT_RECONCILIATION_ENABLED: "false",
        SETTLEMENT_SCHEDULER_ENABLED: "false",
        PICKUP_EXPIRATION_SCHEDULER_ENABLED: "false",
      },
      windowsHide: true,
    });
    backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
    backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

    await waitForBackend();
    const response = await fetch(`${baseUrl}/api/group-buy-activities`);
    assert.equal(response.ok, true);
    const payload = await response.json();
    const proof = payload.activities.find((activity) => activity.id === proofId);
    assert.ok(proof, "HTTP response did not include the PostgreSQL-only proof activity");
    assert.equal(proof.title, "PostgreSQL Activity Runtime Proof");
    assert.equal(proof.storeId, "store-001");
    assert.equal(proof.status, "recruiting");
    assert.equal(proof.targetCups, 10);
    assert.equal(proof.currentCups, 0);
    assert.equal(proof.tiers.length, 1);
    console.log("PostgreSQL activity HTTP source proof passed.");
  } finally {
    if (backend && backend.exitCode == null) {
      backend.kill();
    }
    await database.query("DELETE FROM group_buy_activities WHERE id = $1", [proofId]);
    const cleanup = await database.query(
      "SELECT COUNT(*)::integer AS count FROM group_buy_activities WHERE id = $1",
      [proofId]
    );
    assert.equal(cleanup.rows[0].count, 0);
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
