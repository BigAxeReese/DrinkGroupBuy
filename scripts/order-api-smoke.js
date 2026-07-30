const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

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
      DRINK_GROUP_BUY_DB_PATH: databasePath
    },
    windowsHide: true
  });
  backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
  backend.stderr.on("data", (chunk) => { backendOutput += chunk; });

  await waitForBackend();
  const customerToken = await createDevSession("user-customer-yinji");
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

  console.log("Order API smoke passed");
  console.log("routes: health=1, customer_list=1, merchant_list=1, cross_store_403=1");
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
