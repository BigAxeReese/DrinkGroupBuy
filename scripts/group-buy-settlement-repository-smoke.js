"use strict";

const assert = require("node:assert/strict");
const {
  createGroupBuySettlementRepository,
  resolveGroupBuySettlementRuntime,
} = require("../backend/database/repositories/groupBuySettlementRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresPlanAndCompletion();
  await verifyPostgresLockAndJobs();
  verifyRuntimeValidation();
  console.log("Group-buy settlement repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const echo = (value) => value;
  const repository = createGroupBuySettlementRepository({
    env: {},
    sqliteGateway: {
      createPlan: echo,
      getCaptureRetryState: echo,
      completeSettlement: echo,
      listDueActivities: echo,
      enqueueJob: echo,
      claimJobs: echo,
      completeJob: echo,
      rescheduleJob: echo,
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.createPlan({ activityId: "activity-001" }), {
    activityId: "activity-001",
  });
}

async function verifyPostgresPlanAndCompletion() {
  const calls = [];
  const repository = createRepository(calls);
  const plan = await repository.createPlan({
    activityId: "activity-001",
    force: true,
    now: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(plan.outcome, "qualified");
  assert.equal(plan.authorizedCups, 3);
  assert.equal(plan.discountPerCup, 33);
  assert.equal(plan.allocatedDiscountAmount, 99);
  assert.equal(plan.undistributedDiscountAmount, 1);
  assert.equal(plan.orders[0].captureAmount, 126);
  assert.ok(calls.some((call) => call.sql.includes("FOR UPDATE OF order_record")));

  const completion = await repository.completeSettlement({
    activityId: "activity-001",
    outcome: plan.outcome,
    authorizedCups: plan.authorizedCups,
    appliedTierId: plan.appliedTier.id,
    discountAmount: plan.appliedTier.discountAmount,
    discountPerCup: plan.discountPerCup,
    allocatedDiscountAmount: plan.allocatedDiscountAmount,
    undistributedDiscountAmount: plan.undistributedDiscountAmount,
    discountFunder: plan.discountFunder,
    capturedOrderCount: 1,
    now: "2026-07-31T00:01:00.000Z",
  });
  assert.equal(completion.settlement.discountPerCup, 33);
  assert.equal(completion.settlement.calculationVersion, "floor_per_cup_v1");
  assert.ok(calls.some((call) => call.sql.includes("discount_per_cup")));

  const invalid = await repository.completeSettlement({
    activityId: "activity-001",
    authorizedCups: 3,
    discountAmount: 100,
    discountPerCup: 33,
    allocatedDiscountAmount: 98,
    undistributedDiscountAmount: 2,
  });
  assert.equal(invalid.error, "settlement_discount_snapshot_inconsistent");
}

async function verifyPostgresLockAndJobs() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await repository.withOperationLock(
    { activityId: "activity-001", now: "2026-07-31T00:00:00.000Z" },
    async () => "settled"
  );
  assert.equal(result, "settled");
  assert.ok(calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"))
    > calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks")));

  const jobs = await repository.claimJobs({
    jobType: "settle_group_buy_activity",
    workerId: "worker-001",
    now: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(jobs[0].status, "running");
  assert.ok(calls.some((call) => call.sql.includes("FOR UPDATE SKIP LOCKED")));
}

function createRepository(calls) {
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      return { rows: [] };
    },
    async transaction(operation) {
      return operation({ query });
    },
  };
  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("SELECT * FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [activityRow()] };
    }
    if (sql.includes("FROM activity_settlements") && !sql.includes("INSERT")) {
      return { rows: [] };
    }
    if (sql.includes("FROM promotion_tiers")) return { rows: [tierRow()] };
    if (sql.includes("LEFT JOIN LATERAL")) return { rows: [orderRow()] };
    if (sql.includes("INSERT INTO activity_settlements")) {
      return { rows: [settlementRow()] };
    }
    if (sql.includes("WITH claimable AS")) return { rows: [jobRow()] };
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  }
  return createGroupBuySettlementRepository({ runtime: "postgres", database });
}

function activityRow() {
  return {
    id: "activity-001",
    status: "confirmed",
    deadline_at: new Date("2026-07-30T00:00:00.000Z"),
    maximum_cups: 3,
  };
}

function tierRow() {
  return { id: "tier-001", target_cups: 3, discount_amount: 100, sort_order: 1 };
}

function orderRow() {
  return {
    id: "order-001",
    activity_id: "activity-001",
    customer_user_id: "customer-001",
    status: "submitted",
    fallback_purchase_preference: "decline_original_price",
    total_cups: 3,
    original_amount: 225,
    payment_status: "authorized",
    payment_authorization_id: "authorization-001",
    payment_provider: "mock_line_pay",
    provider_authorization_id: "transaction-001",
    authorized_amount: 75,
    minimum_unit_price: 75,
  };
}

function settlementRow() {
  return {
    id: "settlement-001",
    activity_id: "activity-001",
    outcome: "qualified",
    authorized_cups: 3,
    applied_tier_id: "tier-001",
    discount_amount: 100,
    discount_per_cup: 33,
    allocated_discount_amount: 99,
    undistributed_discount_amount: 1,
    discount_funder: "merchant",
    calculation_version: "floor_per_cup_v1",
    settled_at: new Date("2026-07-31T00:01:00.000Z"),
    reason: "deadline_settlement_completed",
  };
}

function jobRow() {
  return {
    id: "job-001",
    job_type: "settle_group_buy_activity",
    resource_type: "activity",
    resource_id: "activity-001",
    status: "running",
    payload_json: { activityId: "activity-001" },
    attempt_count: 1,
    max_attempts: 20,
    run_after: new Date("2026-07-31T00:00:00.000Z"),
    locked_by: "worker-001",
    locked_until: new Date("2026-07-31T00:05:00.000Z"),
    alert_required: false,
    created_at: new Date("2026-07-31T00:00:00.000Z"),
    updated_at: new Date("2026-07-31T00:00:00.000Z"),
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolveGroupBuySettlementRuntime({ env: {} }), "sqlite");
  assert.equal(resolveGroupBuySettlementRuntime({
    env: { GROUP_BUY_SETTLEMENT_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveGroupBuySettlementRuntime({ runtime: "mysql" }),
    /Unsupported GROUP_BUY_SETTLEMENT_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
