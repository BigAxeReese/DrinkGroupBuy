"use strict";

const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function createSqliteAdapter(input = {}) {
  const databasePath = input.databasePath
    || input.env?.DRINK_GROUP_BUY_DB_PATH
    || process.env.DRINK_GROUP_BUY_DB_PATH
    || path.join(__dirname, "..", "..", "database", "drink-group-buy-dev.sqlite");
  const database = input.database || new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  const adapter = {
    kind: "sqlite",
    async query(sql, parameters = []) {
      return { rows: database.prepare(sql).all(...parameters) };
    },
    async execute(sql, parameters = []) {
      return database.prepare(sql).run(...parameters);
    },
    async transaction(operation) {
      database.exec("BEGIN IMMEDIATE;");
      try {
        const result = await operation(adapter);
        database.exec("COMMIT;");
        return result;
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }
    },
    async healthCheck() {
      const row = database.prepare("SELECT 1 AS ok").get();
      return { ok: row.ok === 1, runtime: "sqlite" };
    },
    async close() {
      database.close();
    },
  };
  return adapter;
}

module.exports = { createSqliteAdapter };
