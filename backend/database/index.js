"use strict";

const { createSqliteAdapter } = require("./sqliteAdapter");

function resolveDatabaseRuntime(input = {}) {
  return String(input.runtime || input.env?.DATABASE_RUNTIME || process.env.DATABASE_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
}

function createRuntimeDatabaseAdapter(input = {}) {
  const runtime = resolveDatabaseRuntime(input);
  if (runtime === "sqlite") return createSqliteAdapter(input);
  if (runtime === "postgres" || runtime === "postgresql") {
    const { createPostgresAdapter } = require("./postgresAdapter");
    return createPostgresAdapter(input);
  }
  throw new Error(`Unsupported DATABASE_RUNTIME: ${runtime}`);
}

module.exports = {
  createRuntimeDatabaseAdapter,
  resolveDatabaseRuntime,
};
