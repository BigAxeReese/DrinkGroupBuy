"use strict";

const { createRuntimeDatabaseAdapter } = require("..");

// Activities still in draft/recruiting haven't reached an outcome yet, so they're excluded from
// the success-rate denominator -- including them would understate the rate for no reason (they
// aren't failures, they just haven't finished).
const SUCCESSFUL_ACTIVITY_STATUSES = ["confirmed", "ordering", "ready_for_pickup", "completed"];
const UNSUCCESSFUL_ACTIVITY_STATUSES = ["failed", "cancelled"];
const TOP_STORES_LIMIT = 10;

function createAdminStatisticsRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    getBasicStatistics: () => getBasicStatisticsPostgres(database),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getBasicStatisticsPostgres(database) {
  const [activityResult, orderResult, topStoresResult] = await Promise.all([
    database.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = ANY($1::text[])) AS successful_count,
        COUNT(*) FILTER (WHERE status = ANY($2::text[])) AS unsuccessful_count,
        COUNT(*) AS total_count
      FROM group_buy_activities
    `, [SUCCESSFUL_ACTIVITY_STATUSES, UNSUCCESSFUL_ACTIVITY_STATUSES]),
    database.query(`
      SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE payment_status = 'captured') AS captured_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
        COALESCE(SUM(final_amount) FILTER (WHERE payment_status = 'captured'), 0) AS total_revenue,
        COALESCE(AVG(final_amount) FILTER (WHERE payment_status = 'captured'), 0) AS average_order_value
      FROM orders
    `),
    database.query(`
      SELECT
        store_record.id,
        store_record.name,
        COUNT(DISTINCT activity.id) AS activity_count,
        COUNT(order_record.id) FILTER (WHERE order_record.payment_status = 'captured') AS captured_order_count,
        COALESCE(SUM(order_record.final_amount) FILTER (WHERE order_record.payment_status = 'captured'), 0) AS revenue
      FROM stores store_record
      JOIN group_buy_activities activity ON activity.store_id = store_record.id
      LEFT JOIN orders order_record ON order_record.activity_id = activity.id
      GROUP BY store_record.id, store_record.name
      ORDER BY revenue DESC, activity_count DESC
      LIMIT $1
    `, [TOP_STORES_LIMIT]),
  ]);

  const activityRow = activityResult.rows[0];
  const resolvedActivityCount = Number(activityRow.successful_count) + Number(activityRow.unsuccessful_count);
  const orderRow = orderResult.rows[0];

  return {
    activities: {
      totalCount: Number(activityRow.total_count),
      successfulCount: Number(activityRow.successful_count),
      unsuccessfulCount: Number(activityRow.unsuccessful_count),
      successRate: resolvedActivityCount > 0
        ? Number(activityRow.successful_count) / resolvedActivityCount
        : null,
    },
    orders: {
      totalOrders: Number(orderRow.total_orders),
      capturedOrders: Number(orderRow.captured_orders),
      cancelledOrders: Number(orderRow.cancelled_orders),
      totalRevenue: Number(orderRow.total_revenue),
      averageOrderValue: Math.round(Number(orderRow.average_order_value)),
    },
    topStores: topStoresResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      activityCount: Number(row.activity_count),
      capturedOrderCount: Number(row.captured_order_count),
      revenue: Number(row.revenue),
    })),
  };
}

module.exports = {
  createAdminStatisticsRepository,
};
