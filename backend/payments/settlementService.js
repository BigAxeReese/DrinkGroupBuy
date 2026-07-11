const {
  completeGroupBuySettlement,
  createGroupBuySettlementPlan,
  listDueGroupBuyActivitiesForSettlement
} = require("../db");
const {
  captureLinePayAuthorization,
  voidLinePayAuthorization
} = require("./linePayService");

async function settleGroupBuyActivity({ activityId, actorUserId, force = false, now } = {}) {
  const plan = createGroupBuySettlementPlan(activityId, {
    actorUserId,
    force,
    now
  });

  if (!plan || plan.error) {
    return plan;
  }

  const results = [];
  const failures = [];

  for (const order of plan.orders) {
    if (order.action === "already_captured") {
      results.push({
        orderId: order.id,
        action: order.action,
        status: "skipped",
        reason: order.actionReason
      });
      continue;
    }

    if (order.action === "error_missing_authorization") {
      failures.push({
        orderId: order.id,
        action: order.action,
        error: order.actionReason
      });
      continue;
    }

    try {
      if (order.action === "capture") {
        const captureResult = await captureLinePayAuthorization({
          orderId: order.id,
          transactionId: order.providerTransactionId,
          provider: order.paymentProvider,
          amount: order.captureAmount,
          finalAmount: order.finalAmount,
          reason: `deadline_settlement_${order.actionReason}`
        });

        results.push({
          orderId: order.id,
          action: "capture",
          status: captureResult?.status || "captured",
          capture: captureResult?.capture || null
        });
        continue;
      }

      const voidResult = await voidLinePayAuthorization({
        orderId: order.id,
        transactionId: order.providerTransactionId,
        provider: order.paymentProvider,
        reason: `deadline_settlement_${order.actionReason}`
      });

      results.push({
        orderId: order.id,
        action: "void",
        status: voidResult?.status || "authorization_voided",
        authorization: voidResult?.authorization || null
      });
    } catch (error) {
      failures.push({
        orderId: order.id,
        action: order.action,
        error: error.payload || { message: error.message }
      });
    }
  }

  if (failures.length > 0) {
    return {
      error: "settlement_payment_failures",
      plan,
      results,
      failures
    };
  }

  const capturedOrderCount = plan.orders.filter((order) => order.action === "already_captured").length
    + results.filter((result) => result.action === "capture").length;
  const voidedOrderCount = results.filter((result) => result.action === "void").length;
  const completion = completeGroupBuySettlement(activityId, {
    actorUserId,
    outcome: plan.outcome,
    authorizedCups: plan.authorizedCups,
    appliedTierId: plan.appliedTier?.id || null,
    discountAmount: plan.appliedTier?.discountAmount || 0,
    capturedOrderCount,
    voidedOrderCount,
    reason: "deadline_settlement_completed",
    now
  });

  return {
    plan,
    results,
    capturedOrderCount,
    voidedOrderCount,
    settlement: completion?.settlement || null,
    activity: completion?.activity || null
  };
}

async function runDueGroupBuySettlements(input = {}) {
  const now = input.now || new Date().toISOString();
  const dueActivities = listDueGroupBuyActivitiesForSettlement({
    now,
    limit: input.limit
  });
  const results = [];
  const failures = [];

  for (const activity of dueActivities) {
    try {
      const result = await settleGroupBuyActivity({
        activityId: activity.id,
        actorUserId: input.actorUserId || null,
        now
      });

      if (!result) {
        failures.push({
          activityId: activity.id,
          error: "activity_not_found"
        });
        continue;
      }

      if (result.error === "activity_already_settled" || result.error === "settlement_not_due") {
        results.push({
          activityId: activity.id,
          status: "skipped",
          error: result.error,
          result
        });
        continue;
      }

      if (result.error) {
        failures.push({
          activityId: activity.id,
          error: result.error,
          result
        });
        continue;
      }

      results.push({
        activityId: activity.id,
        status: "settled",
        result
      });
    } catch (error) {
      failures.push({
        activityId: activity.id,
        error: error.payload || { message: error.message }
      });
    }
  }

  return {
    checkedAt: now,
    dueActivityCount: dueActivities.length,
    settledCount: results.filter((result) => result.status === "settled").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    failedCount: failures.length,
    results,
    failures
  };
}

function startDeadlineSettlementScheduler(input = {}) {
  const env = input.env || process.env;
  const enabled = readBooleanEnv(env.SETTLEMENT_SCHEDULER_ENABLED, true);
  const linePayEnv = String(env.LINE_PAY_ENV || "sandbox").toLowerCase();
  const allowProduction = readBooleanEnv(env.SETTLEMENT_SCHEDULER_ALLOW_PRODUCTION, false);

  if (!enabled) {
    return createStoppedScheduler("disabled");
  }

  if (linePayEnv === "production" && !allowProduction) {
    return createStoppedScheduler("production_guard");
  }

  const intervalMs = normalizeSchedulerNumber(env.SETTLEMENT_SCHEDULER_INTERVAL_MS, input.intervalMs, 60_000);
  const limit = normalizeSchedulerNumber(env.SETTLEMENT_SCHEDULER_BATCH_SIZE, input.limit, 20);
  const actorUserId = env.SETTLEMENT_SCHEDULER_ACTOR_USER_ID || input.actorUserId || null;
  const logger = input.logger || console;
  let running = false;
  let stopped = false;

  async function runOnce() {
    if (running || stopped) {
      return null;
    }

    running = true;
    try {
      const summary = await runDueGroupBuySettlements({
        actorUserId,
        limit
      });

      if (summary.dueActivityCount > 0 || summary.failedCount > 0) {
        logger.info?.("[settlement-scheduler] run completed", {
          checkedAt: summary.checkedAt,
          dueActivityCount: summary.dueActivityCount,
          settledCount: summary.settledCount,
          skippedCount: summary.skippedCount,
          failedCount: summary.failedCount
        });
      }

      return summary;
    } catch (error) {
      logger.error?.("[settlement-scheduler] run failed", {
        message: error.message,
        stack: error.stack
      });
      return {
        error: error.message
      };
    } finally {
      running = false;
    }
  }

  const interval = setInterval(runOnce, intervalMs);
  runOnce();

  return {
    enabled: true,
    reason: "enabled",
    intervalMs,
    limit,
    runOnce,
    stop() {
      stopped = true;
      clearInterval(interval);
    }
  };
}

function createStoppedScheduler(reason) {
  return {
    enabled: false,
    reason,
    runOnce: async () => null,
    stop() {}
  };
}

function normalizeSchedulerNumber(envValue, inputValue, fallback) {
  const numberValue = Number(envValue ?? inputValue ?? fallback);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return fallback;
  }
  return numberValue;
}

function readBooleanEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

module.exports = {
  runDueGroupBuySettlements,
  startDeadlineSettlementScheduler,
  settleGroupBuyActivity
};
