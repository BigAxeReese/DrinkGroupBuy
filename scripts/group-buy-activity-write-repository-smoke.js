"use strict";

const assert = require("node:assert/strict");
const {
  createGroupBuyActivityWriteRepository,
  resolveGroupBuyActivityWriteRuntime,
} = require("../backend/database/repositories/groupBuyActivityWriteRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresTransactionContract();
  await verifyPostgresIdempotency();
  await verifyPostgresAccessBoundary();
  await verifyPostgresDiscountBoundary();
  verifyRuntimeValidation();
  console.log("Group-buy activity write repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const expected = { id: "activity-sqlite" };
  let received;
  const repository = createGroupBuyActivityWriteRepository({
    env: {},
    sqliteWriter(input) {
      received = input;
      return expected;
    },
  });
  const input = { storeId: "store-001" };
  assert.equal(repository.kind, "sqlite");
  assert.equal(await repository.createActivity(input), expected);
  assert.equal(received, input);
  await repository.close();
}

async function verifyPostgresTransactionContract() {
  const calls = [];
  const database = createFakePostgresDatabase(calls);
  const repository = createGroupBuyActivityWriteRepository({ runtime: "postgres", database });
  const activity = await repository.createActivity(validInput());

  assert.equal(database.transactionCount, 1);
  assert.equal(activity.storeId, "store-001");
  assert.equal(activity.createdByUserId, "user-merchant-001");
  assert.equal(activity.status, "recruiting");
  assert.equal(activity.targetCups, 10);
  assert.equal(activity.maximumCups, 10);
  assert.equal(activity.nextTierTargetCups, 10);
  assert.equal(activity.estimatedDiscountPerCup, 0);
  assert.equal(activity.tiers.length, 1);

  const storeLockCall = calls.find((call) => (
    call.sql.includes("FROM stores") && call.sql.includes("FOR UPDATE")
  ));
  assert.deepEqual(storeLockCall.parameters, ["store-001"]);
  const accessCall = calls.find((call) => call.sql.includes("FROM merchant_users"));
  assert.match(accessCall.sql, /FOR UPDATE OF merchant_user, user_account, user_role/);
  assert.deepEqual(accessCall.parameters, ["user-merchant-001", "store-001"]);
  assert.ok(calls.some((call) => (
    call.sql.includes("FROM menu_items") && call.sql.includes("FOR SHARE")
  )));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO group_buy_activities")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO promotion_tiers")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO activity_notices")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  const auditCall = calls.find((call) => call.sql.includes("INSERT INTO audit_logs"));
  const auditMetadata = JSON.parse(auditCall.parameters[3]);
  assert.equal(auditMetadata.idempotencyKey, "activity-write-smoke");
  assert.equal(auditMetadata.minimumSellableUnitPrice, 40);
  await repository.close();
}

async function verifyPostgresIdempotency() {
  const calls = [];
  const repository = createGroupBuyActivityWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { existingActivityId: "activity-existing" }),
  });
  const activity = await repository.createActivity(validInput());
  assert.equal(activity.id, "activity-existing");
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO group_buy_activities")), false);
  const lookup = calls.find((call) => call.sql.includes("metadata_json->>'idempotencyKey'"));
  assert.deepEqual(lookup.parameters, [
    "user-merchant-001",
    "store-001",
    "activity-write-smoke",
  ]);
}

async function verifyPostgresAccessBoundary() {
  const calls = [];
  const repository = createGroupBuyActivityWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { denyAccess: true }),
  });
  assert.deepEqual(await repository.createActivity(validInput()), {
    error: "store_access_denied",
    storeId: "store-001",
  });
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO")), false);
}

async function verifyPostgresDiscountBoundary() {
  const calls = [];
  const repository = createGroupBuyActivityWriteRepository({
    runtime: "postgres",
    database: createFakePostgresDatabase(calls, { basePrice: 5 }),
  });
  const result = await repository.createActivity(validInput());
  assert.equal(result.error, "discount_tier_invalid");
  assert.equal(result.reason, "discount_per_cup_exceeds_minimum_unit_price");
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO group_buy_activities")), false);
}

