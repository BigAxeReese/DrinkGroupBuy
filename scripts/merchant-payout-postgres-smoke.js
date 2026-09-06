"use strict";

// PostgreSQL smoke proof for the simulated merchant payout feature. Requires DATABASE_URL
// to point at a real PostgreSQL database with migrations 001-007 applied (npm run
// postgres:migrate). Uses proof-scoped ids and cleans up everything it inserts, but still
// writes real rows against whatever database DATABASE_URL points to -- never point this at
// a real dev/production database without reading it first, per AGENTS.md.

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("../backend/database");
const {
  createMerchantPayoutRepository,
} = require("../backend/database/repositories/merchantPayoutRepository");
const {
  adminRunMerchantPayoutBatch,
  listMerchantPayoutsForAdmin,
  listMerchantPayoutsForStore,
} = require("../backend/payments/merchantPayoutService");

const proofId = randomUUID();
const activityId = `activity-payout-proof-${proofId}`;
const orderIdJanA = `order-payout-jan-a-${proofId}`;
const orderIdJanB = `order-payout-jan-b-${proofId}`;
const orderIdFeb = `order-payout-feb-${proofId}`;
const orderIdMar = `order-payout-mar-${proofId}`;

// Fixed historical months so the "period must already be over" check always passes and
// the test is deterministic regardless of when it's run.
const JAN_START = "2020-01-01T00:00:00.000Z";
const JAN_END = "2020-02-01T00:00:00.000Z";
const FEB_START = "2020-02-01T00:00:00.000Z";
const FEB_END = "2020-03-01T00:00:00.000Z";
const MAR_START = "2020-03-01T00:00:00.000Z";
const MAR_END = "2020-04-01T00:00:00.000Z";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("PostgreSQL merchant payout smoke skipped: DATABASE_URL is not set.");
    return;
  }
  const database = createRuntimeDatabaseAdapter({ runtime: "postgres" });
  const merchantPayoutRepository = createMerchantPayoutRepository({ runtime: "postgres", database });
  const adminUserResult = await database.query(`
    SELECT user_account.id
    FROM users user_account
    JOIN user_roles user_role ON user_role.user_id = user_account.id
    WHERE user_role.role = 'admin' AND user_role.status = 'active' AND user_account.status = 'active'
    LIMIT 1
  `);
  assert.ok(adminUserResult.rows[0], "An active PostgreSQL admin user is required");
  const adminUser = { id: adminUserResult.rows[0].id, roles: ["admin"] };

  try {
    const merchantResult = await database.query(`
      SELECT user_id FROM merchant_users WHERE store_id = 'store-001' AND status = 'active' LIMIT 1
    `);
    const customersResult = await database.query(`
      SELECT user_account.id
      FROM users user_account
      JOIN user_roles user_role ON user_role.user_id = user_account.id
      WHERE user_role.role = 'customer' AND user_role.status = 'active' AND user_account.status = 'active'
      ORDER BY user_account.id
      LIMIT 4
    `);
    assert.equal(customersResult.rows.length, 4, "Four active PostgreSQL customers are required");
    const merchantUserId = merchantResult.rows[0].user_id;
    const customerIds = customersResult.rows.map((row) => row.id);

    await createFixture(database, merchantUserId, customerIds);

    // 1. First batch run for January: gross 1500 (1000 + 500), 10% commission -> floor(150),
    // no refunds yet, no outstanding adjustments -> net payout 1350.
    const janResult = await merchantPayoutRepository.calculatePayout({
      storeId: "store-001",
      periodStart: JAN_START,
      periodEnd: JAN_END,
      commissionRateBp: 1000,
      actorUserId: adminUser.id,
    });
    assert.equal(janResult.alreadyExists, false);
    assert.equal(janResult.payout.grossAmount, 1500);
    assert.equal(janResult.payout.refundWithinPeriodAmount, 0);
    assert.equal(janResult.payout.platformCommissionAmount, 150);
    assert.equal(janResult.payout.carriedDeductionAmount, 0);
    assert.equal(janResult.payout.netPayoutAmount, 1350);

    // 2. Idempotency: re-running the same store+period must not recompute or double-insert.
    const janRerun = await merchantPayoutRepository.calculatePayout({
      storeId: "store-001",
      periodStart: JAN_START,
      periodEnd: JAN_END,
      commissionRateBp: 1000,
      actorUserId: adminUser.id,
    });
    assert.equal(janRerun.alreadyExists, true);
    assert.equal(janRerun.payout.id, janResult.payout.id);

    // 3. Post-payout refund: order A's capture belongs to January, which is already paid out
    // -- refunding it now must create a carry-forward adjustment, not silently do nothing.
    const captureIdJanA = `payment-capture-payout-proof-${orderIdJanA}`;
    const refundIdJanA = `payment-refund-payout-proof-${orderIdJanA}`;
    await database.query(`
      INSERT INTO payment_refunds (
        id, payment_capture_id, payment_authorization_id, order_id, provider, status,
        refund_amount, refunded_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'mock_line_pay', 'refunded', $5, $6, $6, $6)
    `, [refundIdJanA, captureIdJanA, `payment-authorization-payout-proof-${orderIdJanA}`,
      orderIdJanA, 200, JAN_END]);

    const adjustmentResult = await merchantPayoutRepository.recordPostPayoutRefundAdjustment({
      paymentRefundId: refundIdJanA,
      paymentCaptureId: captureIdJanA,
      refundAmount: 200,
      actorUserId: adminUser.id,
    });
    assert.equal(adjustmentResult.adjustmentCreated, true);
    assert.equal(adjustmentResult.adjustment.remainingAmount, 200);
    assert.equal(adjustmentResult.adjustment.status, "pending");
    assert.equal(adjustmentResult.adjustment.sourceMerchantPayoutId, janResult.payout.id);

    // 3b. Recording the same refund's adjustment twice must not create a second row.
    const adjustmentRetry = await merchantPayoutRepository.recordPostPayoutRefundAdjustment({
      paymentRefundId: refundIdJanA,
      paymentCaptureId: captureIdJanA,
      refundAmount: 200,
      actorUserId: adminUser.id,
    });
    assert.equal(adjustmentRetry.adjustmentCreated, false);
    assert.equal(adjustmentRetry.alreadyExists, true);

    // 4. A refund on a capture whose period has NOT been paid out yet is a no-op here -- it
    // nets naturally whenever that period's batch eventually runs.
    const captureIdMar = `payment-capture-payout-proof-${orderIdMar}`;
    const notYetPaidOut = await merchantPayoutRepository.recordPostPayoutRefundAdjustment({
      paymentRefundId: `payment-refund-payout-proof-${orderIdMar}`,
      paymentCaptureId: captureIdMar,
      refundAmount: 1,
      actorUserId: adminUser.id,
    });
    assert.equal(notYetPaidOut.adjustmentCreated, false);
    assert.equal(notYetPaidOut.reason, "period_not_yet_paid_out");

    // 5. February batch run: gross 1000, 10% commission -> floor(100), available 900, which
    // is enough to fully consume the 200 outstanding January adjustment -> net payout 700.
    const febResult = await merchantPayoutRepository.calculatePayout({
      storeId: "store-001",
      periodStart: FEB_START,
      periodEnd: FEB_END,
      commissionRateBp: 1000,
      actorUserId: adminUser.id,
    });
    assert.equal(febResult.payout.grossAmount, 1000);
    assert.equal(febResult.payout.platformCommissionAmount, 100);
    assert.equal(febResult.payout.carriedDeductionAmount, 200);
    assert.equal(febResult.payout.netPayoutAmount, 700);
    assert.equal(febResult.adjustmentsApplied.length, 1);
    assert.equal(febResult.adjustmentsApplied[0].appliedAmount, 200);
    assert.equal(febResult.adjustmentsApplied[0].remainingAmount, 0);

    const adjustmentAfter = await database.query(
      "SELECT status, remaining_amount FROM merchant_payout_adjustments WHERE payment_refund_id = $1",
      [refundIdJanA]
    );
    assert.equal(adjustmentAfter.rows[0].status, "fully_applied");
    assert.equal(Number(adjustmentAfter.rows[0].remaining_amount), 0);

    const applicationRow = await database.query(
      "SELECT applied_amount FROM merchant_payout_adjustment_applications WHERE merchant_payout_id = $1",
      [febResult.payout.id]
    );
    assert.equal(applicationRow.rows.length, 1);
    assert.equal(Number(applicationRow.rows[0].applied_amount), 200);

    // 6. Listing helpers.
    const storeIdsJan = await merchantPayoutRepository.listStoreIdsWithCapturesInPeriod({
      periodStart: JAN_START, periodEnd: JAN_END,
    });
    assert.ok(storeIdsJan.includes("store-001"));

    const forStore = await listMerchantPayoutsForStore({
      authUser: { id: "n/a", roles: ["merchant"], merchantStores: [{ id: "store-001" }] },
      storeId: "store-001",
      merchantPayoutRepository,
    });
    assert.ok(forStore.payouts.some((payout) => payout.id === janResult.payout.id));
    assert.ok(forStore.payouts.some((payout) => payout.id === febResult.payout.id));

    // 6b. A merchant without access to this store must be rejected.
    let storeAccessError = null;
    try {
      await listMerchantPayoutsForStore({
        authUser: { id: "n/a", roles: ["merchant"], merchantStores: [{ id: "store-002" }] },
        storeId: "store-001",
        merchantPayoutRepository,
      });
    } catch (error) {
      storeAccessError = error;
    }
    assert.ok(storeAccessError, "a merchant without this store must be denied");
    assert.equal(storeAccessError.statusCode, 403);

    const forAdmin = await listMerchantPayoutsForAdmin({
      authUser: adminUser,
      query: { storeId: "store-001" },
      merchantPayoutRepository,
    });
    assert.ok(forAdmin.payouts.some((payout) => payout.id === janResult.payout.id));

    // 7. Service-layer end-to-end batch run (admin trigger), re-run of an already-settled
    // period: must return the existing January payout, not recompute or duplicate it.
    const batchResult = await adminRunMerchantPayoutBatch({
      authUser: adminUser,
      body: { periodStart: JAN_START },
      now: "2020-06-01T00:00:00.000Z",
      merchantPayoutRepository,
    });
    assert.equal(batchResult.periodStart, JAN_START);
    assert.equal(batchResult.periodEnd, JAN_END);
    assert.ok(batchResult.payouts.some((payout) => payout.id === janResult.payout.id));
    assert.equal(batchResult.failedStoreIds.length, 0);

    // 8. A non-admin cannot trigger a batch run.
    let roleError = null;
    try {
      await adminRunMerchantPayoutBatch({
        authUser: { id: "n/a", roles: ["merchant"] },
        body: { periodStart: JAN_START },
        now: "2020-06-01T00:00:00.000Z",
        merchantPayoutRepository,
      });
    } catch (error) {
      roleError = error;
    }
    assert.ok(roleError, "a non-admin must be rejected");
    assert.equal(roleError.statusCode, 403);

    // 9. Cannot run a batch for a period that has not ended yet.
    let futureError = null;
    try {
      await adminRunMerchantPayoutBatch({
        authUser: adminUser,
        body: { periodStart: MAR_START },
        now: "2020-03-15T00:00:00.000Z",
        merchantPayoutRepository,
      });
    } catch (error) {
      futureError = error;
    }
    assert.ok(futureError, "an in-progress period must be rejected");
    assert.equal(futureError.statusCode, 409);

    // 10. periodStart must be the first instant of a calendar month.
    let alignmentError = null;
    try {
      await adminRunMerchantPayoutBatch({
        authUser: adminUser,
        body: { periodStart: "2020-01-15T00:00:00.000Z" },
        now: "2020-06-01T00:00:00.000Z",
        merchantPayoutRepository,
      });
    } catch (error) {
      alignmentError = error;
    }
    assert.ok(alignmentError, "a mid-month periodStart must be rejected");
    assert.equal(alignmentError.statusCode, 400);

    console.log("merchant-payout-postgres-smoke: all checks passed");
    console.log(`  January:  gross=${janResult.payout.grossAmount} commission=${janResult.payout.platformCommissionAmount} `
      + `net=${janResult.payout.netPayoutAmount}`);
    console.log(`  February: gross=${febResult.payout.grossAmount} commission=${febResult.payout.platformCommissionAmount} `
      + `carried=${febResult.payout.carriedDeductionAmount} net=${febResult.payout.netPayoutAmount}`);
  } finally {
    await cleanup(database);
    await database.close();
  }
}

