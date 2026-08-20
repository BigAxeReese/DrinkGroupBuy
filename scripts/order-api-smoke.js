const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const repoRoot = path.resolve(__dirname, "..");
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-api-smoke-"));
const databasePath = path.join(tempDirectory, "api-smoke.sqlite");
const port = 39123;
let backend;
let backendOutput = "";

async function request(pathname, input = {}) {
  const response = await fetch(`http://localhost:${port}${pathname}`, {
    method: input.method || "GET",
    headers: {
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      ...(input.body ? { "Content-Type": "application/json" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const payload = await response.json();
  return { response, payload };
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const { response } = await request("/health");
      if (response.ok) return;
    } catch {
      // Backend may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become healthy.\n${backendOutput}`);
}

async function createDevSession(userId) {
  const { response, payload } = await request("/api/auth/dev-session", {
    method: "POST",
    body: { userId }
  });
  if (!response.ok || !payload.token) throw new Error(`Dev session failed for ${userId}`);
  return payload.token;
}

async function main() {
  fs.copyFileSync(path.join(repoRoot, "database", "drink-group-buy-dev.sqlite"), databasePath);
  backend = spawn(process.execPath, [path.join(repoRoot, "backend", "server.js")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      AUTH_DEV_MODE: "true",
      AUTH_TOKEN_SECRET: "local-api-smoke-secret",
      DRINK_GROUP_BUY_DB_PATH: databasePath,
      // Explicitly pinned to sqlite (and DATABASE_URL cleared) so this test's own backend
      // subprocess isn't silently pulled onto the real dev PostgreSQL database by
      // backend/.env's permanent postgres defaults, which backend/auth.js's loadLocalEnv
      // loads into any env var not already present -- same class of gap fixed in
      // scripts/merchant-activity-cancel-service-smoke.js earlier.
      DATABASE_URL: "",
      AUTH_PROFILE_READ_RUNTIME: "sqlite",
      STORE_MENU_READ_RUNTIME: "sqlite",
      STORE_DIRECTORY_READ_RUNTIME: "sqlite",
      GROUP_BUY_ACTIVITY_READ_RUNTIME: "sqlite",
      GROUP_BUY_ACTIVITY_WRITE_RUNTIME: "sqlite",
      MERCHANT_MENU_RUNTIME: "sqlite",
      CUSTOMER_ORDER_WRITE_RUNTIME: "sqlite",
      CUSTOMER_ORDER_READ_RUNTIME: "sqlite",
      PAYMENT_AUTHORIZATION_REQUEST_RUNTIME: "sqlite",
      PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME: "sqlite",
      PAYMENT_AUTHORIZATION_CANCEL_RUNTIME: "sqlite",
      CUSTOMER_ORDER_CANCEL_RUNTIME: "sqlite",
      MANUAL_LINE_PAY_REPAYMENT_RUNTIME: "sqlite",
      PAYMENT_RELIABILITY_JOB_RUNTIME: "sqlite",
      ECPAY_AUTHORIZATION_RUNTIME: "sqlite",
      PAYMENT_CAPTURE_RUNTIME: "sqlite",
      GROUP_BUY_SETTLEMENT_RUNTIME: "sqlite",
      PICKUP_CREDENTIAL_RUNTIME: "sqlite",
      PAYMENT_REFUND_RUNTIME: "sqlite",
      ORDER_REVISION_RUNTIME: "sqlite",
      MERCHANT_ACTIVITY_CANCEL_RUNTIME: "sqlite",
    },
    windowsHide: true
  });
  backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
  backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

  await waitForBackend();
  const publicMenu = await request("/api/stores/store-001/menu");
  if (!publicMenu.response.ok || !Array.isArray(publicMenu.payload.menuItems)) {
    throw new Error("Public store menu route failed");
  }
  if (publicMenu.payload.store?.id !== "store-001" || publicMenu.payload.menuItems.length !== 2) {
    throw new Error("Public store menu route returned an unexpected contract");
  }
  const groupBuyActivities = await request("/api/group-buy-activities");
  if (!groupBuyActivities.response.ok || !Array.isArray(groupBuyActivities.payload.activities)) {
    throw new Error("Group-buy activity list route failed");
  }
  const alertDatabase = new DatabaseSync(databasePath);
  const alertTime = new Date().toISOString();
  alertDatabase.prepare(`
    INSERT INTO payment_reliability_jobs (
      id, job_type, resource_type, resource_id, status, payload_json,
      attempt_count, max_attempts, run_after, last_error_json,
      alert_required, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, 'failed', '{}', 3, 3, ?, ?, 1, ?, ?, ?)
  `).run(
    "job-api-smoke-alert", "reconcile_line_pay_request", "payment_authorization",
    "authorization-api-smoke", alertTime, JSON.stringify({ message: "smoke failure" }),
    alertTime, alertTime, alertTime
  );
  const customerToken = await createDevSession("user-customer-yinji");
  alertDatabase.close();
  const customerList = await request("/api/customers/me/orders?scope=active&limit=2", {
    token: customerToken
  });
  if (!customerList.response.ok || !Array.isArray(customerList.payload.orders)) {
    throw new Error("Customer order list route failed");
  }

  const merchantToken = await createDevSession("user-merchant-001");
  const merchantList = await request("/api/merchant/stores/store-001/orders?scope=active&limit=2", {
    token: merchantToken
  });
  if (!merchantList.response.ok || !Array.isArray(merchantList.payload.orders)) {
    throw new Error("Merchant order list route failed");
  }
  const crossStore = await request("/api/merchant/stores/store-002/orders?scope=active", {
    token: merchantToken
  });
  if (crossStore.response.status !== 403) throw new Error("Cross-store order access should return 403");

  const customerAlerts = await request("/api/admin/payment-reliability/alerts", {
    token: customerToken
  });
  if (customerAlerts.response.status !== 403) {
    throw new Error("Customer access to reliability alerts should return 403");
  }
  const adminToken = await createDevSession("user-admin-001");
  const adminAlerts = await request(
    "/api/admin/payment-reliability/alerts?jobType=reconcile_line_pay_request&status=failed&limit=10",
    { token: adminToken }
  );
  if (!adminAlerts.response.ok || adminAlerts.payload.count !== 1) {
    throw new Error("Admin reliability alert query failed");
  }
  if (adminAlerts.payload.alerts[0]?.id !== "job-api-smoke-alert") {
    throw new Error("Admin reliability alert query returned the wrong job");
  }

  console.log("Order API smoke passed");
  console.log("routes: health=1, public_menu=1, group_buy_activities=1, customer_list=1, merchant_list=1, cross_store_403=1, reliability_alerts=1");
  console.log(`rows: customer=${customerList.payload.orders.length}, merchant=${merchantList.payload.orders.length}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (backend && backend.exitCode == null) {
      backend.kill();
      await new Promise((resolve) => backend.once("exit", resolve));
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
