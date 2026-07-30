"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { createRuntimeDatabaseAdapter } = require("../backend/database");

const repoRoot = path.join(__dirname, "..");
const port = 39400 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${port}`;
const proofSuffix = randomUUID();
const userId = `pg-auth-proof-${proofSuffix}`;
const roleId = `pg-auth-role-proof-${proofSuffix}`;
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
    console.log("PostgreSQL auth profile HTTP smoke skipped: DATABASE_URL is not set.");
    return;
  }

  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    await database.query(`
      INSERT INTO users (
        id, login_name, display_name, status, created_at, updated_at
      ) VALUES ($1, $2, 'PostgreSQL Auth Runtime Proof', 'active', NOW(), NOW())
    `, [userId, `proof-${proofSuffix}`]);
    await database.query(`
      INSERT INTO user_roles (id, user_id, role, status, granted_at)
      VALUES ($1, $2, 'customer', 'active', NOW())
    `, [roleId, userId]);

    backend = spawn(process.execPath, [path.join(repoRoot, "backend", "server.js")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        AUTH_DEV_MODE: "true",
        AUTH_PROFILE_READ_RUNTIME: "postgres",
        AUTH_SESSION_SECRET: "postgres-auth-http-smoke-secret",
        STORE_MENU_READ_RUNTIME: "sqlite",
        GROUP_BUY_ACTIVITY_READ_RUNTIME: "sqlite",
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
      body: JSON.stringify({ userId }),
    });
    const sessionBody = await sessionResponse.text();
    assert.equal(sessionResponse.ok, true, sessionBody);
    const session = JSON.parse(sessionBody);
    assert.equal(session.user.id, userId);
    assert.deepEqual(session.user.roles, ["customer"]);
    assert.equal(session.user.surname, null);

    const authenticatedResponse = await fetch(`${baseUrl}/api/customers/me/orders`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(
      authenticatedResponse.ok,
      true,
      `Bearer-token profile resolution failed: ${await authenticatedResponse.text()}`
    );
    console.log("PostgreSQL auth profile HTTP source proof passed.");
  } finally {
    if (backend && backend.exitCode == null) backend.kill();
    await database.query("DELETE FROM users WHERE id = $1", [userId]);
    const cleanup = await database.query(
      "SELECT COUNT(*)::integer AS count FROM users WHERE id = $1",
      [userId]
    );
    assert.equal(cleanup.rows[0].count, 0);
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
