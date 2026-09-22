"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const migrationPath = path.join(
  __dirname,
  "..",
  "database",
  "migrations",
  "003_activity_settlement_discount_snapshot_postgres.sql"
);
const snapshotColumns = [
  "allocated_discount_amount",
  "calculation_version",
  "discount_funder",
  "discount_per_cup",
  "undistributed_discount_amount"
];
const snapshotConstraints = [
  "activity_settlements_allocated_discount_nonnegative",
  "activity_settlements_calculation_version_present",
  "activity_settlements_discount_allocation_consistent",
  "activity_settlements_discount_funder_valid",
  "activity_settlements_discount_per_cup_nonnegative",
  "activity_settlements_discount_total_consistent",
  "activity_settlements_undistributed_discount_nonnegative"
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
        "snapshot migration is only partially applied"
      );
    }

    assert.deepEqual(await getSnapshotColumns(client), snapshotColumns);
    assert.deepEqual(await getSnapshotConstraints(client), snapshotConstraints);

    const backfillCheck = await client.query(`
      SELECT count(*)::integer AS invalid_count
      FROM activity_settlements
      WHERE allocated_discount_amount::bigint + undistributed_discount_amount::bigint
            <> discount_amount::bigint
         OR allocated_discount_amount::bigint
            <> discount_per_cup::bigint * authorized_cups::bigint
    `);
    assert.equal(backfillCheck.rows[0].invalid_count, 0);

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
      INSERT INTO promotion_tiers (id, activity_id, target_cups, discount_amount, sort_order)
      VALUES ($1, $2, 3, 100, 0)
    `, [tierId, activityId]);
    await client.query(`
      INSERT INTO activity_settlements (
        id, activity_id, outcome, authorized_cups, applied_tier_id,
        discount_amount, discount_per_cup, allocated_discount_amount,
        undistributed_discount_amount, discount_funder, calculation_version,
        settled_at, reason
      ) VALUES ($1, $2, 'qualified', 3, $3, 100, 33, 99, 1,
        'merchant', 'floor_per_cup_v1', $4, 'migration_smoke')
    `, [settlementId, activityId, tierId, now]);

    const snapshot = await client.query(`
      SELECT discount_per_cup, allocated_discount_amount,
             undistributed_discount_amount, discount_funder, calculation_version
      FROM activity_settlements
      WHERE id = $1
    `, [settlementId]);
    assert.deepEqual(snapshot.rows[0], {
      discount_per_cup: 33,
      allocated_discount_amount: 99,
      undistributed_discount_amount: 1,
      discount_funder: "merchant",
      calculation_version: "floor_per_cup_v1"
    });

    await client.query("SAVEPOINT invalid_snapshot");
    let inconsistentSnapshotRejected = false;
    try {
      await client.query(`
        UPDATE activity_settlements
        SET allocated_discount_amount = 100,
            undistributed_discount_amount = 0
        WHERE id = $1
      `, [settlementId]);
    } catch (error) {
      inconsistentSnapshotRejected = error.code === "23514";
      await client.query("ROLLBACK TO SAVEPOINT invalid_snapshot");
    }
    assert.equal(inconsistentSnapshotRejected, true, "inconsistent snapshot must be rejected");

    console.log("PostgreSQL settlement snapshot migration smoke passed.");
    console.log("snapshot: per_cup=33, allocated=99, undistributed=1, funder=merchant");
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
