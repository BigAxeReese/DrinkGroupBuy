"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMerchantStatisticsRepository } = require("./merchantStatisticsRepository");

// Answers each query by what it reads from, and records what was asked. weeklyTrend must be
// checked before the generic sales branch -- getStoreWeeklyTrend's query also reads "FROM orders".
function createFakeDatabase({ sales, activities, drinks, weeklyTrend }) {
  const queries = [];
  return {
    queries,
    database: {
      async query(sql, parameters = []) {
        const statement = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ statement, parameters });
        if (statement.includes("FROM order_items")) return { rows: drinks };
        if (statement.includes("FROM activity_settlements")) return { rows: activities };
        if (statement.includes("date_trunc('week'")) return { rows: weeklyTrend };
        if (statement.includes("FROM orders")) return { rows: sales };
        throw new Error(`Unexpected SQL: ${statement}`);
      },
    },
  };
}

const emptyFake = () => createFakeDatabase({ sales: [], activities: [], drinks: [], weeklyTrend: [] });

test("statistics combine the three queries into one summary", async () => {
  const fake = createFakeDatabase({
    sales: [{ order_count: "12", gross_revenue: "1800", partial_refund_total: "130", discount_given_total: "240" }],
    activities: [{ qualified_count: "3", failed_count: "1" }],
    drinks: [{ name: "青山烏龍拿鐵", cups: "9" }, { name: "紅茶", cups: "4" }],
  });
  const summary = await createMerchantStatisticsRepository({ database: fake.database }).getStoreStatistics("store-001");

  assert.deepEqual(summary, {
    totalRevenue: 1670, // 1800 collected - 130 partially refunded
    orderCount: 12,
    discountGivenTotal: 240,
    settledActivityCount: 4,
    qualifiedActivityCount: 3,
    qualifiedRate: 0.75,
    topDrinks: [{ name: "青山烏龍拿鐵", cups: 9 }, { name: "紅茶", cups: 4 }],
  });
});

test("every query is limited to the given store through a bound parameter", async () => {
  const fake = emptyFake();
  const injected = "store-001' OR '1'='1";
  await createMerchantStatisticsRepository({ database: fake.database }).getStoreStatistics(injected);

  assert.equal(fake.queries.length, 3);
  for (const query of fake.queries) {
    assert.equal(query.parameters[0], injected);
    assert.match(query.statement, /activity\.store_id = \$1/);
    assert.ok(!query.statement.includes("OR '1'='1"), "the store id must never be interpolated into SQL");
  }
});

test("revenue, discount and top drinks all count the same set of orders", async () => {
  const fake = emptyFake();
  await createMerchantStatisticsRepository({ database: fake.database }).getStoreStatistics("store-001");
  const salesQuery = fake.queries.find((query) => query.statement.includes("gross_revenue"));
  const drinksQuery = fake.queries.find((query) => query.statement.includes("FROM order_items"));

  for (const { statement } of [salesQuery, drinksQuery]) {
    assert.match(statement, /AND activity\.status <> 'cancelled'/);
    assert.match(statement, /AND orders\.payment_status = 'captured'/);
    assert.match(statement, /AND orders\.status <> 'cancelled'/);
    assert.match(statement, /AND orders\.final_amount IS NOT NULL/);
  }
  assert.match(salesQuery.statement, /WHERE status = 'refunded'/);
  assert.match(drinksQuery.statement, /ORDER BY cups DESC, name ASC LIMIT \$2/);
  assert.equal(drinksQuery.parameters[1], 3);
});

test("only settled activities count towards the success rate", async () => {
  const fake = emptyFake();
  await createMerchantStatisticsRepository({ database: fake.database }).getStoreStatistics("store-001");
  const activityQuery = fake.queries.find((query) => query.statement.includes("FROM activity_settlements"));
  assert.match(activityQuery.statement, /settlement\.outcome = 'qualified'/);
  assert.match(activityQuery.statement, /settlement\.outcome = 'failed'/);
  assert.match(activityQuery.statement, /AND activity\.status <> 'cancelled'/);
});

test("weekly trend maps each row and keeps the given week order", async () => {
  const fake = createFakeDatabase({
    sales: [], activities: [], drinks: [],
    weeklyTrend: [
      { week_start: "2026-09-07", order_count: "5", revenue: "350", discount_amount: "70" },
      { week_start: "2026-09-14", order_count: "0", revenue: "0", discount_amount: "0" },
    ],
  });
  const trend = await createMerchantStatisticsRepository({ database: fake.database }).getStoreWeeklyTrend("store-001");

  assert.deepEqual(trend, [
    { weekStart: "2026-09-07", orderCount: 5, revenue: 350, discountAmount: 70 },
    { weekStart: "2026-09-14", orderCount: 0, revenue: 0, discountAmount: 0 },
  ]);
});

test("weekly trend is scoped to the given store, buckets in Asia/Taipei time, and uses the same sales filter as the headline figures", async () => {
  const fake = emptyFake();
  const injected = "store-001' OR '1'='1";
  await createMerchantStatisticsRepository({ database: fake.database }).getStoreWeeklyTrend(injected);

  const trendQuery = fake.queries.find((query) => query.statement.includes("date_trunc('week'"));
  assert.equal(trendQuery.parameters[0], injected);
  assert.equal(trendQuery.parameters[1], 8);
  assert.match(trendQuery.statement, /activity\.store_id = \$1/);
  assert.match(trendQuery.statement, /AND orders\.payment_status = 'captured'/);
  assert.match(trendQuery.statement, /AT TIME ZONE 'Asia\/Taipei'/);
  assert.match(trendQuery.statement, /submitted_at >= now\(\) - make_interval\(weeks => \$2::int\)/);
  assert.ok(!trendQuery.statement.includes("OR '1'='1"), "the store id must never be interpolated into SQL");
});

test("a store with no sales gets zeros and no success rate instead of NaN or an error", async () => {
  const summary = await createMerchantStatisticsRepository({ database: emptyFake().database })
    .getStoreStatistics("store-001");
  assert.deepEqual(summary, {
    totalRevenue: 0,
    orderCount: 0,
    discountGivenTotal: 0,
    settledActivityCount: 0,
    qualifiedActivityCount: 0,
    qualifiedRate: null,
    topDrinks: [],
  });
});
