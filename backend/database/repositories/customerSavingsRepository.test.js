"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCustomerSavingsRepository } = require("./customerSavingsRepository");

function createFakeDatabase(rows) {
  const queries = [];
  return {
    queries,
    database: {
      async query(sql, parameters = []) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), parameters });
        return { rows };
      },
    },
  };
}

test("savings summary binds the customer id as a parameter and never interpolates it", async () => {
  const fake = createFakeDatabase([
    { total_saved_amount: "58", saved_order_count: "2", saved_cup_count: "5" },
  ]);
  const repository = createCustomerSavingsRepository({ database: fake.database });

  const summary = await repository.getSavingsSummary("customer-001'; DROP TABLE orders; --");

  assert.equal(fake.queries.length, 1);
  assert.deepEqual(fake.queries[0].parameters, ["customer-001'; DROP TABLE orders; --"]);
  assert.ok(!fake.queries[0].sql.includes("DROP TABLE"));
  assert.deepEqual(summary, { totalSavedAmount: 58, savedOrderCount: 2, savedCupCount: 5 });
});

test("savings summary only counts orders that were really charged and still held", async () => {
  const fake = createFakeDatabase([
    { total_saved_amount: "0", saved_order_count: "0", saved_cup_count: "0" },
  ]);
  const repository = createCustomerSavingsRepository({ database: fake.database });
  await repository.getSavingsSummary("customer-001");

  const { sql } = fake.queries[0];
  // Each filter is anchored on its own AND/WHERE so a look-alike column (pickup_status vs status)
  // can't satisfy the wrong assertion.
  assert.match(sql, /JOIN group_buy_activities activity ON activity\.id = orders\.activity_id/);
  assert.match(sql, /WHERE orders\.customer_user_id = \$1/);
  assert.match(sql, /AND orders\.payment_status = 'captured'/);
  assert.match(sql, /AND orders\.status <> 'cancelled'/);
  assert.match(sql, /AND orders\.pickup_status IN \('not_ready', 'ready', 'picked_up'\)/);
  assert.match(sql, /AND orders\.final_amount IS NOT NULL/);
  assert.match(sql, /AND orders\.original_amount > orders\.final_amount/);
  assert.match(sql, /AND activity\.status <> 'cancelled'/);
});

test("savings summary is all zeros when the customer has no qualifying orders", async () => {
  const empty = await createCustomerSavingsRepository({
    database: createFakeDatabase([
      { total_saved_amount: "0", saved_order_count: "0", saved_cup_count: "0" },
    ]).database,
  }).getSavingsSummary("customer-001");
  assert.deepEqual(empty, { totalSavedAmount: 0, savedOrderCount: 0, savedCupCount: 0 });

  const missingRow = await createCustomerSavingsRepository({
    database: createFakeDatabase([]).database,
  }).getSavingsSummary("customer-001");
  assert.deepEqual(missingRow, { totalSavedAmount: 0, savedOrderCount: 0, savedCupCount: 0 });
});
