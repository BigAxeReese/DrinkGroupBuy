"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminStatisticsRepository } = require("./adminStatisticsRepository");

function createFakeDatabase({ weeklyTrend = [], peakHours = [] } = {}) {
  const queries = [];
  return {
    queries,
    database: {
      async query(sql, parameters = []) {
        const statement = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ statement, parameters });
        if (statement.includes("EXTRACT(HOUR FROM submitted_at")) return { rows: peakHours };
        if (statement.includes("date_trunc('week'")) return { rows: weeklyTrend };
        throw new Error(`Unexpected SQL: ${statement}`);
      },
    },
  };
}

test("weekly trend maps each row and keeps the given week order", async () => {
  const fake = createFakeDatabase({
    weeklyTrend: [
      { week_start: "2026-09-07", order_count: "5", revenue: "350", discount_amount: "70" },
      { week_start: "2026-09-14", order_count: "0", revenue: "0", discount_amount: "0" },
    ],
  });
  const trend = await createAdminStatisticsRepository({ database: fake.database }).getWeeklyTrend();

  assert.deepEqual(trend, [
    { weekStart: "2026-09-07", orderCount: 5, revenue: 350, discountAmount: 70 },
    { weekStart: "2026-09-14", orderCount: 0, revenue: 0, discountAmount: 0 },
  ]);
});

test("weekly trend query buckets in Asia/Taipei time and looks back a bounded window", async () => {
  const fake = createFakeDatabase();
  await createAdminStatisticsRepository({ database: fake.database }).getWeeklyTrend();

  assert.equal(fake.queries.length, 1);
  const [query] = fake.queries;
  assert.match(query.statement, /AT TIME ZONE 'Asia\/Taipei'/);
  assert.match(query.statement, /payment_status = 'captured'/);
  assert.match(query.statement, /submitted_at >= now\(\) - make_interval\(weeks => \$1::int\)/);
  assert.deepEqual(query.parameters, [8]);
});

test("peak hours fills in every hour of the day, even ones with no orders", async () => {
  const fake = createFakeDatabase({
    peakHours: [
      { hour_of_day: "9", order_count: "3" },
      { hour_of_day: "22", order_count: "1" },
    ],
  });
  const hours = await createAdminStatisticsRepository({ database: fake.database }).getPeakHours();

  assert.equal(hours.length, 24);
  assert.deepEqual(hours[0], { hour: 0, orderCount: 0 });
  assert.deepEqual(hours[9], { hour: 9, orderCount: 3 });
  assert.deepEqual(hours[22], { hour: 22, orderCount: 1 });
  assert.deepEqual(hours[23], { hour: 23, orderCount: 0 });
});

test("peak hours query counts every order regardless of status, unlike the revenue queries", async () => {
  const fake = createFakeDatabase();
  await createAdminStatisticsRepository({ database: fake.database }).getPeakHours();

  assert.equal(fake.queries.length, 1);
  const [query] = fake.queries;
  assert.match(query.statement, /AT TIME ZONE 'Asia\/Taipei'/);
  assert.ok(!query.statement.includes("payment_status"), "peak hours must not filter by payment status");
  assert.ok(!query.statement.includes("WHERE"), "peak hours must not filter out any order");
});
