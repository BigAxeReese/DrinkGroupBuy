"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getPickupOverdueRule,
  validatePickupOverdueRuleConsent
} = require("./orderRuleConsent");
const {
  PaymentServiceError,
  requestLinePayAuthorization
} = require("./linePayService");

const currentRule = getPickupOverdueRule();

test("pickup overdue consent rejects missing and outdated submissions", () => {
  assert.equal(validatePickupOverdueRuleConsent(null).payload.status, "rule_consent_required");
  assert.equal(validatePickupOverdueRuleConsent({
    accepted: true,
    ruleType: currentRule.ruleType,
    ruleVersion: "old-version"
  }).payload.status, "rule_version_outdated");
  assert.equal(validatePickupOverdueRuleConsent({
    accepted: true,
    ruleType: currentRule.ruleType,
    ruleVersion: currentRule.ruleVersion
  }), null);
});

test("LINE Pay service blocks provider for missing or outdated consent", async () => {
  let providerCalled = false;
  const requestPayment = async () => {
    providerCalled = true;
    return {};
  };
  const inputs = [
    { expectedStatus: "rule_consent_required", ruleConsent: null },
    {
      expectedStatus: "rule_version_outdated",
      ruleConsent: {
        accepted: true,
        ruleType: currentRule.ruleType,
        ruleVersion: "old-version"
      }
    }
  ];

  for (const input of inputs) {
    const body = createRequestBody(`order-${input.expectedStatus}`);
    body.ruleConsent = input.ruleConsent;
    await assert.rejects(
      requestLinePayAuthorization({
        authUser: { id: "customer-1", roles: ["customer"] },
        body,
        authorizationRequestRepository: createRepository(),
        requestPayment
      }),
      (error) => error instanceof PaymentServiceError
        && error.payload.status === input.expectedStatus
    );
  }
  assert.equal(providerCalled, false);
});

test("LINE Pay request persists authoritative consent before provider request", async () => {
  const previousCaptureSeparated = process.env.LINE_PAY_CAPTURE_SEPARATED;
  process.env.LINE_PAY_CAPTURE_SEPARATED = "true";
  let consentPersisted = false;
  let providerCalled = false;

  try {
    const result = await requestLinePayAuthorization({
      authUser: { id: "customer-1", roles: ["customer"] },
      body: createRequestBody("order-consent-success"),
      authorizationRequestRepository: createRepository({
        recordRuleConsent: (input) => {
          consentPersisted = true;
          assert.equal(input.customerUserId, "customer-1");
          assert.equal(input.ruleContentSnapshot, currentRule.content);
          return { id: "consent-1", ...input };
        }
      }),
      requestPayment: async () => {
        assert.equal(consentPersisted, true);
        providerCalled = true;
        return {
          info: {
            transactionId: "provider-transaction-1",
            paymentUrl: { web: "https://example.test/pay" }
          }
        };
      }
    });

    assert.equal(providerCalled, true);
    assert.equal(result.status, "payment_url_created");
  } finally {
    restoreEnv("LINE_PAY_CAPTURE_SEPARATED", previousCaptureSeparated);
  }
});

test("LINE Pay request never calls provider when consent persistence fails", async () => {
  const previousCaptureSeparated = process.env.LINE_PAY_CAPTURE_SEPARATED;
  process.env.LINE_PAY_CAPTURE_SEPARATED = "true";
  let providerCalled = false;

  try {
    await assert.rejects(
      requestLinePayAuthorization({
        authUser: { id: "customer-1", roles: ["customer"] },
        body: createRequestBody("order-consent-failure"),
        authorizationRequestRepository: createRepository({ recordRuleConsent: () => null }),
        requestPayment: async () => {
          providerCalled = true;
          return {};
        }
      }),
      (error) => error instanceof PaymentServiceError
        && error.payload.status === "rule_consent_persistence_failed"
    );
    assert.equal(providerCalled, false);
  } finally {
    restoreEnv("LINE_PAY_CAPTURE_SEPARATED", previousCaptureSeparated);
  }
});

test("admin cannot record consent on behalf of a customer", async () => {
  await assert.rejects(
    requestLinePayAuthorization({
      authUser: { id: "admin-1", roles: ["admin"] },
      body: createRequestBody("order-owner-only"),
      authorizationRequestRepository: createRepository(),
      requestPayment: async () => {
        throw new Error("provider must not be called");
      }
    }),
    (error) => error instanceof PaymentServiceError && error.statusCode === 403
  );
});

