"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGroupBuyActivityWriteRepository } = require("./groupBuyActivityWriteRepository");

// Same approach as backend/pickup/pickupWindow.test.js: local time components (not fixed UTC
// strings) so this test is correct regardless of the machine's timezone.
function localTime(hour, minute) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).toISOString();
}

function normalizedSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createFakeDatabase({ storeRow, accessRows = [{ id: "merchant-user-1" }] }) {
  const transactionQueries = [];
  const database = {
    async transaction(operation) {
      const transaction = {
        async query(sql, parameters = []) {
          const statement = normalizedSql(sql);
          transactionQueries.push({ statement, parameters });
          if (statement.startsWith("SELECT id, merchant_id, name, address, latitude, longitude, pickup_closing_time")) {
            return { rows: storeRow ? [storeRow] : [] };
          }
          if (statement.startsWith("SELECT merchant_user.id")) {
            return { rows: accessRows };
          }
          return { rows: [] };
        },
      };
      return operation(transaction);
    },
  };
  return { database, transactionQueries };
}

function reachedAccessCheck(fake) {
  return fake.transactionQueries.some((item) => item.statement.startsWith("SELECT merchant_user.id"));
}

test("deadline within an hour of store closing is rejected before the merchant-access check ever runs", async () => {
  const fake = createFakeDatabase({ storeRow: { id: "store-1", pickup_closing_time: "22:00" } });
  const repository = createGroupBuyActivityWriteRepository({ runtime: "postgres", database: fake.database });

  const result = await repository.createActivity({
    storeId: "store-1",
    createdByUserId: "user-1",
    title: "test",
    startAt: localTime(9, 0),
    deadlineAt: localTime(21, 30),
    pickupStartAt: localTime(19, 0),
  });

  assert.equal(result.error, "deadline_too_close_to_store_closing");
  assert.equal(reachedAccessCheck(fake), false);
  assert.equal(fake.transactionQueries.length, 1);
});

test("pickup start too late for closing is still rejected first, independently of the deadline check", async () => {
  const fake = createFakeDatabase({ storeRow: { id: "store-1", pickup_closing_time: "22:00" } });
  const repository = createGroupBuyActivityWriteRepository({ runtime: "postgres", database: fake.database });

  const result = await repository.createActivity({
    storeId: "store-1",
    createdByUserId: "user-1",
    title: "test",
    startAt: localTime(9, 0),
    deadlineAt: localTime(19, 0),
    pickupStartAt: localTime(20, 0),
  });

  assert.equal(result.error, "pickup_start_too_late_for_store_hours");
  assert.equal(reachedAccessCheck(fake), false);
  assert.equal(fake.transactionQueries.length, 1);
});

test("deadline and pickup start that both respect closing time proceed past both checks", async () => {
  const fake = createFakeDatabase({ storeRow: { id: "store-1", pickup_closing_time: "23:00" } });
  const repository = createGroupBuyActivityWriteRepository({ runtime: "postgres", database: fake.database });

  const result = await repository.createActivity({
    storeId: "store-1",
    createdByUserId: "user-1",
    title: "test",
    startAt: localTime(9, 0),
    deadlineAt: localTime(19, 0),
    pickupStartAt: localTime(19, 30),
  });

  assert.equal(reachedAccessCheck(fake), true);
  assert.equal(result.error, "discount_menu_invalid");
  assert.equal(result.reason, "store_menu_empty");
});

test("no closing time configured skips both checks regardless of the times chosen", async () => {
  const fake = createFakeDatabase({ storeRow: { id: "store-1", pickup_closing_time: null } });
  const repository = createGroupBuyActivityWriteRepository({ runtime: "postgres", database: fake.database });

  const result = await repository.createActivity({
    storeId: "store-1",
    createdByUserId: "user-1",
    title: "test",
    startAt: localTime(9, 0),
    deadlineAt: localTime(23, 30),
    pickupStartAt: localTime(23, 45),
  });

  assert.equal(reachedAccessCheck(fake), true);
  assert.equal(result.error, "discount_menu_invalid");
  assert.equal(result.reason, "store_menu_empty");
});
