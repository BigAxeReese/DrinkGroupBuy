const {
  expireGroupBuyPickupWindow,
  listDueGroupBuyActivitiesForPickupExpiration
} = require("../db");

async function runDuePickupExpirations(input = {}) {
  const now = input.now || new Date().toISOString();
  const limit = normalizeSchedulerNumber(input.limit, 20);
  const actorUserId = input.actorUserId || null;
  const dueActivities = listDueGroupBuyActivitiesForPickupExpiration({ now, limit });
  const results = [];
  const failures = [];

  for (const activity of dueActivities) {
    try {
      const result = expireGroupBuyPickupWindow(activity.id, { now, actorUserId });
      results.push({ activityId: activity.id, status: result.status, ...result });
    } catch (error) {
      failures.push({ activityId: activity.id, error: error.message });
    }
  }

  return {
    checkedAt: now,
    dueActivityCount: dueActivities.length,
    expiredActivityCount: results.filter((result) => result.status === "completed").length,
    skippedCount: results.filter((result) => result.status !== "completed").length,
    failedCount: failures.length,
    results,
    failures
  };
}

function startPickupExpirationScheduler(input = {}) {
  const env = input.env || process.env;
  const enabled = readBooleanEnv(env.PICKUP_EXPIRATION_SCHEDULER_ENABLED, true);
  if (!enabled) return createStoppedScheduler("disabled");

  const intervalMs = normalizeSchedulerNumber(
    env.PICKUP_EXPIRATION_SCHEDULER_INTERVAL_MS ?? input.intervalMs,
    30_000
  );
  const limit = normalizeSchedulerNumber(
    env.PICKUP_EXPIRATION_SCHEDULER_BATCH_SIZE ?? input.limit,
    20
  );
  const actorUserId = env.PICKUP_EXPIRATION_SCHEDULER_ACTOR_USER_ID || input.actorUserId || null;
  const logger = input.logger || console;
  let running = false;
  let stopped = false;

  async function runOnce() {
    if (running || stopped) return null;
    running = true;
    try {
      const summary = await runDuePickupExpirations({ actorUserId, limit });
      if (summary.dueActivityCount > 0 || summary.failedCount > 0) {
        logger.info?.("[pickup-expiration-scheduler] run completed", summary);
      }
      return summary;
    } catch (error) {
      logger.error?.("[pickup-expiration-scheduler] run failed", {
        message: error.message,
        stack: error.stack
      });
      return { error: error.message };
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

function normalizeSchedulerNumber(value, fallback) {
  const numberValue = Number(value ?? fallback);
  if (!Number.isInteger(numberValue) || numberValue <= 0) return fallback;
  return numberValue;
}

function readBooleanEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

module.exports = {
  runDuePickupExpirations,
  startPickupExpirationScheduler
};
