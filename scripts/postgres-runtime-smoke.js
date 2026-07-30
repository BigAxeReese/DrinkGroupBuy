"use strict";

const assert = require("node:assert/strict");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const {
  createStoreMenuReadRepository,
} = require("../backend/database/repositories/storeMenuReadRepository");
const {
  createGroupBuyActivityReadRepository,
} = require("../backend/database/repositories/groupBuyActivityReadRepository");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL runtime smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  try {
    const health = await database.healthCheck();
    assert.equal(health.ok, true);
    const requiredTables = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('payment_reliability_jobs', 'operation_locks')
      ORDER BY table_name
    `);
    assert.deepEqual(
      requiredTables.rows.map((row) => row.table_name),
      ["operation_locks", "payment_reliability_jobs"]
    );
    const storeMenuRepository = createStoreMenuReadRepository({
      runtime: "postgres",
      database,
    });
    const menu = await storeMenuRepository.getPublicStoreMenu("store-001");
    assert.equal(menu?.store.id, "store-001");
    assert.equal(menu?.menuItems.length, 2);
    assert.ok(menu.menuItems.every((item) => item.customizationGroups.length === 4));
    const groupBuyActivityRepository = createGroupBuyActivityReadRepository({
      runtime: "postgres",
      database,
    });
    const activities = await groupBuyActivityRepository.listActivities();
    assert.ok(Array.isArray(activities));
    console.log("PostgreSQL runtime smoke test passed.");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