async function createFixture(database, merchantUserId, customerIds) {
  const orders = [
    { id: orderIdJanA, amount: 1000, capturedAt: "2020-01-10T00:00:00.000Z", customerId: customerIds[0] },
    { id: orderIdJanB, amount: 500, capturedAt: "2020-01-20T00:00:00.000Z", customerId: customerIds[1] },
    { id: orderIdFeb, amount: 1000, capturedAt: "2020-02-15T00:00:00.000Z", customerId: customerIds[2] },
    { id: orderIdMar, amount: 300, capturedAt: "2020-03-15T00:00:00.000Z", customerId: customerIds[3] },
  ];

  await database.transaction(async (transaction) => {
    await transaction.query(`
      INSERT INTO group_buy_activities (
        id, store_id, created_by_user_id, title, status,
        start_at, deadline_at, pickup_start_at, pickup_end_at,
        maximum_cups, withdrawal_lock_minutes, created_at, updated_at
      ) VALUES ($1, 'store-001', $2, 'PostgreSQL Merchant Payout Proof', 'completed',
                '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z',
                '2020-01-03T00:00:00.000Z', '2020-01-04T00:00:00.000Z', 10, 30,
                '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')
    `, [activityId, merchantUserId]);

    for (const order of orders) {
      await transaction.query(`
        INSERT INTO orders (
          id, activity_id, customer_user_id, status, fallback_purchase_preference,
          total_cups, original_amount, final_amount, payment_status,
          authorization_status, merchant_acceptance_status, pickup_status,
          submitted_at, updated_at
        ) VALUES ($1, $2, $3, 'completed', 'decline_original_price',
                  1, $4, $4, 'captured', 'captured', 'accepted', 'picked_up', $5, $5)
      `, [order.id, activityId, order.customerId, order.amount, order.capturedAt]);

      const authorizationId = `payment-authorization-payout-proof-${order.id}`;
      await transaction.query(`
        INSERT INTO payment_authorizations (
          id, order_id, provider, payment_flow, status,
          original_amount, authorized_amount, provider_authorization_id,
          authorized_at, created_at, updated_at
        ) VALUES ($1, $2, 'mock_line_pay', 'authorization', 'captured',
                  $3, $3, $4, $5, $5, $5)
      `, [authorizationId, order.id, order.amount, `mock-txn-${order.id}`, order.capturedAt]);

      const captureId = `payment-capture-payout-proof-${order.id}`;
      await transaction.query(`
        INSERT INTO payment_captures (
          id, payment_authorization_id, order_id, status,
          final_amount, capture_amount, released_amount,
          captured_at, created_at, updated_at
        ) VALUES ($1, $2, $3, 'captured', $4, $4, 0, $5, $5, $5)
      `, [captureId, authorizationId, order.id, order.amount, order.capturedAt]);
    }
  });
}

