"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { sendPaymentReliabilityJobAlert, sendSchedulerFailureAlert } = require("./alertNotifier");

function withWebhookUrl(url, fn) {
  const previous = process.env.ALERT_WEBHOOK_URL;
  if (url == null) delete process.env.ALERT_WEBHOOK_URL;
  else process.env.ALERT_WEBHOOK_URL = url;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous == null) delete process.env.ALERT_WEBHOOK_URL;
      else process.env.ALERT_WEBHOOK_URL = previous;
    });
}

test("sendPaymentReliabilityJobAlert is a no-op when ALERT_WEBHOOK_URL is unset", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  await withWebhookUrl(undefined, async () => {
    const result = await sendPaymentReliabilityJobAlert({
      job: { id: "job-1", jobType: "reconcile_line_pay_request", resourceType: "payment_authorization", resourceId: "auth-1", status: "failed", attemptCount: 3, maxAttempts: 3, lastError: null }
    }, { source: "line_pay_reconciliation" });

    assert.deepEqual(result, { sent: false, reason: "not_configured" });
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

test("sendPaymentReliabilityJobAlert posts a JSON payload to the configured webhook", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });

  await withWebhookUrl("https://example.com/webhook", async () => {
    const result = await sendPaymentReliabilityJobAlert({
      job: {
        id: "job-1",
        jobType: "reconcile_line_pay_request",
        resourceType: "payment_authorization",
        resourceId: "auth-1",
        status: "failed",
        attemptCount: 3,
        maxAttempts: 3,
        lastError: { message: "provider unavailable" }
      }
    }, { source: "line_pay_reconciliation" });

    assert.deepEqual(result, { sent: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.com/webhook");
    assert.equal(calls[0].options.method, "POST");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.kind, "payment_reliability_job_alert");
    assert.equal(body.source, "line_pay_reconciliation");
    assert.equal(body.job.id, "job-1");
    assert.match(body.text, /付款背景工作失敗/);
  });
});

test("sendPaymentReliabilityJobAlert reports failure without throwing when the webhook call itself fails", async (t) => {
  const errors = [];
  t.mock.method(global, "fetch", async () => {
    throw new Error("network down");
  });

  await withWebhookUrl("https://example.com/webhook", async () => {
    const result = await sendPaymentReliabilityJobAlert({
      job: { id: "job-1", jobType: "x", resourceType: "y", resourceId: "z", status: "failed", attemptCount: 1, maxAttempts: 1, lastError: null }
    }, { source: "line_pay_reconciliation", logger: { error: (label, payload) => errors.push({ label, payload }) } });

    assert.deepEqual(result, { sent: false, reason: "request_failed" });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].label, "[payment-reliability-alert] webhook call failed");
  });
});

test("sendPaymentReliabilityJobAlert strips per-order settlement detail (customer IDs, provider transaction IDs, amounts) out of the payload sent to the external webhook", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });

  await withWebhookUrl("https://example.com/webhook", async () => {
    await sendPaymentReliabilityJobAlert({
      job: {
        id: "job-settlement",
        jobType: "settle_group_buy_activity",
        resourceType: "group_buy_activity",
        resourceId: "activity-1",
        status: "failed",
        attemptCount: 3,
        maxAttempts: 3,
        lastError: {
          error: "settlement_payment_failures",
          plan: {
            orders: [
              { customerUserId: "user-customer-yinji", providerTransactionId: "txn-001", finalAmount: 120 },
              { customerUserId: "user-customer-bolun", providerTransactionId: "txn-002", finalAmount: 90 }
            ]
          },
          results: [{ orderId: "order-1", status: "captured" }],
          failures: [{ orderId: "order-2", message: "capture failed" }]
        }
      }
    }, { source: "group_buy_settlement" });

    const body = JSON.parse(calls[0].options.body);
    const bodyText = JSON.stringify(body);
    assert.equal(body.job.lastError.error, "settlement_payment_failures");
    assert.equal(body.job.lastError.orderCount, 2);
    assert.equal(body.job.lastError.resultCount, 1);
    assert.equal(body.job.lastError.failureCount, 1);
    assert.equal(body.job.lastError.plan, undefined);
    assert.equal(body.job.lastError.results, undefined);
    assert.equal(body.job.lastError.failures, undefined);
    assert.doesNotMatch(bodyText, /user-customer-yinji/);
    assert.doesNotMatch(bodyText, /txn-001/);
  });
});

test("sendPaymentReliabilityJobAlert reports failure without throwing when the webhook responds with a non-2xx status", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: false, status: 500 }));

  await withWebhookUrl("https://example.com/webhook", async () => {
    const result = await sendPaymentReliabilityJobAlert({
      job: { id: "job-1", jobType: "x", resourceType: "y", resourceId: "z", status: "failed", attemptCount: 1, maxAttempts: 1, lastError: null }
    }, { source: "line_pay_reconciliation" });

    assert.deepEqual(result, { sent: false, reason: "http_500" });
  });
});

test("sendSchedulerFailureAlert is a no-op when ALERT_WEBHOOK_URL is unset", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  await withWebhookUrl(undefined, async () => {
    const result = await sendSchedulerFailureAlert(new Error("db connection lost"), { source: "group_buy_settlement" });
    assert.deepEqual(result, { sent: false, reason: "not_configured" });
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

test("sendSchedulerFailureAlert posts the error message to the configured webhook", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });

  await withWebhookUrl("https://example.com/webhook", async () => {
    const result = await sendSchedulerFailureAlert(new Error("db connection lost"), { source: "group_buy_settlement" });

    assert.deepEqual(result, { sent: true });
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.kind, "scheduler_failure_alert");
    assert.equal(body.source, "group_buy_settlement");
    assert.equal(body.error.message, "db connection lost");
    assert.match(body.text, /排程本身執行失敗/);
  });
});
