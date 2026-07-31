"use strict";

const assert = require("node:assert/strict");
const { captureLinePayAuthorization } = require("../backend/payments/linePayService");

async function main() {
  await verifyPostgresCaptureSuccess();
  await verifyPostgresCaptureFailure();
  console.log("LINE Pay capture service smoke test passed.");
}

async function verifyPostgresCaptureSuccess() {
  const calls = [];
  const repository = createRepository(calls);
  const result = await captureLinePayAuthorization({
    orderId: "order-001",
    transactionId: "transaction-001",
    amount: 70,
    finalAmount: 70,
    paymentCaptureRepository: repository,
    providerCapturer: async () => {
      calls.push("provider-capture");
      return { returnCode: "0000", info: { transactionId: "capture-provider-001" } };
    },
  });
  assert.equal(result.status, "captured");
  assert.equal(result.capture.status, "captured");
  assert.deepEqual(calls, ["lock", "context", "provider-capture", "persist-capture"]);
}

async function verifyPostgresCaptureFailure() {
  const calls = [];
  const repository = createRepository(calls);
  let error;
  try {
    await captureLinePayAuthorization({
      orderId: "order-001",
      transactionId: "transaction-001",
      amount: 70,
      finalAmount: 70,
      paymentCaptureRepository: repository,
      providerCapturer: async () => {
        calls.push("provider-capture");
        const providerError = new Error("provider unavailable");
        providerError.linePayPayload = { returnCode: "9000" };
        throw providerError;
      },
    });
  } catch (caught) {
    error = caught;
  }
  assert.equal(error?.message, "provider unavailable");
  assert.equal(error?.captureFailure?.status, "retry_pending");
  assert.equal(error?.captureClassification?.retryable, true);
  assert.deepEqual(calls, ["lock", "context", "provider-capture", "persist-failure"]);
}

function createRepository(calls) {
  return {
    kind: "postgres",
    async withOperationLock(input, operation) {
      calls.push("lock");
      return operation();
    },
    async getAuthorizationContext() {
      calls.push("context");
      return {
        activityId: "activity-001",
        authorization: authorization("authorized"),
        currency: "TWD",
      };
    },
    async captureAuthorization() {
      calls.push("persist-capture");
      return {
        authorization: authorization("captured"),
        capture: { id: "capture-001", status: "captured" },
        status: "captured",
      };
    },
    async recordCaptureFailure() {
      calls.push("persist-failure");
      return {
        authorization: authorization("authorized"),
        capture: { id: "capture-failed-001", status: "failed" },
        status: "retry_pending",
        attemptCount: 1,
        maxAttempts: 3,
        retryable: true,
        nextRetryAt: "2026-07-31T00:01:30.000Z",
      };
    },
  };
}

function authorization(status) {
  return {
    id: "authorization-001",
    orderId: "order-001",
    orderRevisionId: null,
    provider: "line_pay",
    paymentFlow: "authorization",
    status,
    originalAmount: 75,
    authorizedAmount: 75,
    providerAuthorizationId: "transaction-001",
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
