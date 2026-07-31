"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const {
  createGroupBuySettlementRepository,
} = require("../backend/database/repositories/groupBuySettlementRepository");
const {
  createPaymentCaptureRepository,
} = require("../backend/database/repositories/paymentCaptureRepository");
const {
  createPaymentAuthorizationCancelRepository,
} = require("../backend/database/repositories/paymentAuthorizationCancelRepository");
const { settleGroupBuyActivity } = require("../backend/payments/settlementService");

const proofId = randomUUID();
const activityId = `activity-settlement-proof-${proofId}`;
const tierId = `tier-settlement-proof-${proofId}`;
const orderId = `order-settlement-proof-${proofId}`;
const orderItemId = `order-item-settlement-proof-${proofId}`;
const authorizationId = `authorization-settlement-proof-${proofId}`;
const jobId = `job-settlement-proof-${proofId}`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL settlement smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const secondDatabase = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const settlementRepository = createGroupBuySettlementRepository({ runtime: "postgres", database });
  const secondSettlementRepository = createGroupBuySettlementRepository({
    runtime: "postgres",
    database: secondDatabase,
  });
  const paymentCaptureRepository = createPaymentCaptureRepository({ runtime: "postgres", database });
  const authorizationCancelRepository = createPaymentAuthorizationCancelRepository({
    runtime: "postgres",
    database,
  });
  try {
    await createFixture(database);
    await verifyCrossInstanceLock(settlementRepository, secondSettlementRepository);
    await verifyPersistentJob(settlementRepository);

    const now = new Date().toISOString();
    const result = await settleGroupBuyActivity({
      activityId,
      actorUserId: null,
      now,
      settlementRepository,
      paymentCaptureRepository,
      authorizationCancelRepository,
    });
    assert.equal(result.plan.outcome, "qualified");
    assert.equal(result.plan.authorizedCups, 3);
    assert.equal(result.plan.discountPerCup, 33);
    assert.equal(result.plan.allocatedDiscountAmount, 99);
    assert.equal(result.plan.undistributedDiscountAmount, 1);
    assert.equal(result.capturedOrderCount, 1);
    assert.equal(result.settlement.calculationVersion, "floor_per_cup_v1");

    const persisted = await database.query(`
      SELECT activity.status AS activity_status,
             order_record.status AS order_status,
             order_record.payment_status,
             order_record.final_amount,
             payment_auth.status AS authorization_status,
             capture.capture_amount,
             capture.released_amount,
             settlement.discount_amount,
             settlement.discount_per_cup,
             settlement.allocated_discount_amount,
             settlement.undistributed_discount_amount,
             settlement.discount_funder,
             settlement.calculation_version
      FROM group_buy_activities activity
      JOIN orders order_record ON order_record.activity_id = activity.id
      JOIN payment_authorizations payment_auth ON payment_auth.order_id = order_record.id
      JOIN payment_captures capture ON capture.payment_authorization_id = payment_auth.id
      JOIN activity_settlements settlement ON settlement.activity_id = activity.id
      WHERE activity.id = $1
    `, [activityId]);
    assert.deepEqual(persisted.rows[0], {
      activity_status: "ordering",
      order_status: "locked",
      payment_status: "captured",
      final_amount: 96,
      authorization_status: "captured",
      capture_amount: 96,
      released_amount: 99,
      discount_amount: 100,
      discount_per_cup: 33,
      allocated_discount_amount: 99,
      undistributed_discount_amount: 1,
      discount_funder: "merchant",
      calculation_version: "floor_per_cup_v1",
    });
    console.log("PostgreSQL settlement, snapshot, persistent job, and cross-instance lock proof passed.");
  } finally {
    await cleanup(database);
    await secondDatabase.close();
    await database.close();
  }
}

