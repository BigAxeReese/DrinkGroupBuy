const assert = require("node:assert/strict");
const {
  createStoreDirectoryReadRepository,
  resolveStoreDirectoryReadRuntime,
} = require("../backend/database/repositories/storeDirectoryReadRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresContract();
  await verifyPostgresEmptyResult();
  verifyRuntimeValidation();
  console.log("Store directory read repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expected = [{ id: "store-sqlite", name: "SQLite Store" }];
  let callCount = 0;
  const repository = createStoreDirectoryReadRepository({
    env: {},
    sqliteReader() {
      callCount += 1;
      return expected;
    },
  });

  assert.equal(repository.kind, "sqlite");
  assert.equal(await repository.listPublicStores(), expected);
  assert.equal(callCount, 1);
  await repository.close();
}

async function verifyPostgresContract() {
  const calls = [];
  const database = {
    kind: "postgres",
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return {
        rows: [
          {
            id: "store-001",
            name: "青山手作茶 中科店",
            address: "台中市北區三民路三段 150 號",
            phone: "04-2233-0001",
            business_status: "open",
            latitude: 24.1511,
            longitude: 120.6817,
          },
          {
            id: "store-002",
            name: "晨露鮮奶茶 一中店",
            address: "台中市北區太平路 55 號",
            phone: null,
            business_status: "open",
            latitude: 24.1481,
            longitude: 120.6862,
          },
        ],
      };
    },
  };
  const repository = createStoreDirectoryReadRepository({ runtime: "postgres", database });

  assert.equal(repository.kind, "postgres");
  assert.deepEqual(await repository.listPublicStores(), [
    {
      id: "store-001",
      name: "青山手作茶 中科店",
      address: "台中市北區三民路三段 150 號",
      phone: "04-2233-0001",
      businessStatus: "open",
      latitude: 24.1511,
      longitude: 120.6817,
    },
    {
      id: "store-002",
      name: "晨露鮮奶茶 一中店",
      address: "台中市北區太平路 55 號",
      phone: null,
      businessStatus: "open",
      latitude: 24.1481,
      longitude: 120.6862,
    },
  ]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /business_status = 'open'/);
  assert.match(calls[0].sql, /latitude IS NOT NULL/);
  assert.match(calls[0].sql, /longitude IS NOT NULL/);
  assert.equal(calls[0].parameters, undefined);
  await repository.close();
}

async function verifyPostgresEmptyResult() {
  let queryCount = 0;
  const repository = createStoreDirectoryReadRepository({
    runtime: "postgresql",
    database: {
      async query() {
        queryCount += 1;
        return { rows: [] };
      },
    },
  });
  assert.deepEqual(await repository.listPublicStores(), []);
  assert.equal(queryCount, 1);
}

function verifyRuntimeValidation() {
  assert.equal(resolveStoreDirectoryReadRuntime({ env: {} }), "sqlite");
  assert.equal(
    resolveStoreDirectoryReadRuntime({ env: { STORE_DIRECTORY_READ_RUNTIME: "POSTGRESQL" } }),
    "postgres"
  );
  assert.throws(
    () => resolveStoreDirectoryReadRuntime({ runtime: "mysql" }),
    /Unsupported STORE_DIRECTORY_READ_RUNTIME/
  );
  assert.throws(
    () => createStoreDirectoryReadRepository({ env: { STORE_DIRECTORY_READ_RUNTIME: "postgres" } }),
    /DATABASE_URL is required/
  );
  assert.throws(
    () => createStoreDirectoryReadRepository({ env: {} }),
    /sqliteReader is required/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
