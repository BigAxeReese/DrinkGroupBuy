"use strict";

// Service layer for the simulated merchant payout feature. See
// backend/database/repositories/merchantPayoutRepository.js for why this is
// PostgreSQL-only, and docs/payment-rules-and-flow.md for the business rules.

const { PaymentServiceError } = require("./linePayService");

const DEFAULT_COMMISSION_RATE_BP = 1500; // 15%, a placeholder for demo purposes only.

function resolvePlatformCommissionRateBp(env = process.env) {
  const raw = env.PLATFORM_COMMISSION_RATE_BP;
  if (raw == null || raw === "") return DEFAULT_COMMISSION_RATE_BP;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 0 || number > 10000) {
    throw new Error("PLATFORM_COMMISSION_RATE_BP must be an integer between 0 and 10000 (basis points)");
  }
  return number;
}

async function adminRunMerchantPayoutBatch({ authUser, body, now, merchantPayoutRepository } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }
  if (!merchantPayoutRepository) {
    throw new PaymentServiceError(503, { error: "Merchant payout runtime is not ready" });
  }

  const nowIso = now || new Date().toISOString();
  const periodStartDate = resolvePeriodStart(body?.periodStart, nowIso);
  const periodEndDate = periodEndFromStart(periodStartDate);
  if (periodEndDate.getTime() > Date.parse(nowIso)) {
    throw new PaymentServiceError(409, {
      error: "Cannot run a payout batch for a period that has not ended yet",
      periodStart: periodStartDate.toISOString(),
      periodEnd: periodEndDate.toISOString()
    });
  }

  const commissionRateBp = resolvePlatformCommissionRateBp();
  const periodStart = periodStartDate.toISOString();
  const periodEnd = periodEndDate.toISOString();

  const storeIds = await merchantPayoutRepository.listStoreIdsWithCapturesInPeriod({ periodStart, periodEnd });

  const payouts = [];
  const failedStoreIds = [];
  for (const storeId of storeIds) {
    try {
      const result = await merchantPayoutRepository.calculatePayout({
        storeId,
        periodStart,
        periodEnd,
        commissionRateBp,
        actorUserId: authUser.id,
        now: nowIso
      });
      payouts.push(result.payout);
    } catch (error) {
      failedStoreIds.push({ storeId, error: error.message });
    }
  }

  return { periodStart, periodEnd, commissionRateBp, storeCount: storeIds.length, payouts, failedStoreIds };
}

async function listMerchantPayoutsForStore({ authUser, storeId, merchantPayoutRepository } = {}) {
  if (!authUser?.roles?.includes("merchant")) {
    throw new PaymentServiceError(403, { error: "Merchant role required" });
  }
  if (!authUser.merchantStores?.some((store) => store.id === storeId)) {
    throw new PaymentServiceError(403, { error: "Store access denied" });
  }
  if (!merchantPayoutRepository) {
    throw new PaymentServiceError(503, { error: "Merchant payout runtime is not ready" });
  }

  const payouts = await merchantPayoutRepository.listPayoutsForStore({ storeId });
  return { payouts };
}

async function listMerchantPayoutsForAdmin({ authUser, query, merchantPayoutRepository } = {}) {
  if (!authUser?.roles?.includes("admin")) {
    throw new PaymentServiceError(403, { error: "Admin role required" });
  }
  if (!merchantPayoutRepository) {
    throw new PaymentServiceError(503, { error: "Merchant payout runtime is not ready" });
  }

  const payouts = await merchantPayoutRepository.listPayoutsForAdmin({
    storeId: query?.storeId || undefined,
    periodStart: query?.periodStart || undefined
  });
  return { payouts };
}

function resolvePeriodStart(rawPeriodStart, nowIso) {
  if (rawPeriodStart) {
    const date = new Date(rawPeriodStart);
    if (Number.isNaN(date.getTime())) {
      throw new PaymentServiceError(400, { error: "periodStart must be a valid date" });
    }
    const isFirstOfMonthUtc = date.getUTCDate() === 1
      && date.getUTCHours() === 0
      && date.getUTCMinutes() === 0
      && date.getUTCSeconds() === 0
      && date.getUTCMilliseconds() === 0;
    if (!isFirstOfMonthUtc) {
      throw new PaymentServiceError(400, {
        error: "periodStart must be the first instant of a calendar month in UTC (e.g. 2026-08-01T00:00:00.000Z)"
      });
    }
    return date;
  }
  const now = new Date(nowIso);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

function periodEndFromStart(periodStartDate) {
  return new Date(Date.UTC(periodStartDate.getUTCFullYear(), periodStartDate.getUTCMonth() + 1, 1));
}

module.exports = {
  adminRunMerchantPayoutBatch,
  listMerchantPayoutsForAdmin,
  listMerchantPayoutsForStore,
  resolvePlatformCommissionRateBp
};
