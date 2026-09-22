"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

// 2026-09-18: this script originally verified migration 003's floor-per-cup snapshot columns
// (discount_per_cup / allocated_discount_amount / undistributed_discount_amount). Migration 008
// replaced the flat-amount discount model with a percentage one and DROPPED those columns
// outright (no per-order pool to allocate any more), so this script now verifies migration 008's
// shape instead: discount_percent / total_discount_amount alongside the still-present
// discount_funder / calculation_version columns from 003.
const migrationPath = path.join(
  __dirname,
  "..",
  "database",
  "migrations",
  "008_percentage_discount_postgres.sql"
);
const snapshotColumns = [
  "calculation_version",
  "discount_funder",
  "discount_percent",
  "total_discount_amount"
];
const snapshotConstraints = [
  "activity_settlements_calculation_version_present",
  "activity_settlements_discount_funder_valid",
  "activity_settlements_discount_percent_check"
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL settlement snapshot migration smoke skipped: DATABASE_URL is not set.");
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    const existingColumns = await getSnapshotColumns(client);
    if (existingColumns.length === 0) {
      await client.query(fs.readFileSync(migrationPath, "utf8"));
    } else {
      assert.deepEqual(
        existingColumns,
        snapshotColumns,
        "percentage-discount migration is only partially applied"
      );
    }

    assert.deepEqual(await getSnapshotColumns(client), snapshotColumns);
    assert.deepEqual(await getSnapshotConstraints(client), snapshotConstraints);

    const store = await client.query("SELECT id FROM stores ORDER BY id LIMIT 1");
    const user = await client.query("SELECT id FROM users ORDER BY id LIMIT 1");
    assert.ok(store.rows[0]?.id, "PostgreSQL dev seed must contain a store");
    assert.ok(user.rows[0]?.id, "PostgreSQL dev seed must contain a user");

    const suffix = `${process.pid}-${Date.now()}`;
    const activityId = `snapshot-smoke-activity-${suffix}`;
    const tierId = `snapshot-smoke-tier-${suffix}`;
    const settlementId = `snapshot-smoke-settlement-${suffix}`;
    const now = new Date();
    const startAt = new Date(now.getTime() - 60 * 60 * 1000);
    const deadlineAt = new Date(now.getTime() - 30 * 60 * 1000);
    const pickupStartAt = new Date(now.getTime() + 30 * 60 * 1000);
    const pickupEndAt = new Date(now.getTime() + 60 * 60 * 1000);

    await client.query(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status,
        start_at, deadline_at, pickup_start_at, pickup_end_at,
        maximum_cups, created_at, updated_at
      ) VALUES ($1, $2, $3, 'Snapshot migration smoke', 'ordering',
        $4, $5, $6, $7, 3, $8, $8)
    `, [
      activityId,
      store.rows[0].id,
      user.rows[0].id,
      startAt,
      deadlineAt,
      pickupStartAt,
      pickupEndAt,
      now
    ]);
    await client.query(`
      INSERT INTO promotion_tiers (id, activity_id, target_cups, discount_percent, sort_order)
      VALUES ($1, $2, 3, 30, 0)
    `, [tierId, activityId]);
    await client.query(`
      INSERT INTO activity_settlements (
        id, activity_id, outcome, authorized_cups, applied_tier_id,
        total_discount_amount, discount_percent, discount_funder, calculation_version,
        settled_at, reason
      ) VALUES ($1, $2, 'qualified', 3, $3, 58, 30,
        'merchant', 'percentage_v1', $4, 'migration_smoke')
    `, [settlementId, activityId, tierId, now]);

    const snapshot = await client.query(`
      SELECT total_discount_amount, discount_percent, discount_funder, calculation_version
      FROM activity_settlements
      WHERE id = $1
    `, [settlementId]);
    assert.deepEqual(snapshot.rows[0], {
      total_discount_amount: 58,
      discount_percent: 30,
      discount_funder: "merchant",
      calculation_version: "percentage_v1"
    });

    await client.query("SAVEPOINT invalid_snapshot");
    let outOfRangePercentRejected = false;
    try {
      await client.query(`
        UPDATE activity_settlements
        SET discount_percent = 150
        WHERE id = $1
      `, [settlementId]);
    } catch (error) {
      outOfRangePercentRejected = error.code === "23514";
      await client.query("ROLLBACK TO SAVEPOINT invalid_snapshot");
    }
    assert.equal(outOfRangePercentRejected, true, "a discount_percent outside 1-99 must be rejected");

    console.log("PostgreSQL settlement snapshot migration smoke passed.");
    console.log("snapshot: percent=30, total_discount=58, funder=merchant, version=percentage_v1");
    console.log("transaction: rolled_back=true");
  } finally {
    await client.query("ROLLBACK");
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