function verifyRuntimeValidation() {
  assert.equal(resolveGroupBuyActivityWriteRuntime({ env: {} }), "sqlite");
  assert.equal(resolveGroupBuyActivityWriteRuntime({
    env: { GROUP_BUY_ACTIVITY_WRITE_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveGroupBuyActivityWriteRuntime({ runtime: "mysql" }),
    /Unsupported GROUP_BUY_ACTIVITY_WRITE_RUNTIME/
  );
  assert.throws(
    () => createGroupBuyActivityWriteRepository({ env: {} }),
    /sqliteWriter is required/
  );
  assert.throws(
    () => createGroupBuyActivityWriteRepository({ runtime: "postgres" }),
    /DATABASE_URL is required/
  );
}

function createFakePostgresDatabase(calls, options = {}) {
  const database = {
    kind: "postgres",
    transactionCount: 0,
    async transaction(operation) {
      database.transactionCount += 1;
      return operation({ query });
    },
  };
  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM stores") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "store-001",
        merchant_id: "merchant-001",
        name: "青山手作茶 中科店",
        address: "台中市北區三民路三段 150 號",
        latitude: 24.1511,
        longitude: 120.6817,
      }] };
    }
    if (sql.includes("FROM merchant_users")) {
      return { rows: options.denyAccess ? [] : [{
        id: "store-001",
        merchant_id: "merchant-001",
        name: "青山手作茶 中科店",
        address: "台中市北區三民路三段 150 號",
        latitude: 24.1511,
        longitude: 120.6817,
      }] };
    }
    if (sql.includes("metadata_json->>'idempotencyKey'")) {
      return { rows: options.existingActivityId
        ? [{ resource_id: options.existingActivityId }]
        : [] };
    }
    if (sql.includes("FROM menu_items")) {
      return { rows: [{
        id: "drink-001",
        base_price: options.basePrice ?? 40,
        is_available: true,
      }] };
    }
    if (sql.includes("FROM menu_item_customization_rules")) return { rows: [] };
    if (sql.includes("FROM customization_options")) return { rows: [] };
    if (sql.includes("FROM group_buy_activities activity")) {
      return { rows: [activityRow(options.existingActivityId)] };
    }
    if (sql.includes("FROM promotion_tiers")) {
      return { rows: [{
        id: "tier-pg-10",
        activity_id: options.existingActivityId || "activity-created",
        target_cups: 10,
        discount_amount: 100,
        sort_order: 0,
      }] };
    }
    if (sql.includes("FROM orders")) {
      return { rows: [{ authorized_cups: "0", participant_count: "0" }] };
    }
    if (sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return database;
}

function activityRow(existingActivityId) {
  return {
    id: existingActivityId || "activity-created",
    store_id: "store-001",
    created_by_user_id: "user-merchant-001",
    title: "PostgreSQL 寫入測試團",
    status: "recruiting",
    start_at: new Date("2026-08-01T01:00:00.000Z"),
    deadline_at: new Date("2026-08-01T02:00:00.000Z"),
    pickup_start_at: new Date("2026-08-01T02:30:00.000Z"),
    pickup_end_at: new Date("2026-08-01T04:00:00.000Z"),
    maximum_cups: 10,
    withdrawal_lock_minutes: 30,
    cancellation_reason: null,
    store_name: "青山手作茶 中科店",
    store_address: "台中市北區三民路三段 150 號",
    latitude: 24.1511,
    longitude: 120.6817,
  };
}

function validInput() {
  return {
    storeId: "store-001",
    createdByUserId: "user-merchant-001",
    title: "PostgreSQL 寫入測試團",
    startAt: "2026-08-01T01:00:00.000Z",
    deadlineAt: "2026-08-01T02:00:00.000Z",
    pickupStartAt: "2026-08-01T02:30:00.000Z",
    pickupEndAt: "2026-08-01T04:00:00.000Z",
    withdrawalLockMinutes: 30,
    tiers: [{ targetCups: 10, discountAmount: 100 }],
    notice: "寫入切片測試公告",
    idempotencyKey: "activity-write-smoke",
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