async function cleanup(database) {
  const orderIds = [orderIdJanA, orderIdJanB, orderIdFeb, orderIdMar];
  const refundIds = orderIds.map((id) => `payment-refund-payout-proof-${id}`);
  await database.transaction(async (transaction) => {
    const payoutRows = await transaction.query(
      "SELECT id FROM merchant_payouts WHERE store_id = 'store-001' AND period_start >= '2020-01-01' AND period_start < '2020-04-01'"
    );
    const payoutIds = payoutRows.rows.map((row) => row.id);
    const adjustmentRows = await transaction.query(
      "SELECT id FROM merchant_payout_adjustments WHERE payment_refund_id = ANY($1::text[])",
      [refundIds]
    );
    const adjustmentIds = adjustmentRows.rows.map((row) => row.id);
    const auditResourceIds = [...payoutIds, ...adjustmentIds];

    if (payoutIds.length > 0) {
      await transaction.query(
        "DELETE FROM merchant_payout_adjustment_applications WHERE merchant_payout_id = ANY($1::text[])",
        [payoutIds]
      );
    }
    if (auditResourceIds.length > 0) {
      await transaction.query(
        "DELETE FROM audit_logs WHERE resource_type = 'merchant_payout' AND resource_id = ANY($1::text[])",
        [auditResourceIds]
      );
    }
    await transaction.query("DELETE FROM merchant_payout_adjustments WHERE payment_refund_id = ANY($1::text[])", [refundIds]);
    if (payoutIds.length > 0) {
      await transaction.query("DELETE FROM merchant_payouts WHERE id = ANY($1::text[])", [payoutIds]);
    }
    await transaction.query("DELETE FROM payment_refunds WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM payment_captures WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM payment_authorizations WHERE order_id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM orders WHERE id = ANY($1::text[])", [orderIds]);
    await transaction.query("DELETE FROM group_buy_activities WHERE id = $1", [activityId]);
    await transaction.query("DELETE FROM operation_locks WHERE lock_key LIKE 'merchant-payout:store-001:2020%'");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
