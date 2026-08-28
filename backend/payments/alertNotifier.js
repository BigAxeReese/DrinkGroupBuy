"use strict";

// Sends payment-reliability alerts to an operator-configured webhook, on top of the existing
// structured log line -- log-only alerting means someone has to remember to go looking for it,
// which docs/payment-rules-and-flow.md and PROGRESS.md flag as a production blocker.
// ALERT_WEBHOOK_URL is generic (Slack/Discord/Mattermost incoming webhook, or any custom
// endpoint that accepts a JSON POST) so this doesn't lock the project into one notification
// vendor -- same "URL in an env var" pattern already used for LINE Pay's confirm/cancel URLs.
// Unset ALERT_WEBHOOK_URL is a deliberate no-op, not an error: sandbox/dev environments and
// this project's own automated tests never configure it.

const WEBHOOK_TIMEOUT_MS = 5_000;

async function sendPaymentReliabilityJobAlert(entry, { source, logger = console } = {}) {
  const job = entry?.job;
  if (!job) return { sent: false, reason: "missing_job" };

  const lastError = summarizeLastErrorForAlert(job.lastError);
  const lines = [
    "[DrinkGroupBuy] 付款背景工作失敗，已放棄重試，需要人工處理",
    `來源: ${source}`,
    `工作類型: ${job.jobType}`,
    `資源: ${job.resourceType} ${job.resourceId}`,
    `狀態: ${job.status}（已重試 ${job.attemptCount}/${job.maxAttempts} 次）`,
    `最後錯誤: ${lastError ? JSON.stringify(lastError) : "無"}`
  ];

  return postAlertWebhook({
    text: lines.join("\n"),
    kind: "payment_reliability_job_alert",
    source,
    job: {
      id: job.id,
      jobType: job.jobType,
      resourceType: job.resourceType,
      resourceId: job.resourceId,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      lastError
    }
  }, logger);
}

// The settlement scheduler persists its whole per-activity result (a "settlement_payment_failures"
// job's error carries `plan`/`results`/`failures`, each an array with every order in the activity --
// customerUserId, providerTransactionId, per-order amounts) as job.lastError, since that's useful
// detail for on-call debugging straight from the database or server log. This webhook goes to a
// third party the operator points it at (Slack/Discord/etc, per this module's own design), which
// is a materially bigger blast radius than server-local storage -- so trim those per-order arrays
// down to counts before it leaves the process, keeping the small reconciliation-job error shape
// ({message, linePayPayload}) untouched since it was never large to begin with.
function summarizeLastErrorForAlert(lastError) {
  if (!lastError || typeof lastError !== "object") return lastError ?? null;
  const { plan, results, failures, ...safeFields } = lastError;
  const summary = { ...safeFields };
  if (Array.isArray(failures)) summary.failureCount = failures.length;
  if (Array.isArray(results)) summary.resultCount = results.length;
  if (Array.isArray(plan?.orders)) summary.orderCount = plan.orders.length;
  return summary;
}

async function sendSchedulerFailureAlert(error, { source, logger = console } = {}) {
  const lines = [
    "[DrinkGroupBuy] 付款背景排程本身執行失敗（不是單一工作失敗，是整個排程掛了）",
    `來源: ${source}`,
    `錯誤訊息: ${error?.message || String(error)}`
  ];

  return postAlertWebhook({
    text: lines.join("\n"),
    kind: "scheduler_failure_alert",
    source,
    error: { message: error?.message || String(error) }
  }, logger);
}

async function postAlertWebhook(payload, logger) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    });
    if (!response.ok) {
      logger.error?.("[payment-reliability-alert] webhook responded with an error status", {
        status: response.status,
        kind: payload.kind
      });
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    // A broken webhook must never take down the reliability scheduler itself -- the structured
    // log line this runs alongside is still the source of truth if the webhook call fails.
    logger.error?.("[payment-reliability-alert] webhook call failed", {
      message: error.message,
      kind: payload.kind
    });
    return { sent: false, reason: "request_failed" };
  }
}

module.exports = { sendPaymentReliabilityJobAlert, sendSchedulerFailureAlert };
