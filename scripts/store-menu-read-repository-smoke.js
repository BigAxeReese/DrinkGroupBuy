const assert = require("node:assert/strict");
const {
  createStoreMenuReadRepository,
  resolveStoreMenuReadRuntime,
} = require("../backend/database/repositories/storeMenuReadRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresContract();
  await verifyMissingPostgresStore();
  verifyRuntimeValidation();
  console.log("Store menu read repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expected = { store: { id: "store-sqlite" }, menuItems: [] };
  const calls = [];
  const repository = createStoreMenuReadRepository({
    env: {},
    sqliteReader(storeId) {
      calls.push(storeId);
      return expected;
    },
  });

  assert.equal(repository.kind, "sqlite");
  assert.equal(await repository.getPublicStoreMenu("store-sqlite"), expected);
  assert.deepEqual(calls, ["store-sqlite"]);
  await repository.close();
}

async function verifyPostgresContract() {
  const calls = [];
  const database = {
    kind: "postgres",
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes("FROM stores")) {
        return { rows: [{
          id: "store-001",
          merchant_id: "merchant-001",
          name: "青山手作茶 中科店",
          address: "台中市北區三民路三段 150 號",
          phone: "04-2233-0001",
          business_status: "open",
        }] };
      }
      if (sql.includes("FROM customization_options")) {
        return { rows: [
          {
            id: "drink-001-opt-size-medium",
            menu_item_id: "drink-001",
            option_type: "size",
            label: "中杯",
            price_delta: 0,
            sort_order: 0,
            is_available: true,
          },
          {
            id: "drink-001-opt-top-pearl",
            menu_item_id: "drink-001",
            option_type: "topping",
            label: "珍珠",
            price_delta: 10,
            sort_order: 0,
            is_available: true,
          },
        ] };
      }
      if (sql.includes("FROM menu_item_customization_rules")) {
        return { rows: [
          {
            menu_item_id: "drink-001",
            option_type: "size",
            min_selections: 1,
            max_selections: 1,
          },
          {
            menu_item_id: "drink-001",
            option_type: "topping",
            min_selections: 0,
            max_selections: 2,
          },
        ] };
      }
      if (sql.includes("FROM menu_items")) {
        return { rows: [{
          id: "drink-001",
          store_id: "store-001",
          name: "青山烏龍拿鐵",
          category: "milk_tea",
          description: "木質烏龍茶香，搭配濃厚鮮奶",
          base_price: 65,
          is_available: true,
        }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const repository = createStoreMenuReadRepository({ runtime: "postgres", database });

  assert.equal(repository.kind, "postgres");
  assert.deepEqual(await repository.getPublicStoreMenu("store-001"), {
    store: {
      id: "store-001",
      merchantId: "merchant-001",
      name: "青山手作茶 中科店",
      address: "台中市北區三民路三段 150 號",
      phone: "04-2233-0001",
      businessStatus: "open",
    },
    menuItems: [{
      id: "drink-001",
      storeId: "store-001",
      name: "青山烏龍拿鐵",
      category: "milk_tea",
      description: "木質烏龍茶香，搭配濃厚鮮奶",
      basePrice: 65,
      isAvailable: true,
      customizationGroups: [
        {
          optionType: "size",
          minSelections: 1,
          maxSelections: 1,
          options: [{
            id: "drink-001-opt-size-medium",
            optionType: "size",
            label: "中杯",
            priceDelta: 0,
            isAvailable: true,
          }],
        },
        {
          optionType: "topping",
          minSelections: 0,
          maxSelections: 2,
          options: [{
            id: "drink-001-opt-top-pearl",
            optionType: "topping",
            label: "珍珠",
            priceDelta: 10,
            isAvailable: true,
          }],
        },
      ],
    }],
  });
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.deepEqual(
      call.parameters,
      call.sql.includes("$2") ? ["store-001", false] : ["store-001"]
    );
    assert.match(call.sql, /\$1/);
    assert.doesNotMatch(call.sql, /\?/);
  }
  assert.match(calls.find((call) => call.sql.includes("FROM menu_items")).sql, /is_available = true/);
  assert.match(calls.find((call) => call.sql.includes("FROM customization_options")).sql, /is_available = true/);
  await repository.close();
}

async function verifyMissingPostgresStore() {
  let queryCount = 0;
  const repository = createStoreMenuReadRepository({
    runtime: "postgresql",
    database: {
      async query() {
        queryCount += 1;
        return { rows: [] };
      },
    },
  });
  assert.equal(await repository.getPublicStoreMenu("missing-store"), null);
  assert.equal(queryCount, 1);
}

function verifyRuntimeValidation() {
  assert.equal(resolveStoreMenuReadRuntime({ env: {} }), "sqlite");
  assert.equal(
    resolveStoreMenuReadRuntime({ env: { STORE_MENU_READ_RUNTIME: "POSTGRESQL" } }),
    "postgres"
  );
  assert.throws(
    () => resolveStoreMenuReadRuntime({ runtime: "mysql" }),
    /Unsupported STORE_MENU_READ_RUNTIME/
  );
  assert.throws(
    () => createStoreMenuReadRepository({ env: { STORE_MENU_READ_RUNTIME: "postgres" } }),
    /DATABASE_URL is required/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
