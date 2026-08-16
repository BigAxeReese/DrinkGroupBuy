"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { logAlertRequiredJobs } = require("./reliabilityService");

test("payment reliability alert logger only reports jobs requiring attention", () => {
  const calls = [];
  const logger = {
    error(label, payload) {
      calls.push({ label, payload });
    }
  };

  logAlertRequiredJobs([
    {
      job: {
        id: "job-alert",
        jobType: "reconcile_line_pay_request",
        resourceType: "payment_authorization",
        resourceId: "authorization-001",
        status: "failed",
        attemptCount: 3,
        maxAttempts: 3,
        alertRequired: true,
        lastError: { message: "provider unavailable" }
      }
    },
    {
      job: {
        id: "job-retry",
        alertRequired: false
      }
    },
    { result: { status: "completed" } }
  ], logger, "line_pay_reconciliation");

  assert.deepEqual(calls, [{
    label: "[payment-reliability-alert]",
    payload: {
      source: "line_pay_reconciliation",
      jobId: "job-alert",
      jobType: "reconcile_line_pay_request",
      resourceType: "payment_authorization",
      resourceId: "authorization-001",
      status: "failed",
      attemptCount: 3,
      maxAttempts: 3,
      lastError: { message: "provider unavailable" }
    }
  }]);
});

test("payment reliability alert logger tolerates an empty result", () => {
  assert.doesNotThrow(() => logAlertRequiredJobs(undefined, {}, "line_pay_reconciliation"));
});
