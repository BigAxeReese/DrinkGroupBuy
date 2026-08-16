"use strict";

const { randomUUID } = require("node:crypto");
const {
  authorizeLinePayPaymentInDatabase,
  cancelPendingLinePayAuthorizationInDatabase,
  claimPaymentReliabilityJobs,
  completeManualLinePayRepaymentInDatabase,
  completePaymentReliabilityJob,
  enqueuePaymentReliabilityJob,
  getLinePayAuthorizationContext,
  listPendingLinePayAuthorizations,
  reschedulePaymentReliabilityJob
} = require("../db");
const {
  checkLinePayPaymentRequestStatus,
  retrieveLinePayPaymentDetails
} = require("./linePayClient");
const { confirmLinePayAuthorization, inferLinePayPaymentState } = require("./linePayService");

const RECONCILIATION_JOB_TYPE = "reconcile_line_pay_request";

function enqueueLinePayReconciliationJob(input) {
  return enqueuePaymentReliabilityJob({
    jobType: RECONCILIATION_JOB_TYPE,
    resourceType: "payment_authorization",
    resourceId: input.authorizationId,
    payload: {
      orderId: input.orderId,
      providerTransactionId: input.providerTransactionId,
      paymentFlow: input.paymentFlow || "authorization",
      amount: input.amount
    },
    maxAttempts: input.maxAttempts || 40,
    runAfter: input.runAfter,
    now: input.now
  });
}

function backfillLinePayReconciliationJobs(input = {}) {
  return listPendingLinePayAuthorizations({ limit: input.limit || 100 }).map((authorization) => (
    enqueueLinePayReconciliationJob({
      authorizationId: authorization.id,
      orderId: authorization.orderId,
      providerTransactionId: authorization.providerTransactionId,
      paymentFlow: authorization.paymentFlow,
      amount: authorization.amount,
      maxAttempts: input.maxAttempts,
      runAfter: input.now,
      now: input.now
    })
  ));
}

async function runLinePayReconciliationJobs(input = {}) {
  const now = input.now || new Date().toISOString();
  const workerId = input.workerId || `line-pay-reconcile-${process.pid}-${randomUUID()}`;
  const retryIntervalMs = positiveInteger(input.retryIntervalMs, 30_000);
  backfillLinePayReconciliationJobs({
    limit: input.backfillLimit || 100,
    maxAttempts: input.maxAttempts,
    now
  });
  const jobs = claimPaymentReliabilityJobs({
    jobType: RECONCILIATION_JOB_TYPE,
    workerId,
    limit: input.limit || 10,
    leaseMs: input.leaseMs || 120_000,
    now
  });
  const dependencies = {
    checker: input.checker || checkLinePayPaymentRequestStatus,
    detailsRetriever: input.detailsRetriever || retrieveLinePayPaymentDetails,
    confirmer: input.confirmer || confirmLinePayAuthorization
  };
  const results = [];
  for (const job of jobs) {
    try {
      const result = await reconcileLinePayRequestJob(job, dependencies);
      const persisted = result.outcome === "retry"
        ? reschedulePaymentReliabilityJob({
            jobId: job.id,
            workerId,
            runAfter: new Date(Date.parse(now) + retryIntervalMs).toISOString(),
            error: result.error,
            now
          })
        : completePaymentReliabilityJob({ jobId: job.id, workerId, now });
      results.push({ job: persisted, result });
    } catch (error) {
      const persisted = reschedulePaymentReliabilityJob({
        jobId: job.id,
        workerId,
        runAfter: new Date(Date.parse(now) + retryIntervalMs).toISOString(),
        error: serializeError(error),
        terminal: Boolean(error.nonRetryable),
        now
      });
      results.push({ job: persisted, error: serializeError(error) });
    }
  }
  return { workerId, claimed: jobs.length, results };
}

async function reconcileLinePayRequestJob(job, dependencies) {
  const context = getLinePayAuthorizationContext({
    orderId: job.payload.orderId,
    providerTransactionId: job.payload.providerTransactionId,
    provider: "line_pay"
  });
  if (!context) return { outcome: "complete", status: "authorization_missing" };
  if (context.authorization.status !== "pending") {
    return { outcome: "complete", status: context.authorization.status };
  }

  const transactionId = context.authorization.providerAuthorizationId;
  const statusPayload = await dependencies.checker(transactionId);
  const returnCode = String(statusPayload?.returnCode || "");
  if (returnCode === "0000") {
    return {
      outcome: "retry",
      status: "authentication_pending",
      error: { returnCode, returnMessage: statusPayload?.returnMessage || null }
    };
  }
  if (returnCode === "0110") {
    const result = await dependencies.confirmer({
      transactionId,
      orderId: context.authorization.orderId
    });
    return { outcome: "complete", status: "confirmed", result };
  }
  if (returnCode === "0121" || returnCode === "0122") {
    const failed = cancelPendingLinePayAuthorizationInDatabase({
      orderId: context.authorization.orderId,
      providerTransactionId: transactionId,
      reason: returnCode === "0121"
        ? "line_pay_request_cancelled_or_expired"
        : "line_pay_request_failed"
    });
    return { outcome: "complete", status: failed?.status || "failed", returnCode };
  }
  if (returnCode === "0123") {
    const details = await dependencies.detailsRetriever(transactionId);
    return reconcileCompletedPayment(context, transactionId, details);
  }

  const error = new Error(`Unexpected LINE Pay request status: ${returnCode || "missing"}`);
  error.linePayPayload = statusPayload;
  throw error;
}

