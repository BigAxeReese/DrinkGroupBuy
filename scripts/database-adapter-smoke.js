"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRuntimeDatabaseAdapter, resolveDatabaseRuntime } = require("../backend/database");

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "drink-group-buy-adapter-"));
  const databasePath = path.join(tempDirectory, "adapter.sqlite");
  try {
    assert.equal(resolveDatabaseRuntime({ env: {} }), "sqlite");
    const sqlite = createRuntimeDatabaseAdapter({ runtime: "sqlite", databasePath });
    assert.deepEqual(await sqlite.healthCheck(), { ok: true, runtime: "sqlite" });
    await sqlite.execute("CREATE TABLE adapter_smoke (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await sqlite.transaction(async (transaction) => {
      await transaction.execute("INSERT INTO adapter_smoke (id, value) VALUES (?, ?)", ["one", "committed"]);
    });
    await assert.rejects(
      sqlite.transaction(async (transaction) => {
        await transaction.execute("INSERT INTO adapter_smoke (id, value) VALUES (?, ?)", ["two", "rolled-back"]);
        throw new Error("rollback-check");
      }),
      /rollback-check/
    );
    const rows = await sqlite.query("SELECT * FROM adapter_smoke ORDER BY id");
    assert.deepEqual(rows.rows.map((row) => ({ ...row })), [{ id: "one", value: "committed" }]);
    await sqlite.close();

    const calls = [];
    const fakeClient = {
      async query(sql) {
        calls.push(sql);
        return { rows: [] };
      },
      release() { calls.push("RELEASE"); },
    };
    const fakePool = {
      async query(sql) {
        calls.push(sql);
        return { rows: [{ ok: 1 }] };
      },
      async connect() { return fakeClient; },
      async end() { calls.push("END"); },
    };
    const postgres = createRuntimeDatabaseAdapter({ runtime: "postgres", pool: fakePool });
    assert.deepEqual(await postgres.healthCheck(), { ok: true, runtime: "postgres" });
    await postgres.transaction(async (transaction) => transaction.execute("SELECT 2"));
    await assert.rejects(
      postgres.transaction(async () => { throw new Error("pg-rollback-check"); }),
      /pg-rollback-check/
    );
    await postgres.close();
    assert.deepEqual(calls, [
      "SELECT 1 AS ok", "BEGIN", "SELECT 2", "COMMIT", "RELEASE",
      "BEGIN", "ROLLBACK", "RELEASE", "END",
    ]);

    console.log("Database adapter smoke test passed.");
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