async function verifyCrossInstanceLock(firstRepository, secondRepository) {
  let releaseFirst;
  let firstEntered;
  const entered = new Promise((resolve) => { firstEntered = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = firstRepository.withOperationLock({ activityId }, async () => {
    firstEntered();
    await gate;
    return "first_completed";
  });
  await entered;
  const second = await secondRepository.withOperationLock({ activityId }, async () => "unexpected");
  assert.equal(second.error, "settlement_locked");
  releaseFirst();
  assert.equal(await first, "first_completed");
}

async function verifyPersistentJob(repository) {
  const now = new Date();
  const queued = await repository.enqueueJob({
    id: jobId,
    jobType: "settle_group_buy_activity",
    resourceType: "activity",
    resourceId: activityId,
    payload: { activityId },
    runAfter: now.toISOString(),
    now: now.toISOString(),
  });
  assert.equal(queued.status, "queued");
  const firstClaim = await repository.claimJobs({
    jobType: "settle_group_buy_activity",
    workerId: `worker-one-${proofId}`,
    now: now.toISOString(),
  });
  assert.equal(firstClaim[0].attemptCount, 1);
  const retryAt = new Date(now.getTime() + 1_000).toISOString();
  const retry = await repository.rescheduleJob({
    jobId,
    workerId: `worker-one-${proofId}`,
    runAfter: retryAt,
    error: { reason: "simulated_retry" },
    now: now.toISOString(),
  });
  assert.equal(retry.status, "retry_wait");
  const secondClaim = await repository.claimJobs({
    jobType: "settle_group_buy_activity",
    workerId: `worker-two-${proofId}`,
    now: new Date(now.getTime() + 2_000).toISOString(),
  });
  assert.equal(secondClaim[0].attemptCount, 2);
  const completed = await repository.completeJob({
    jobId,
    workerId: `worker-two-${proofId}`,
    now: new Date(now.getTime() + 2_000).toISOString(),
  });
  assert.equal(completed.status, "succeeded");
}

async function createFixture(database) {
  const [merchant, customer] = await Promise.all([
    database.query(`
      SELECT user_id FROM merchant_users
      WHERE store_id = 'store-001' AND status = 'active'
      LIMIT 1
    `),
    database.query(`
      SELECT user_account.id
      FROM users user_account
      JOIN user_roles user_role ON user_role.user_id = user_account.id
      WHERE user_role.role = 'customer'
        AND user_role.status = 'active'
        AND user_account.status = 'active'
      ORDER BY user_account.id
      LIMIT 1
    `),
  ]);
  assert.ok(merchant.rows[0]?.user_id, "An active store-001 merchant is required");
  assert.ok(customer.rows[0]?.id, "An active PostgreSQL customer is required");
  const now = new Date();
  const deadline = new Date(now.getTime() - 60_000);
  const pickupStart = new Date(now.getTime() + 60 * 60_000);
  const pickupEnd = new Date(pickupStart.getTime() + 60 * 60_000);
  await database.transaction(async (transaction) => {
    await transaction.query(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status,
        start_at, deadline_at, pickup_start_at, pickup_end_at,
        maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES ($1, 'store-001', $2, 'PostgreSQL Settlement Proof', 'confirmed',
                $3, $4, $5, $6, 3, 30, $3, $3)
    `, [activityId, merchant.rows[0].user_id, new Date(now.getTime() - 60 * 60_000).toISOString(),
      deadline.toISOString(), pickupStart.toISOString(), pickupEnd.toISOString()]);
    await transaction.query(`
      INSERT INTO promotion_tiers (id, activity_id, target_cups, discount_amount, sort_order)
      VALUES ($1, $2, 3, 100, 1)
    `, [tierId, activityId]);
    await transaction.query(`
      INSERT INTO orders (
        id, activity_id, customer_user_id, status, fallback_purchase_preference,
        total_cups, original_amount, final_amount, payment_status,
        authorization_status, merchant_acceptance_status, pickup_status,
        submitted_at, updated_at
      ) VALUES ($1, $2, $3, 'submitted', 'decline_original_price',
                3, 195, NULL, 'authorized', 'authorized', 'accepted', 'not_ready', $4, $4)
    `, [orderId, activityId, customer.rows[0].id, now.toISOString()]);
    await transaction.query(`
      INSERT INTO order_items (
        id, order_id, menu_item_id, item_name_snapshot, quantity, unit_price_snapshot, subtotal
      ) VALUES ($1, $2, 'drink-001', '青山烏龍拿鐵', 3, 65, 195)
    `, [orderItemId, orderId]);
    await transaction.query(`
      INSERT INTO payment_authorizations (
        id, order_id, provider, payment_flow, status,
        original_amount, authorized_amount, provider_authorization_id,
        authorized_at, created_at, updated_at
      ) VALUES ($1, $2, 'mock_line_pay', 'authorization', 'authorized',
                195, 195, $3, $4, $4, $4)
    `, [authorizationId, orderId, `transaction-settlement-proof-${proofId}`, now.toISOString()]);
  });
}

async function cleanup(database) {
  const captures = await database.query(
    "SELECT id FROM payment_captures WHERE payment_authorization_id = $1",
    [authorizationId]
  );
  const captureIds = captures.rows.map((row) => row.id);
  await database.transaction(async (transaction) => {
    if (captureIds.length > 0) {
      await transaction.query(
        "DELETE FROM payment_provider_events WHERE resource_type = 'capture' AND resource_id = ANY($1::text[])",
        [captureIds]
      );
    }
    await transaction.query(
      "DELETE FROM status_history WHERE (resource_type = 'activity' AND resource_id = $1) OR (resource_type = 'payment_authorization' AND resource_id = $2)",
      [activityId, authorizationId]
    );
    await transaction.query(
      "DELETE FROM audit_logs WHERE (resource_type = 'activity' AND resource_id = $1) OR (resource_type = 'payment_authorization' AND resource_id = $2)",
      [activityId, authorizationId]
    );
    await transaction.query("DELETE FROM payment_reliability_jobs WHERE id = $1", [jobId]);
    await transaction.query("DELETE FROM activity_settlements WHERE activity_id = $1", [activityId]);
    await transaction.query("DELETE FROM payment_captures WHERE payment_authorization_id = $1", [authorizationId]);
    await transaction.query("DELETE FROM payment_authorizations WHERE id = $1", [authorizationId]);
    await transaction.query("DELETE FROM orders WHERE id = $1", [orderId]);
    await transaction.query("DELETE FROM group_buy_activities WHERE id = $1", [activityId]);
    await transaction.query(
      "DELETE FROM operation_locks WHERE lock_key = $1",
      [`settlement:activity:${activityId}`]
    );
  });
  const residue = await database.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM group_buy_activities WHERE id = $1) AS activity_count,
      (SELECT COUNT(*)::integer FROM orders WHERE id = $2) AS order_count,
      (SELECT COUNT(*)::integer FROM payment_authorizations WHERE id = $3) AS authorization_count,
      (SELECT COUNT(*)::integer FROM payment_reliability_jobs WHERE id = $4) AS job_count,
      (SELECT COUNT(*)::integer FROM operation_locks WHERE lock_key = $5) AS lock_count
  `, [activityId, orderId, authorizationId, jobId, `settlement:activity:${activityId}`]);
  assert.deepEqual(residue.rows[0], {
    activity_count: 0,
    order_count: 0,
    authorization_count: 0,
    job_count: 0,
    lock_count: 0,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
