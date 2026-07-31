"use strict";

const assert = require("node:assert/strict");
const {
  cancelLinePayAuthorization,
  voidLinePayAuthorization,
} = require("../backend/payments/linePayService");

async function main() {
  await verifyPostgresCancelRedirect();
  await verifyPostgresVoidSuccess();
  await verifyPostgresVoidFailureAudit();
  console.log("LINE Pay cancel service smoke test passed.");
}

async function verifyPostgresCancelRedirect() {
  const calls = [];
  const repository = createRepository(calls, "pending");
  const result = await cancelLinePayAuthorization({
    transactionId: "transaction-001",
    orderId: "order-001",
    authorizationCancelRepository: repository,
  });
  assert.equal(result.authorization.status, "failed");
  assert.deepEqual(calls, ["lock", "context", "persist-cancel"]);
}

async function verifyPostgresVoidSuccess() {
  const calls = [];
  const repository = createRepository(calls, "authorized");
  const result = await voidLinePayAuthorization({
    transactionId: "transaction-001",
    orderId: "order-001",
    authorizationCancelRepository: repository,
    providerVoider: async () => {
      calls.push("provider-void");
      return { returnCode: "0000" };
    },
  });
  assert.equal(result.status, "authorization_voided");
  assert.deepEqual(calls, ["lock", "context", "provider-void", "persist-void"]);
}

async function verifyPostgresVoidFailureAudit() {
  const calls = [];
  const repository = createRepository(calls, "authorized");
  await assert.rejects(
    () => voidLinePayAuthorization({
      transactionId: "transaction-001",
      orderId: "order-001",
      authorizationCancelRepository: repository,
      providerVoider: async () => {
        calls.push("provider-void");
        const error = new Error("provider unavailable");
        error.linePayPayload = { returnCode: "9999" };
        throw error;
      },
    }),
    /provider unavailable/
  );
  assert.deepEqual(calls, ["lock", "context", "provider-void", "persist-void-failure"]);
}

function createRepository(calls, status) {
  return {
    kind: "postgres",
    async withOperationLock(input, operation) {
      calls.push("lock");
      return operation();
    },
    async getAuthorizationContext() {
      calls.push("context");
      return { authorization: authorization(status), activityId: "activity-001" };
    },
    async cancelPendingAuthorization() {
      calls.push("persist-cancel");
      return authorization("failed");
    },
    async voidAuthorization() {
      calls.push("persist-void");
      return authorization("authorization_voided");
    },
    async recordVoidFailure() {
      calls.push("persist-void-failure");
      return authorization(status);
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
    authorizedAmount: status === "authorized" ? 75 : 0,
    providerAuthorizationId: "transaction-001",
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
