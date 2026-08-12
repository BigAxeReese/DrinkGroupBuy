"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
const { runMigrations, getAppliedVersions, listMigrationFiles } = require("../database/migrate");

// Proves the unified migration runner (database/migrate.js) can bring a completely
// empty PostgreSQL target up to the current schema in one run, tracks what it applied,
// and is idempotent on a second run -- the exact capability a fresh server deployment
// needs. Runs against a throwaway schema (not the real dev database) so it's safe to
// run repeatedly without touching real data.
const schemaName = `migration_runner_smoke_${randomUUID().replace(/-/g, "_")}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL migration runner smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const expectedFiles = listMigrationFiles();
    assert.ok(expectedFiles.length > 0, "expected at least one migration file to exist");

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    // 1. First run against a fully empty schema applies every migration in order.
    const firstRun = await runMigrations(client);
    assert.equal(firstRun.appliedCount, expectedFiles.length, "first run should apply every migration");
    assert.equal(firstRun.latestVersion, expectedFiles[expectedFiles.length - 1].version);

    const appliedVersions = await getAppliedVersions(client);
    for (const file of expectedFiles) {
      assert.ok(appliedVersions.has(file.version), `${file.name} should be recorded as applied`);
    }

    const tableCountResult = await client.query(
      "SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema = $1",
      [schemaName]
    );
    assert.ok(
      Number(tableCountResult.rows[0].count) > 10,
      "a fresh schema should end up with a non-trivial number of tables after all migrations"
    );

    // 2. Second run against the now-up-to-date schema applies nothing (idempotent).
    const secondRun = await runMigrations(client);
    assert.equal(secondRun.appliedCount, 0, "second run should find nothing pending");
    assert.equal(secondRun.totalCount, expectedFiles.length);

    console.log(
      `PostgreSQL migration runner proof passed: ${expectedFiles.length} migration(s) applied `
      + `to a fresh schema, idempotent re-run confirmed, residue-free schema dropped below.`
    );
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
