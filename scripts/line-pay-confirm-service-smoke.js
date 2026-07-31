"use strict";

const assert = require("node:assert/strict");
const {
  confirmLinePayAuthorization,
} = require("../backend/payments/linePayService");

async function main() {
  await verifyPostgresConfirmSuccess();
  await verifyPostgresCapacityCompensation();
  await verifyPostgresCompensationFailureAudit();
  console.log("LINE Pay confirm service smoke test passed.");
}

async function verifyPostgresConfirmSuccess() {
  const calls = [];
  const repository = createRepository(calls, {
    confirmation: authorization("authorized"),
  });
  const result = await confirmLinePayAuthorization({
    transactionId: "transaction-001",
    orderId: "order-001",
    authorizationConfirmRepository: repository,
    providerConfirmer: async () => ({ returnCode: "0000" }),
  });
  assert.equal(result.authorization.status, "authorized");
  assert.equal(result.payload.returnCode, "0000");
  assert.deepEqual(calls, ["lock", "context", "provider-confirmed", "persist-confirm"]);
}

async function verifyPostgresCapacityCompensation() {
  const calls = [];
  const repository = createRepository(calls, {
    confirmation: {
      error: "capacity_exceeded",
      maximumCups: 2,
      authorizedCups: 2,
      requestedCups: 1,
      authorization: authorization("failed"),
    },
  });
  const result = await confirmLinePayAuthorization({
    transactionId: "transaction-001",
    orderId: "order-001",
    authorizationConfirmRepository: repository,
    providerConfirmer: async () => {
      calls.push("provider-confirmed");
      return { returnCode: "0000" };
    },
    providerVoider: async () => {
      calls.push("provider-voided");
      return { returnCode: "0000" };
    },
  });
  assert.equal(result.error, "capacity_exceeded");
  assert.equal(result.voidResult.status, "authorization_voided");
  assert.ok(calls.includes("persist-void-success"));
}

async function verifyPostgresCompensationFailureAudit() {
  const calls = [];
  const repository = createRepository(calls, {
    confirmation: {
      error: "authorization_confirmed_after_deadline",
      authorization: authorization("failed"),
    },
  });
  const result = await confirmLinePayAuthorization({
    transactionId: "transaction-001",
    orderId: "order-001",
    authorizationConfirmRepository: repository,
    providerConfirmer: async () => ({ returnCode: "0000" }),
    providerVoider: async () => {
      const error = new Error("provider void failed");
      error.linePayPayload = { returnCode: "9999" };
      throw error;
    },
  });
  assert.equal(result.error, "authorization_confirmed_after_deadline");
  assert.equal(result.voidError.message, "provider void failed");
  assert.ok(calls.includes("persist-void-failure"));
}

function createRepository(calls, options) {
  return {
    kind: "postgres",
    async withConfirmLock(input, operation) {
      calls.push("lock");
      return operation();
    },
    async getAuthorizationContext() {
      calls.push("context");
      return {
        authorization: authorization("pending"),
        order: { id: "order-001", originalAmount: 75 },
        amount: 75,
        currency: "TWD",
      };
    },
    async confirmAuthorization() {
      if (!calls.includes("provider-confirmed")) calls.push("provider-confirmed");
      calls.push("persist-confirm");
      return options.confirmation;
    },
    async recordCompensatingVoidSuccess() {
      calls.push("persist-void-success");
      return authorization("authorization_voided");
    },
    async recordCompensatingVoidFailure() {
      calls.push("persist-void-failure");
      return authorization("failed");
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
