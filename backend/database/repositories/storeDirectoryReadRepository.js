const { createRuntimeDatabaseAdapter } = require("..");

function resolveStoreDirectoryReadRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.STORE_DIRECTORY_READ_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported STORE_DIRECTORY_READ_RUNTIME: ${runtime}`);
}

function createStoreDirectoryReadRepository(input = {}) {
  const runtime = resolveStoreDirectoryReadRuntime(input);
  if (runtime === "sqlite") {
    if (typeof input.sqliteReader !== "function") {
      throw new Error("sqliteReader is required when STORE_DIRECTORY_READ_RUNTIME=sqlite");
    }
    return {
      kind: "sqlite",
      listPublicStores: async () => input.sqliteReader(),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({
    ...input,
    runtime: "postgres",
  });
  return {
    kind: "postgres",
    listPublicStores: () => listPostgresPublicStores(database),
    listAllStoresForAdmin: () => listPostgresAllStoresForAdmin(database),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

// Unlike listPublicStores, includes every store regardless of business_status -- an admin
// picking where to import a menu needs to reach a temporarily-closed store too, not just the
// ones customers can currently see.
async function listPostgresAllStoresForAdmin(database) {
  const result = await database.query(`
    SELECT id, name, business_status
    FROM stores
    ORDER BY name ASC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    businessStatus: row.business_status,
  }));
}

async function listPostgresPublicStores(database) {
  const result = await database.query(`
    SELECT id, name, address, phone, business_status, latitude, longitude
    FROM stores
    WHERE business_status = 'open'
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ORDER BY id ASC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    businessStatus: row.business_status,
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

module.exports = {
  createStoreDirectoryReadRepository,
  listPostgresPublicStores,
  resolveStoreDirectoryReadRuntime,
};
