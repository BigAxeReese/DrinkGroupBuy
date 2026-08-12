"use strict";

// Unified PostgreSQL migration runner. Replaces the old per-migration bespoke
// "apply-postgres-*.js" scripts (each of which reimplemented its own ad hoc
// "has this already been applied?" detection by probing for specific tables or
// columns) with one mechanism: a schema_migrations tracking table, standard
// practice for migration tooling.
//
// Usage: DATABASE_URL=postgres://... node database/migrate.js
//
// Convention for new migration files (database/migrations/NNN_description.sql):
// - Filename must start with a numeric version prefix, e.g. "005_add_thing.sql".
// - Do NOT include your own BEGIN/COMMIT -- this runner wraps each file in its
//   own transaction. (Migrations 001 and 002 predate this runner and already
//   have their own BEGIN/COMMIT; Postgres treats a nested BEGIN inside an
//   already-open transaction as a harmless no-op warning, so they still work
//   correctly here, but their own COMMIT ends the transaction before this
//   runner's bookkeeping INSERT below runs in the same transaction -- a narrow,
//   already-accepted gap for those two files specifically. See "Known caveat"
//   below.)

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const migrationsDir = path.join(__dirname, "migrations");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await runMigrations(client);
    if (result.appliedCount === 0) {
      console.log(`Already up to date (${result.totalCount} migration(s) applied, nothing pending).`);
    } else {
      console.log(`Applied ${result.appliedCount} migration(s). Now at version ${result.latestVersion}.`);
    }
  } finally {
    await client.end();
  }
}

// Shared by main() and the smoke test (scripts/postgres-migration-runner-smoke.js) so
// both exercise the exact same apply logic against a live `pg` client, rather than the
// test reimplementing it separately and risking drift.
async function runMigrations(client) {
  const files = listMigrationFiles();
  await ensureMigrationsTable(client);
  const applied = await getAppliedVersions(client);
  const pending = files.filter((file) => !applied.has(file.version));

  for (const file of pending) {
    await applyMigration(client, file);
  }

  return {
    totalCount: files.length,
    appliedCount: pending.length,
    latestVersion: files.length > 0 ? files[files.length - 1].version : null,
  };
}

function listMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  const names = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const files = names.map((name) => {
    const match = name.match(/^(\d+)_/);
    if (!match) {
      throw new Error(
        `Migration file ${name} does not start with a numeric version prefix `
        + `(expected e.g. "005_description.sql")`
      );
    }
    return { version: match[1], name, path: path.join(migrationsDir, name) };
  });

  const seen = new Map();
  for (const file of files) {
    const existing = seen.get(file.version);
    if (existing) {
      throw new Error(`Duplicate migration version ${file.version}: ${existing.name} and ${file.name}`);
    }
    seen.set(file.version, file);
  }

  files.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  return files;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedVersions(client) {
  const result = await client.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
}

// Known caveat: for a migration file that contains its own BEGIN/COMMIT (only
// 001 and 002 do), that file's COMMIT ends the transaction before the
// INSERT INTO schema_migrations below runs, so the two aren't atomic together
// for those two files specifically. If the process dies in that narrow window,
// the schema change is already permanently applied but not yet recorded --
// rerunning would then fail on "relation already exists" and need a manual
// `INSERT INTO schema_migrations (version, name) VALUES (...)` to recover.
// New migrations should never include their own BEGIN/COMMIT, which avoids
// this gap entirely (the whole file plus the bookkeeping insert then commit
// together as one real transaction).
async function applyMigration(client, file) {
  const sql = fs.readFileSync(file.path, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, now())",
      [file.version, file.name]
    );
    await client.query("COMMIT");
    console.log(`Applied ${file.name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Failed to apply ${file.name}: ${error.message}`);
  }
}

module.exports = { listMigrationFiles, runMigrations, ensureMigrationsTable, getAppliedVersions };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
