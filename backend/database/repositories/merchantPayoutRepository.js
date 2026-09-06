"use strict";

// Simulated merchant payout: the platform collects every store's LINE Pay captures
// through a single platform account, then once per calendar month computes and records
// a net amount owed to each store. "Simulated" -- this never calls a real bank transfer
// API, it only writes a row that is the demo's system of record. See
// docs/payment-rules-and-flow.md for the business rules this implements.
//
// Unlike most repositories in this codebase, this one is PostgreSQL-only. It was built
// after AGENTS.md permanently switched local development to PostgreSQL ("SQLite 僅保留給
// 明確隔離的相容性測試"), so it does not carry a parallel SQLite implementation the way
// older, pre-switch slices do.

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function createMerchantPayoutRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    calculatePayout: (value) => calculateAndRecordPostgresPayout(database, value),
    listPayoutsForStore: (value) => listPostgresPayoutsForStore(database, value),
    listPayoutsForAdmin: (value) => listPostgresPayoutsForAdmin(database, value),
    listStoreIdsWithCapturesInPeriod: (value) => listPostgresStoreIdsWithCapturesInPeriod(database, value),
    recordPostPayoutRefundAdjustment: (value) => recordPostgresPostPayoutRefundAdjustment(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function withPostgresPayoutLock(database, input, operation) {
  const lockKey = `merchant-payout:${input.storeId}:${input.periodStart}:${input.periodEnd}`;
  const ownerId = input.lockOwnerId || `merchant-payout-${process.pid}-${randomUUID()}`;
  const now = input.now || new Date().toISOString();
  const leaseMs = 300_000;
  const lockedUntil = new Date(Date.parse(now) + leaseMs).toISOString();
  const acquired = await database.query(`
    INSERT INTO operation_locks (lock_key, owner_id, locked_until, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (lock_key) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        locked_until = EXCLUDED.locked_until,
        updated_at = EXCLUDED.updated_at
    WHERE operation_locks.locked_until <= $4
    RETURNING lock_key
  `, [lockKey, ownerId, lockedUntil, now]);
  if (!acquired.rows[0]) {
    return { error: "payout_locked", storeId: input.storeId };
  }
  try {
    return await operation();
  } finally {
    await database.query(
      "DELETE FROM operation_locks WHERE lock_key = $1 AND owner_id = $2",
      [lockKey, ownerId]
    );
  }
}

async function calculateAndRecordPostgresPayout(database, input = {}) {
  const now = input.now || new Date().toISOString();
  const storeId = requiredString(input.storeId, "storeId");
  const periodStart = requiredString(input.periodStart, "periodStart");
  const periodEnd = requiredString(input.periodEnd, "periodEnd");
  const commissionRateBp = normalizeCommissionRateBp(input.commissionRateBp);
  const actorUserId = input.actorUserId || null;

  return withPostgresPayoutLock(database, { storeId, periodStart, periodEnd, now }, () => (
    database.transaction(async (transaction) => {
      const existing = await transaction.query(`
        SELECT * FROM merchant_payouts
        WHERE store_id = $1 AND period_start = $2 AND period_end = $3
      `, [storeId, periodStart, periodEnd]);
      if (existing.rows[0]) {
        return { payout: mapPayout(existing.rows[0]), alreadyExists: true, adjustmentsApplied: [] };
      }

      // Captures/refunds are terminal, already-committed financial records by the time a
      // payout batch runs for a past period, so this aggregate read does not need FOR
      // UPDATE (which Postgres disallows alongside aggregate functions anyway) -- the
      // operation_locks acquisition above is what prevents two concurrent batch runs from
      // double-processing the same store+period.
      const totals = await transaction.query(`
        SELECT
          COALESCE(SUM(pc.capture_amount), 0) AS gross_amount,
          COALESCE((
            SELECT SUM(pr.refund_amount)
            FROM payment_refunds pr
            WHERE pr.status = 'refunded'
              AND pr.payment_capture_id IN (
                SELECT pc2.id
                FROM payment_captures pc2
                JOIN orders o2 ON o2.id = pc2.order_id
                JOIN group_buy_activities activity2 ON activity2.id = o2.activity_id
                WHERE activity2.store_id = $1
                  AND pc2.status = 'captured'
                  AND pc2.captured_at >= $2 AND pc2.captured_at < $3
              )
          ), 0) AS refund_amount
        FROM payment_captures pc
        JOIN orders o ON o.id = pc.order_id
        JOIN group_buy_activities activity ON activity.id = o.activity_id
        WHERE activity.store_id = $1
          AND pc.status = 'captured'
          AND pc.captured_at >= $2 AND pc.captured_at < $3
      `, [storeId, periodStart, periodEnd]);
      const grossAmount = Number(totals.rows[0]?.gross_amount || 0);
      const refundWithinPeriodAmount = Number(totals.rows[0]?.refund_amount || 0);
      const platformCommissionAmount = Math.floor(grossAmount * commissionRateBp / 10000);
      const availableBeforeDeduction = Math.max(
        0,
        grossAmount - refundWithinPeriodAmount - platformCommissionAmount
      );

      const outstandingAdjustments = await transaction.query(`
        SELECT * FROM merchant_payout_adjustments
        WHERE store_id = $1 AND status = 'pending' AND remaining_amount > 0
        ORDER BY created_at ASC
        FOR UPDATE
      `, [storeId]);

      let remainingAvailable = availableBeforeDeduction;
      let carriedDeductionAmount = 0;
      const applications = [];
      for (const adjustmentRow of outstandingAdjustments.rows) {
        if (remainingAvailable <= 0) break;
        const remainingOnAdjustment = Number(adjustmentRow.remaining_amount);
        const applyAmount = Math.min(remainingAvailable, remainingOnAdjustment);
        if (applyAmount <= 0) continue;
        applications.push({ adjustmentRow, applyAmount });
        remainingAvailable -= applyAmount;
        carriedDeductionAmount += applyAmount;
      }
      const netPayoutAmount = availableBeforeDeduction - carriedDeductionAmount;

      const payoutId = `merchant-payout-${randomUUID()}`;
      const inserted = await transaction.query(`
        INSERT INTO merchant_payouts (
          id, store_id, period_start, period_end, gross_amount, refund_within_period_amount,
          platform_commission_amount, carried_deduction_amount, net_payout_amount,
          commission_rate_bp, triggered_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
        RETURNING *
      `, [payoutId, storeId, periodStart, periodEnd, grossAmount, refundWithinPeriodAmount,
        platformCommissionAmount, carriedDeductionAmount, netPayoutAmount,
        commissionRateBp, actorUserId, now]);
      const payout = inserted.rows[0];

      const adjustmentsApplied = [];
      for (const { adjustmentRow, applyAmount } of applications) {
        const newRemaining = Number(adjustmentRow.remaining_amount) - applyAmount;
        await transaction.query(`
          UPDATE merchant_payout_adjustments
          SET remaining_amount = $1,
              status = CASE WHEN $1 <= 0 THEN 'fully_applied' ELSE 'pending' END,
              updated_at = $2
          WHERE id = $3
        `, [newRemaining, now, adjustmentRow.id]);
        await transaction.query(`
          INSERT INTO merchant_payout_adjustment_applications (
            id, merchant_payout_id, merchant_payout_adjustment_id, applied_amount, created_at
          ) VALUES ($1, $2, $3, $4, $5)
        `, [`merchant-payout-application-${randomUUID()}`, payout.id, adjustmentRow.id, applyAmount, now]);
        adjustmentsApplied.push({
          adjustmentId: adjustmentRow.id,
          paymentRefundId: adjustmentRow.payment_refund_id,
          appliedAmount: applyAmount,
          remainingAmount: newRemaining,
        });
      }

      await insertAudit(transaction, actorUserId, "simulate_merchant_payout", payout.id, {
        storeId,
        periodStart,
        periodEnd,
        grossAmount,
        refundWithinPeriodAmount,
        platformCommissionAmount,
        carriedDeductionAmount,
        netPayoutAmount,
        commissionRateBp,
        adjustmentsApplied,
      }, now);

      return { payout: mapPayout(payout), alreadyExists: false, adjustmentsApplied };
    })
  ));
}

async function listPostgresStoreIdsWithCapturesInPeriod(database, input = {}) {
  const periodStart = requiredString(input.periodStart, "periodStart");
  const periodEnd = requiredString(input.periodEnd, "periodEnd");
  const result = await database.query(`
    SELECT DISTINCT activity.store_id
    FROM payment_captures pc
    JOIN orders o ON o.id = pc.order_id
    JOIN group_buy_activities activity ON activity.id = o.activity_id
    WHERE pc.status = 'captured'
      AND pc.captured_at >= $1 AND pc.captured_at < $2
  `, [periodStart, periodEnd]);
  return result.rows.map((row) => row.store_id);
}

async function listPostgresPayoutsForStore(database, input = {}) {
  const limit = normalizeLimit(input.limit, 24);
  const result = await database.query(`
    SELECT * FROM merchant_payouts
    WHERE store_id = $1
    ORDER BY period_start DESC
    LIMIT $2
  `, [requiredString(input.storeId, "storeId"), limit]);
  return result.rows.map(mapPayout);
}

async function listPostgresPayoutsForAdmin(database, input = {}) {
  const limit = normalizeLimit(input.limit, 100);
  const result = await database.query(`
    SELECT * FROM merchant_payouts
    WHERE ($1::text IS NULL OR store_id = $1)
      AND ($2::timestamptz IS NULL OR period_start = $2)
    ORDER BY period_start DESC, store_id ASC
    LIMIT $3
  `, [input.storeId || null, input.periodStart || null, limit]);
  return result.rows.map(mapPayout);
}

// Called after a refund succeeds on an already-captured order. If the capture's period
// was already paid out (a merchant_payouts row exists covering captured_at), that period
// is closed and cannot be re-netted -- record an adjustment to be deducted from the
// store's future payouts instead. If the period hasn't been paid out yet, this is a
// no-op: the eventual batch run for that period will read payment_refunds live and net
// it directly, the same as any other refund inside an open period.
async function recordPostgresPostPayoutRefundAdjustment(database, input = {}) {
  const now = input.now || new Date().toISOString();
  const paymentRefundId = requiredString(input.paymentRefundId, "paymentRefundId");
  const paymentCaptureId = requiredString(input.paymentCaptureId, "paymentCaptureId");
  const refundAmount = toPositiveInteger(input.refundAmount, "refundAmount");
  const actorUserId = input.actorUserId || null;

  return database.transaction(async (transaction) => {
    const captureContext = await transaction.query(`
      SELECT pc.captured_at, activity.store_id
      FROM payment_captures pc
      JOIN orders o ON o.id = pc.order_id
      JOIN group_buy_activities activity ON activity.id = o.activity_id
      WHERE pc.id = $1
    `, [paymentCaptureId]);
    const context = captureContext.rows[0];
    if (!context || !context.captured_at) {
      return { adjustmentCreated: false, reason: "capture_not_found" };
    }

    const coveringPayout = await transaction.query(`
      SELECT id FROM merchant_payouts
      WHERE store_id = $1 AND period_start <= $2 AND period_end > $2
      LIMIT 1
    `, [context.store_id, context.captured_at]);
    const payoutRow = coveringPayout.rows[0];
    if (!payoutRow) {
      return { adjustmentCreated: false, reason: "period_not_yet_paid_out" };
    }

    const inserted = await transaction.query(`
      INSERT INTO merchant_payout_adjustments (
        id, store_id, payment_refund_id, source_merchant_payout_id,
        total_amount, remaining_amount, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $5, 'pending', $6, $6)
      ON CONFLICT (payment_refund_id) DO NOTHING
      RETURNING *
    `, [`merchant-payout-adjustment-${randomUUID()}`, context.store_id, paymentRefundId,
      payoutRow.id, refundAmount, now]);
    if (!inserted.rows[0]) {
      const existing = await transaction.query(
        "SELECT * FROM merchant_payout_adjustments WHERE payment_refund_id = $1",
        [paymentRefundId]
      );
      return { adjustmentCreated: false, alreadyExists: true, adjustment: mapAdjustment(existing.rows[0]) };
    }

    await insertAudit(transaction, actorUserId, "record_merchant_payout_adjustment", inserted.rows[0].id, {
      storeId: context.store_id,
      paymentRefundId,
      paymentCaptureId,
      sourceMerchantPayoutId: payoutRow.id,
      totalAmount: refundAmount,
    }, now);

    return { adjustmentCreated: true, adjustment: mapAdjustment(inserted.rows[0]) };
  });
}

async function insertAudit(database, actorUserId, actionType, resourceId, metadata, now) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, $2, $3, 'merchant_payout', $4, $5::jsonb, $6)
  `, [`audit-log-${randomUUID()}`, actorUserId, actionType, resourceId, JSON.stringify(metadata), now]);
}

function mapPayout(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    periodStart: toIsoString(row.period_start),
    periodEnd: toIsoString(row.period_end),
    grossAmount: Number(row.gross_amount),
    refundWithinPeriodAmount: Number(row.refund_within_period_amount),
    platformCommissionAmount: Number(row.platform_commission_amount),
    carriedDeductionAmount: Number(row.carried_deduction_amount),
    netPayoutAmount: Number(row.net_payout_amount),
    commissionRateBp: Number(row.commission_rate_bp),
    triggeredByUserId: row.triggered_by_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAdjustment(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    paymentRefundId: row.payment_refund_id,
    sourceMerchantPayoutId: row.source_merchant_payout_id,
    totalAmount: Number(row.total_amount),
    remainingAmount: Number(row.remaining_amount),
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizeCommissionRateBp(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 10000) {
    throw new Error("commissionRateBp must be an integer between 0 and 10000");
  }
  return number;
}

function normalizeLimit(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, 200) : fallback;
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function toPositiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return number;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

module.exports = {
  calculateAndRecordPostgresPayout,
  createMerchantPayoutRepository,
  listPostgresPayoutsForAdmin,
  listPostgresPayoutsForStore,
  listPostgresStoreIdsWithCapturesInPeriod,
  mapAdjustment,
  mapPayout,
  recordPostgresPostPayoutRefundAdjustment,
};
