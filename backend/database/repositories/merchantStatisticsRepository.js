"use strict";

const { createRuntimeDatabaseAdapter } = require("..");

const TOP_DRINKS_LIMIT = 3;
const WEEKLY_TREND_WEEKS = 8;

// The orders that count as this store's sales -- one definition shared by every figure below so the
// revenue, discount and top-drinks numbers always describe the same set of orders:
//   - the order belongs to an activity of THIS store (the only tenant boundary; $1 is that store id)
//   - payment_status = 'captured' -> money was really collected. A fully refunded order becomes
//     'refunded' and drops out; authorized/voided/failed orders never produced revenue.
//   - orders.status <> 'cancelled' and activity.status <> 'cancelled' -> an admin can cancel an
//     already-settled activity, which leaves its captured orders untouched (they are skipped by the
//     cancel flow) even though the drinks will never be made, so they are not counted as sales.
// Unclaimed orders (pickup_status 'expired') DO count: the customer was charged and, by the pickup
// rule, is not refunded automatically, so the store kept that money.
const SALES_ORDER_FILTER = `
  activity.store_id = $1
  AND activity.status <> 'cancelled'
  AND orders.payment_status = 'captured'
  AND orders.status <> 'cancelled'
  AND orders.final_amount IS NOT NULL
`;

// One store's figures. The store id is always authorized against the caller's token by the route
// before it gets here; every query filters on it, so a store can only ever see its own rows.
async function getStoreStatisticsPostgres(database, storeId) {
  const [salesResult, activityResult, drinksResult] = await Promise.all([
    // Partial refunds are subtracted from revenue (the store gave that money back); the discount is
    // original_amount - final_amount and is unaffected by refunds.
    database.query(`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(orders.final_amount), 0) AS gross_revenue,
        COALESCE(SUM(refund.refunded_amount), 0) AS partial_refund_total,
        COALESCE(SUM(orders.original_amount - orders.final_amount), 0) AS discount_given_total
      FROM orders
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      LEFT JOIN (
        SELECT order_id, SUM(refund_amount) AS refunded_amount
        FROM payment_refunds
        WHERE status = 'refunded'
        GROUP BY order_id
      ) refund ON refund.order_id = orders.id
      WHERE ${SALES_ORDER_FILTER}
    `, [storeId]),
    // Success = the group buy reached its first discount tier. Only settled activities count:
    // still-recruiting ones have no outcome yet, and store-cancelled ones never reach settlement.
    // An activity cancelled AFTER it settled is left out too, so this figure and the sales figures
    // above describe the same set of activities.
    database.query(`
      SELECT
        COUNT(*) FILTER (WHERE settlement.outcome = 'qualified') AS qualified_count,
        COUNT(*) FILTER (WHERE settlement.outcome = 'failed') AS failed_count
      FROM activity_settlements settlement
      JOIN group_buy_activities activity ON activity.id = settlement.activity_id
      WHERE activity.store_id = $1
        AND activity.status <> 'cancelled'
    `, [storeId]),
    database.query(`
      SELECT item.item_name_snapshot AS name, SUM(item.quantity) AS cups
      FROM order_items item
      JOIN orders ON orders.id = item.order_id
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      WHERE ${SALES_ORDER_FILTER}
      GROUP BY item.item_name_snapshot
      ORDER BY cups DESC, name ASC
      LIMIT $2
    `, [storeId, TOP_DRINKS_LIMIT]),
  ]);

  const sales = salesResult.rows[0] || {};
  const activities = activityResult.rows[0] || {};
  const qualifiedActivityCount = Number(activities.qualified_count || 0);
  const settledActivityCount = qualifiedActivityCount + Number(activities.failed_count || 0);

  return {
    totalRevenue: Number(sales.gross_revenue || 0) - Number(sales.partial_refund_total || 0),
    orderCount: Number(sales.order_count || 0),
    discountGivenTotal: Number(sales.discount_given_total || 0),
    settledActivityCount,
    qualifiedActivityCount,
    qualifiedRate: settledActivityCount > 0 ? qualifiedActivityCount / settledActivityCount : null,
    topDrinks: drinksResult.rows.map((row) => ({ name: row.name, cups: Number(row.cups) })),
  };
}

// One row per calendar week (Monday start, Asia/Taipei) over the trailing WEEKLY_TREND_WEEKS
// weeks, for just this store -- same SALES_ORDER_FILTER as the figures above, so "which orders
// count" never drifts between the store's headline numbers and its trend. Like the platform-wide
// admin trend, revenue/discount here are not refund-adjusted (a per-week refund allocation is
// ambiguous -- a refund can land in a different week than the original order); only the
// point-in-time getStoreStatistics total subtracts refunds.
async function getStoreWeeklyTrendPostgres(database, storeId) {
  const result = await database.query(`
    SELECT
      to_char(date_trunc('week', orders.submitted_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM-DD') AS week_start,
      COUNT(*) AS order_count,
      COALESCE(SUM(orders.final_amount), 0) AS revenue,
      COALESCE(SUM(orders.original_amount - orders.final_amount), 0) AS discount_amount
    FROM orders
    JOIN group_buy_activities activity ON activity.id = orders.activity_id
    WHERE ${SALES_ORDER_FILTER}
      AND orders.submitted_at >= now() - make_interval(weeks => $2::int)
    GROUP BY 1
    ORDER BY 1
  `, [storeId, WEEKLY_TREND_WEEKS]);

  return result.rows.map((row) => ({
    weekStart: row.week_start,
    orderCount: Number(row.order_count),
    revenue: Number(row.revenue),
    discountAmount: Number(row.discount_amount),
  }));
}

function createMerchantStatisticsRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    getStoreStatistics: (storeId) => getStoreStatisticsPostgres(database, storeId),
    getStoreWeeklyTrend: (storeId) => getStoreWeeklyTrendPostgres(database, storeId),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

module.exports = {
  createMerchantStatisticsRepository,
};
