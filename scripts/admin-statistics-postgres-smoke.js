"use strict";

// Proves, against real PostgreSQL, that the admin weekly-trend and peak-hours queries bucket by
// real Asia/Taipei wall-clock time and filter correctly. getWeeklyTrend/getPeakHours aggregate the
// WHOLE orders table (there is no per-store id to scope a fixture to, unlike the merchant/customer
// statistics repositories), so this can't assert exact totals against a shared dev database --
// instead it reads both functions before and after inserting three known fixture orders, and
// asserts the DELTA in the specific week/hour buckets those orders land in.

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const { createAdminStatisticsRepository } = require("../backend/database/repositories/adminStatisticsRepository");

const proofId = randomUUID();
const merchantId = `merchant-admin-stats-proof-${proofId}`;
const storeId = `store-admin-stats-proof-${proofId}`;

// Today's date as Taipei sees it, computed without ever letting a Date value pass through this
// machine's own local timezone (shift by +8h, then read UTC getters -- same trick the fixture
// timestamps below use, and the same reasoning behind AT TIME ZONE 'Asia/Taipei' in the repository).
function taipeiTodayDateString() {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

// The Monday (ISO week start) that a given "YYYY-MM-DD" calendar date falls in, matching Postgres's
// date_trunc('week', ...). Built entirely from Date.UTC/getUTCDay so it's independent of this
// machine's local timezone too.
function isoWeekStart(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay(); // 1=Mon .. 7=Sun
  date.setUTCDate(date.getUTCDate() - (isoDayOfWeek - 1));
  return date.toISOString().slice(0, 10);
}

function taipeiInstant(dateString, hour, minute) {
  return `${dateString}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

const todayTaipei = taipeiTodayDateString();
const targetWeekStart = isoWeekStart(todayTaipei);

// order-a: captured, lands in hour 9. order-b: authorized only (never captured), same hour 9, must
// NOT count toward weekly revenue/orderCount but MUST count toward the peak-hour total. order-c:
// cancelled, a different hour (22), must still count toward peak hours (see getPeakHoursPostgres's
// own reasoning) but not toward revenue.
const orders = [
  { key: "captured", activitySuffix: "a", status: "completed", payment: "captured", pickup: "picked_up", cups: 2, original: 100, final: 70, hour: 9, minute: 15 },
  { key: "authorized-only", activitySuffix: "b", status: "locked", payment: "authorized", pickup: "not_ready", cups: 1, original: 50, final: null, hour: 9, minute: 45 },
  { key: "cancelled", activitySuffix: "c", status: "cancelled", payment: "pending", pickup: "cancelled", cups: 1, original: 40, final: null, hour: 22, minute: 30 },
].map((fixture) => ({
  ...fixture,
  orderId: `order-admin-stats-proof-${fixture.key}-${proofId}`,
  activityId: `activity-admin-stats-proof-${fixture.activitySuffix}-${proofId}`,
  submittedAt: taipeiInstant(todayTaipei, fixture.hour, fixture.minute),
}));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL admin statistics smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const repository = createAdminStatisticsRepository({ database });
  try {
    const before = await readRelevantBuckets(repository);
    await createFixture(database);
    const after = await readRelevantBuckets(repository);

    assert.deepEqual(
      { orderCount: after.week.orderCount - before.week.orderCount, revenue: after.week.revenue - before.week.revenue, discountAmount: after.week.discountAmount - before.week.discountAmount },
      { orderCount: 1, revenue: 70, discountAmount: 30 },
      "only the captured order should move the week bucket, by its own original-minus-final discount",
    );
    assert.equal(after.hour9 - before.hour9, 2, "both hour-9 orders should count toward peak hours regardless of payment status");
    assert.equal(after.hour22 - before.hour22, 1, "the cancelled hour-22 order should still count toward peak hours");

    console.log(`PostgreSQL admin statistics proof passed (week ${targetWeekStart}, hours 9 & 22).`);
  } finally {
    await cleanup(database);
    await database.close();
  }
}

async function readRelevantBuckets(repository) {
  const [weeklyTrend, peakHours] = await Promise.all([repository.getWeeklyTrend(), repository.getPeakHours()]);
  const week = weeklyTrend.find((row) => row.weekStart === targetWeekStart) ?? { orderCount: 0, revenue: 0, discountAmount: 0 };
  return { week, hour9: peakHours[9].orderCount, hour22: peakHours[22].orderCount };
}

async function createFixture(database) {
  const [customers, creator] = await Promise.all([
    database.query(`
      SELECT user_account.id
      FROM users user_account
      JOIN user_roles user_role ON user_role.user_id = user_account.id
      WHERE user_role.role = 'customer' AND user_role.status = 'active' AND user_account.status = 'active'
      ORDER BY user_account.id
      LIMIT 1
    `),
    database.query("SELECT user_id FROM merchant_users WHERE status = 'active' LIMIT 1"),
  ]);
  assert.ok(customers.rows[0]?.id, "An active PostgreSQL customer is required");
  assert.ok(creator.rows[0]?.user_id, "An active merchant user is required");
  const customerId = customers.rows[0].id;
  const creatorId = creator.rows[0].user_id;
  const now = new Date();
  const iso = (offsetMinutes) => new Date(now.getTime() + offsetMinutes * 60_000).toISOString();

  await database.transaction(async (transaction) => {
    await transaction.query(
      "INSERT INTO merchants (id, name, status, created_at, updated_at) VALUES ($1, $2, 'active', $3, $3)",
      [merchantId, `Admin stats proof merchant ${proofId}`, iso(0)],
    );
    // 'closed' keeps this store off every app screen for the few seconds it exists.
    await transaction.query(`
      INSERT INTO stores (id, merchant_id, name, address, phone, business_status, latitude, longitude, created_at, updated_at)
      VALUES ($1, $2, $3, 'test address', NULL, 'closed', 24.0, 120.0, $4, $4)
    `, [storeId, merchantId, `Admin stats proof store`, iso(0)]);

    for (const fixture of orders) {
      // Deadline far in the future so a running backend's schedulers never touch these mid-run.
      await transaction.query(`
        INSERT INTO group_buy_activities (
          id, store_id, created_by_user_id, title, status,
          start_at, deadline_at, pickup_start_at, pickup_end_at,
          maximum_cups, withdrawal_lock_minutes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, 100, 30, $5, $5)
      `, [fixture.activityId, storeId, creatorId, `Admin stats proof ${fixture.key}`,
        iso(-120), iso(43200), iso(43260), iso(43320)]);
      await transaction.query(`
        INSERT INTO orders (
          id, activity_id, customer_user_id, status, fallback_purchase_preference,
          total_cups, original_amount, final_amount, payment_status,
          authorization_status, merchant_acceptance_status, pickup_status,
          submitted_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'decline_original_price', $5, $6, $7, $8,
                  'authorized', 'accepted', $9, $10, $10)
      `, [fixture.orderId, fixture.activityId, customerId, fixture.status, fixture.cups,
        fixture.original, fixture.final, fixture.payment, fixture.pickup, fixture.submittedAt]);
    }
  });
}

async function cleanup(database) {
  const orderIds = orders.map((fixture) => fixture.orderId);
  const activityIds = orders.map((fixture) => fixture.activityId);
  await database.transaction(async (transaction) => {
    await transaction.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM group_buy_activities WHERE id = ANY($1::text[])", [activityIds]);
    await transaction.query("DELETE FROM stores WHERE id = $1", [storeId]);
    await transaction.query("DELETE FROM merchants WHERE id = $1", [merchantId]);
  });
  const residue = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM orders WHERE id = ANY($1::text[])) AS order_count,
      (SELECT COUNT(*)::integer FROM group_buy_activities WHERE id = ANY($2::text[])) AS activity_count,
      (SELECT COUNT(*)::integer FROM stores WHERE id = $3) AS store_count,
      (SELECT COUNT(*)::integer FROM merchants WHERE id = $4) AS merchant_count
  `, [orderIds, activityIds, storeId, merchantId]);
  assert.deepEqual(residue.rows[0], { order_count: 0, activity_count: 0, store_count: 0, merchant_count: 0 });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
