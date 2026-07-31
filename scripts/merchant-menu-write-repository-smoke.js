"use strict";

const assert = require("node:assert/strict");
const {
  createMerchantMenuRepository,
  resolveMerchantMenuRuntime,
} = require("../backend/database/repositories/merchantMenuRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresTransactionContract();
  await verifyPostgresAccessBoundary();
  await verifyPostgresDiscountRollback();
  verifyRuntimeValidation();
  console.log("Merchant menu write repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const calls = [];
  const repository = createMerchantMenuRepository({
    env: {},
    sqliteReader(storeId, options) {
      calls.push({ type: "read", storeId, options });
      return { store: { id: storeId }, menuItems: [] };
    },
    sqliteWriter(input) {
      calls.push({ type: "write", input });
      return { menuItem: { id: "menu-sqlite" } };
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.equal((await repository.getStoreMenu("store-001")).store.id, "store-001");
  assert.deepEqual(calls[0].options, { includeUnavailable: true });
  assert.equal((await repository.saveMenuItem({ storeId: "store-001" })).menuItem.id, "menu-sqlite");
  await repository.close();
}

async function verifyPostgresTransactionContract() {
  const calls = [];
  const database = createFakePostgresDatabase(calls);
  const repository = createMerchantMenuRepository({ runtime: "postgres", database });
  const result = await repository.saveMenuItem(validInput());

  assert.equal(database.transactionCount, 1);
  assert.equal(database.rollbackCount, 0);
  assert.equal(result.menuItem.name, "Repository 測試茶");
  assert.equal(result.menuItem.isAvailable, true);
  assert.equal(result.menuItem.customizationGroups[0].maxSelections, 1);
  assert.equal(result.menuItem.customizationGroups[0].options[0].label, "正常甜");

  const storeLockIndex = calls.findIndex((call) => (
    call.sql.includes("FROM stores") && call.sql.includes("FOR UPDATE")
  ));
  const menuWriteIndex = calls.findIndex((call) => call.sql.includes("INSERT INTO menu_items"));
  assert.ok(storeLockIndex >= 0);
  assert.ok(menuWriteIndex > storeLockIndex);
  assert.ok(calls.some((call) => call.sql.includes("FOR SHARE OF merchant_user")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO menu_item_customization_rules")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO customization_options")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  await repository.close();
}

async function verifyPostgresAccessBoundary() {
  const calls = [];
  const database = createFakePostgresDatabase(calls, { denyAccess: true });
  const repository = createMerchantMenuRepository({ runtime: "postgres", database });
  assert.deepEqual(await repository.saveMenuItem(validInput()), {
    error: "store_access_denied",
    storeId: "store-001",
  });
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO")), false);
}

async function verifyPostgresDiscountRollback() {
  const calls = [];
  const database = createFakePostgresDatabase(calls, { discountConflict: true });
  const repository = createMerchantMenuRepository({ runtime: "postgres", database });
  const result = await repository.saveMenuItem(validInput());
  assert.equal(result.error, "menu_discount_conflict");
  assert.equal(result.activityId, "activity-active");
  assert.equal(database.rollbackCount, 1);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")), false);
}

function verifyRuntimeValidation() {
  assert.equal(resolveMerchantMenuRuntime({ env: {} }), "sqlite");
  assert.equal(resolveMerchantMenuRuntime({
    env: { MERCHANT_MENU_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveMerchantMenuRuntime({ runtime: "mysql" }),
    /Unsupported MERCHANT_MENU_RUNTIME/
  );
  assert.throws(
    () => createMerchantMenuRepository({ env: {}, sqliteReader() {} }),
    /sqliteWriter is required/
  );
  assert.throws(
    () => createMerchantMenuRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakePostgresDatabase(calls, options = {}) {
  let createdMenuItemId = "menu-created";
  const database = {
    kind: "postgres",
    transactionCount: 0,
    rollbackCount: 0,
    async transaction(operation) {
      database.transactionCount += 1;
      try {
        return await operation({ query });
      } catch (error) {
        database.rollbackCount += 1;
        throw error;
      }
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    const compactSql = sql.replace(/\s+/g, " ").trim();
    if (sql.includes("INSERT INTO menu_items")) {
      createdMenuItemId = parameters[0];
      return { rows: [], rowCount: 1 };
    }
    if (compactSql.includes("SELECT id FROM stores")) {
      return { rows: [{ id: "store-001" }] };
    }
    if (sql.includes("SELECT merchant_user.id")) {
      return { rows: options.denyAccess ? [] : [{ id: "merchant-user-001" }] };
    }
    if (
      compactSql.includes("SELECT id, store_id FROM menu_items")
      && sql.includes("FOR UPDATE")
    ) return { rows: [] };
    if (compactSql.includes("SELECT id, option_type FROM customization_options")) {
      return { rows: [] };
    }
    if (sql.includes("SELECT id, base_price, is_available")) {
      return { rows: [{
        id: createdMenuItemId,
        base_price: options.discountConflict ? 5 : 65,
        is_available: true,
      }] };
    }
    if (
      sql.includes("SELECT menu_item_id, option_type, min_selections, max_selections")
      && !sql.includes("JOIN menu_items")
    ) {
      return { rows: [{
        menu_item_id: createdMenuItemId,
        option_type: "sweetness",
        min_selections: 1,
        max_selections: 1,
      }] };
    }
    if (
      sql.includes("SELECT menu_item_id, option_type, price_delta, is_available")
      && !sql.includes("option.id")
    ) {
      return { rows: [{
        menu_item_id: createdMenuItemId,
        option_type: "sweetness",
        price_delta: 0,
        is_available: true,
      }] };
    }
    if (sql.includes("FROM group_buy_activities")) {
      return { rows: options.discountConflict
        ? [{ id: "activity-active", maximum_cups: 1 }]
        : [] };
    }
    if (sql.includes("FROM promotion_tiers")) {
      return { rows: [{
        id: "tier-active",
        target_cups: 1,
        discount_amount: 10,
        sort_order: 0,
      }] };
    }
    if (sql.includes("SELECT id, merchant_id, name, address, phone, business_status")) {
      return { rows: [{
        id: "store-001",
        merchant_id: "merchant-001",
        name: "測試店",
        address: "測試地址",
        phone: "0900000000",
        business_status: "open",
      }] };
    }
    if (sql.includes("SELECT id, store_id, name, category, description, base_price")) {
      return { rows: [{
        id: createdMenuItemId,
        store_id: "store-001",
        name: "Repository 測試茶",
        category: "茶類",
        description: null,
        base_price: 65,
        is_available: true,
      }] };
    }
    if (sql.includes("SELECT option.id, option.menu_item_id")) {
      return { rows: [{
        id: "option-created",
        menu_item_id: createdMenuItemId,
        option_type: "sweetness",
        label: "正常甜",
        price_delta: 0,
        sort_order: 0,
        is_available: true,
      }] };
    }
    if (
      sql.includes("SELECT rule.menu_item_id")
      && sql.includes("JOIN menu_items")
    ) {
      return { rows: [{
        menu_item_id: createdMenuItemId,
        option_type: "sweetness",
        min_selections: 1,
        max_selections: 1,
      }] };
    }
    if (
      sql.includes("INSERT INTO")
      || sql.includes("UPDATE menu_items")
      || sql.includes("UPDATE customization_options")
    ) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  return database;
}

function validInput() {
  return {
    storeId: "store-001",
    actorUserId: "user-merchant-001",
    name: "Repository 測試茶",
    category: "茶類",
    description: "",
    basePrice: 65,
    isAvailable: true,
    customizationGroups: [{
      optionType: "sweetness",
      minSelections: 1,
      maxSelections: 1,
      options: [{
        label: "正常甜",
        priceDelta: 0,
        isAvailable: true,
      }],
    }],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
