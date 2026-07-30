"use strict";

function createPostgresAdapter(input = {}) {
  const env = input.env || process.env;
  const connectionString = input.connectionString || env.DATABASE_URL;
  if (!input.pool && !connectionString) {
    throw new Error("DATABASE_URL is required when DATABASE_RUNTIME=postgres");
  }
  const pool = input.pool || createPool(connectionString, env);

  const adapter = {
    kind: "postgres",
    async query(sql, parameters = []) {
      return pool.query(sql, parameters);
    },
    async execute(sql, parameters = []) {
      return pool.query(sql, parameters);
    },
    async transaction(operation) {
      const client = await pool.connect();
      const transactionAdapter = {
        kind: "postgres",
        query: (sql, parameters = []) => client.query(sql, parameters),
        execute: (sql, parameters = []) => client.query(sql, parameters),
      };
      try {
        await client.query("BEGIN");
        const result = await operation(transactionAdapter);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async healthCheck() {
      const result = await pool.query("SELECT 1 AS ok");
      return { ok: result.rows[0]?.ok === 1, runtime: "postgres" };
    },
    async close() {
      await pool.end();
    },
  };
  return adapter;
}

function createPool(connectionString, env) {
  const { Pool } = require("pg");
  return new Pool({
    connectionString,
    ssl: readBoolean(env.DATABASE_SSL, false) ? { rejectUnauthorized: false } : undefined,
    max: positiveInteger(env.DATABASE_POOL_MAX, 10),
  });
}

function readBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = { createPostgresAdapter };