test("LINE Pay request abandons a stale pending authorization instead of blocking retry", async () => {
  const previousCaptureSeparated = process.env.LINE_PAY_CAPTURE_SEPARATED;
  process.env.LINE_PAY_CAPTURE_SEPARATED = "true";
  const cancelCalls = [];
  let providerCalled = false;

  try {
    const result = await requestLinePayAuthorization({
      authUser: { id: "customer-1", roles: ["customer"] },
      body: createRequestBody("order-abandoned-retry"),
      authorizationRequestRepository: createRepository({
        getLatestAuthorizationForOrder: async () => ({
          id: "authorization-stale",
          status: "pending",
          providerAuthorizationId: "provider-transaction-stale"
        })
      }),
      authorizationCancelRepository: {
        cancelPendingAuthorization: async (input) => {
          cancelCalls.push(input);
          return { id: "authorization-stale", status: "failed" };
        }
      },
      requestPayment: async () => {
        // The stale authorization must be cancelled before a new provider request is made --
        // otherwise a customer could end up with two live LINE Pay requests for one order.
        assert.equal(cancelCalls.length, 1);
        providerCalled = true;
        return {
          info: {
            transactionId: "provider-transaction-new",
            paymentUrl: { web: "https://example.test/pay-again" }
          }
        };
      }
    });

    assert.equal(providerCalled, true);
    assert.equal(result.status, "payment_url_created");
    assert.equal(cancelCalls.length, 1);
    assert.equal(cancelCalls[0].orderId, "order-abandoned-retry");
    assert.equal(cancelCalls[0].providerTransactionId, "provider-transaction-stale");
    assert.equal(cancelCalls[0].reason, "customer_retried_before_confirmation");
  } finally {
    restoreEnv("LINE_PAY_CAPTURE_SEPARATED", previousCaptureSeparated);
  }
});

test("LINE Pay request is rejected once the activity deadline has passed", async () => {
  const previousCaptureSeparated = process.env.LINE_PAY_CAPTURE_SEPARATED;
  process.env.LINE_PAY_CAPTURE_SEPARATED = "true";
  let providerCalled = false;

  try {
    await assert.rejects(
      requestLinePayAuthorization({
        authUser: { id: "customer-1", roles: ["customer"] },
        body: createRequestBody("order-deadline-passed"),
        now: "2026-01-01T00:10:00.000Z",
        authorizationRequestRepository: createRepository({
          getOrderPaymentContext: async (orderId) => ({
            id: orderId,
            customerUserId: "customer-1",
            originalAmount: 100,
            paymentStatus: "pending",
            authorizationStatus: "pending",
            deadlineAt: "2026-01-01T00:00:00.000Z"
          })
        }),
        requestPayment: async () => {
          providerCalled = true;
          return {};
        }
      }),
      (error) => error instanceof PaymentServiceError
        && error.payload.status === "activity_deadline_passed"
    );
    assert.equal(providerCalled, false);
  } finally {
    restoreEnv("LINE_PAY_CAPTURE_SEPARATED", previousCaptureSeparated);
  }
});

test("LINE Pay request still succeeds before the activity deadline", async () => {
  const previousCaptureSeparated = process.env.LINE_PAY_CAPTURE_SEPARATED;
  process.env.LINE_PAY_CAPTURE_SEPARATED = "true";
  let providerCalled = false;

  try {
    const result = await requestLinePayAuthorization({
      authUser: { id: "customer-1", roles: ["customer"] },
      body: createRequestBody("order-deadline-not-yet"),
      now: "2025-12-31T23:50:00.000Z",
      authorizationRequestRepository: createRepository({
        getOrderPaymentContext: async (orderId) => ({
          id: orderId,
          customerUserId: "customer-1",
          originalAmount: 100,
          paymentStatus: "pending",
          authorizationStatus: "pending",
          deadlineAt: "2026-01-01T00:00:00.000Z"
        })
      }),
      requestPayment: async () => {
        providerCalled = true;
        return {
          info: {
            transactionId: "provider-transaction-before-deadline",
            paymentUrl: { web: "https://example.test/pay" }
          }
        };
      }
    });
    assert.equal(providerCalled, true);
    assert.equal(result.status, "payment_url_created");
  } finally {
    restoreEnv("LINE_PAY_CAPTURE_SEPARATED", previousCaptureSeparated);
  }
});

function createRequestBody(orderId) {
  return {
    orderId,
    amount: 100,
    ruleConsent: {
      accepted: true,
      ruleType: currentRule.ruleType,
      ruleVersion: currentRule.ruleVersion
    }
  };
}

function createRepository(overrides = {}) {
  return {
    kind: "postgres",
    withRequestLock: async (_orderId, operation) => operation(),
    getOrderPaymentContext: async (orderId) => ({
      id: orderId,
      customerUserId: "customer-1",
      originalAmount: 100,
      paymentStatus: "pending",
      authorizationStatus: "pending"
    }),
    getLatestAuthorizationForOrder: async () => null,
    getLatestAuthorizationForOrderRevision: async () => null,
    recordRuleConsent: async (input) => ({ id: "consent-default", ...input }),
    createPendingAuthorization: async (input) => ({
      id: "authorization-1",
      orderId: input.orderId,
      providerAuthorizationId: input.providerTransactionId,
      status: "pending"
    }),
    ...overrides
  };
}

function restoreEnv(name, value) {
  if (value == null) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
