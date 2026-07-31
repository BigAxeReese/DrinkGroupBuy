"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(
  __dirname,
  "migrations",
  "003_activity_settlement_discount_snapshot_postgres.sql"
);
const snapshotColumns = [
  "allocated_discount_amount",
  "calculation_version",
  "discount_funder",
  "discount_per_cup",
  "undistributed_discount_amount",
];
const snapshotConstraints = [
  "activity_settlements_allocated_discount_nonnegative",
  "activity_settlements_calculation_version_present",
  "activity_settlements_discount_allocation_consistent",
  "activity_settlements_discount_funder_valid",
  "activity_settlements_discount_per_cup_nonnegative",
  "activity_settlements_discount_total_consistent",
  "activity_settlements_undistributed_discount_nonnegative",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const existingColumns = await getSnapshotColumns(client);
    if (existingColumns.length > 0 && existingColumns.length < snapshotColumns.length) {
      throw new Error(
        `Settlement snapshot migration is partially applied: ${existingColumns.join(", ")}`
      );
    }
    if (existingColumns.length === 0) {
      await client.query("BEGIN");
      try {
        await client.query("LOCK TABLE activity_settlements IN ACCESS EXCLUSIVE MODE");
        await client.query(fs.readFileSync(migrationPath, "utf8"));
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log("Applied PostgreSQL settlement snapshot migration 003.");
    } else {
      console.log("PostgreSQL settlement snapshot migration 003 is already applied.");
    }

    const columns = await getSnapshotColumns(client);
    const constraints = await getSnapshotConstraints(client);
    const invalidRows = await client.query(`
      SELECT count(*)::integer AS invalid_count
      FROM activity_settlements
      WHERE allocated_discount_amount::bigint + undistributed_discount_amount::bigint
            <> discount_amount::bigint
         OR allocated_discount_amount::bigint
            <> discount_per_cup::bigint * authorized_cups::bigint
    `);
    if (JSON.stringify(columns) !== JSON.stringify(snapshotColumns)) {
      throw new Error("Settlement snapshot column verification failed");
    }
    if (JSON.stringify(constraints) !== JSON.stringify(snapshotConstraints)) {
      throw new Error("Settlement snapshot constraint verification failed");
    }
    if (invalidRows.rows[0].invalid_count !== 0) {
      throw new Error("Settlement snapshot backfill verification failed");
    }
    console.log("PostgreSQL settlement snapshot schema and backfill verification passed.");
  } finally {
    await client.end();
  }
}

async function getSnapshotColumns(client) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_settlements'
      AND column_name = ANY($1::text[])
    ORDER BY column_name
  `, [snapshotColumns]);
  return result.rows.map((row) => row.column_name);
}

async function getSnapshotConstraints(client) {
  const result = await client.query(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'activity_settlements'
      AND constraint_name = ANY($1::text[])
    ORDER BY constraint_name
  `, [snapshotConstraints]);
  return result.rows.map((row) => row.constraint_name);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