function reconcileCompletedPayment(context, transactionId, providerPayload) {
  const providerState = inferLinePayPaymentState(providerPayload);
  if (context.authorization.paymentFlow === "direct_repayment") {
    if (providerState !== "captured") {
      return {
        outcome: "retry",
        status: "direct_repayment_not_captured",
        error: { providerState }
      };
    }
    const result = completeManualLinePayRepaymentInDatabase({
      orderId: context.authorization.orderId,
      providerTransactionId: transactionId,
      amount: context.amount,
      providerCaptureId: transactionId,
      providerPayload
    });
    return { outcome: "complete", status: "captured", result };
  }
  if (providerState === "authorized") {
    const result = authorizeLinePayPaymentInDatabase({
      orderId: context.authorization.orderId,
      orderRevisionId: context.authorization.orderRevisionId || null,
      providerTransactionId: transactionId,
      amount: context.amount,
      providerPayload
    });
    return { outcome: "complete", status: "authorized", result };
  }
  if (providerState === "captured") {
    const error = new Error(
      "Provider reports a captured payment for an authorization flow; manual review required"
    );
    error.nonRetryable = true;
    error.linePayPayload = providerPayload;
    throw error;
  }
  return {
    outcome: "retry",
    status: "provider_state_unknown",
    error: { providerState }
  };
}

function startLinePayReconciliationScheduler(input = {}) {
  const enabled = input.enabled ?? readBooleanEnv(process.env.PAYMENT_RECONCILIATION_ENABLED, true);
  const logger = input.logger || console;
  if (!enabled) return stoppedScheduler("disabled");
  const isProduction = (process.env.NODE_ENV || "development") === "production";
  const allowProduction = readBooleanEnv(
    process.env.PAYMENT_RECONCILIATION_ALLOW_PRODUCTION,
    false
  );
  if (isProduction && !allowProduction) return stoppedScheduler("production_not_enabled");

  const intervalMs = positiveInteger(
    process.env.PAYMENT_RECONCILIATION_INTERVAL_MS || input.intervalMs,
    15_000
  );
  let running = false;
  let stopped = false;
  async function runOnce() {
    if (running || stopped) return null;
    running = true;
    try {
      const summary = await runLinePayReconciliationJobs({
        limit: positiveInteger(
          process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || input.limit,
          10
        ),
        leaseMs: positiveInteger(
          process.env.PAYMENT_RECONCILIATION_LEASE_MS || input.leaseMs,
          120_000
        ),
        maxAttempts: positiveInteger(
          process.env.PAYMENT_RECONCILIATION_MAX_ATTEMPTS || input.maxAttempts,
          40
        ),
        retryIntervalMs: positiveInteger(
          process.env.PAYMENT_RECONCILIATION_RETRY_INTERVAL_MS || input.retryIntervalMs,
          30_000
        )
      });
      logAlertRequiredJobs(summary.results, logger, "line_pay_reconciliation");
      return summary;
    } catch (error) {
      logger.error?.("[line-pay-reconciliation]", error);
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
    runOnce,
    stop() {
      stopped = true;
      clearInterval(interval);
    }
  };
}

function stoppedScheduler(reason) {
  return { enabled: false, reason, runOnce: async () => null, stop() {} };
}

function logAlertRequiredJobs(results, logger, source) {
  for (const entry of results || []) {
    if (!entry.job?.alertRequired) continue;
    logger.error?.("[payment-reliability-alert]", {
      source,
      jobId: entry.job.id,
      jobType: entry.job.jobType,
      resourceType: entry.job.resourceType,
      resourceId: entry.job.resourceId,
      status: entry.job.status,
      attemptCount: entry.job.attemptCount,
      maxAttempts: entry.job.maxAttempts,
      lastError: entry.job.lastError
    });
  }
}

function positiveInteger(value, fallback) {
  const numberValue = Number(value ?? fallback);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function readBooleanEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function serializeError(error) {
  return {
    message: error?.message || String(error),
    linePayPayload: error?.linePayPayload || null
  };
}

module.exports = {
  backfillLinePayReconciliationJobs,
  enqueueLinePayReconciliationJob,
  logAlertRequiredJobs,
  reconcileLinePayRequestJob,
  runLinePayReconciliationJobs,
  startLinePayReconciliationScheduler
};
