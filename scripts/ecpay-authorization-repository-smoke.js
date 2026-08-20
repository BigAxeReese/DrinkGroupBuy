"use strict";

const assert = require("node:assert/strict");
const {
  createEcpayAuthorizationRepository,
  resolveEcpayAuthorizationRuntime,
} = require("../backend/database/repositories/ecpayAuthorizationRepository");

async function main() {
  await verifySqliteDelegation();
  await verifyPostgresOrderPaymentContext();
  await verifyPostgresLatestAuthorizationHasNoProviderFilter();
  await verifyPostgresCreatePendingAuthorizationHasNoReliabilityJob();
  await verifyPostgresCreatePendingAuthorizationIdempotency();
  await verifyPostgresCreatePendingAuthorizationRejectsStaleAmount();
  await verifyPostgresAuthorizeAuthorization();
  await verifyPostgresAuthorizationContext();
  await verifyPostgresProviderEventPayload();
  await verifyPostgresOperationLock();
  verifyRuntimeValidation();
  console.log("ECPay authorization repository smoke test passed.");
}

async function verifySqliteDelegation() {
  const repository = createEcpayAuthorizationRepository({
    env: {},
    sqliteGateway: {
      getOrderPaymentContext: (orderId) => ({ id: orderId }),
      getLatestAuthorizationForOrder: (orderId) => ({ orderId }),
      getAuthorizationContext: (query) => ({ query }),
      createPendingAuthorization: (value) => ({ created: value }),
      authorizeAuthorization: (value) => ({ authorized: value }),
      getLatestProviderEventPayload: (value) => ({ payload: value }),
    },
  });
  assert.equal(repository.kind, "sqlite");
  assert.deepEqual(await repository.getOrderPaymentContext("order-001"), { id: "order-001" });
  assert.deepEqual(await repository.getLatestAuthorizationForOrder("order-001"), { orderId: "order-001" });
  assert.deepEqual(await repository.getAuthorizationContext({ orderId: "order-001" }), {
    query: { orderId: "order-001" },
  });
  assert.deepEqual(await repository.createPendingAuthorization({ orderId: "order-001" }), {
    created: { orderId: "order-001" },
  });
  assert.deepEqual(await repository.authorizeAuthorization({ orderId: "order-001" }), {
    authorized: { orderId: "order-001" },
  });
  assert.deepEqual(await repository.getLatestProviderEventPayload({ resourceId: "authorization-001" }), {
    payload: { resourceId: "authorization-001" },
  });
  // withOperationLock is a no-op passthrough in SQLite mode -- the real lease lives in
  // ecpayService.js's withEcpayOperationLock, outside this repository.
  assert.equal(
    await repository.withOperationLock("order-001", async () => "operation-complete"),
    "operation-complete"
  );
}

async function verifyPostgresOrderPaymentContext() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const context = await repository.getOrderPaymentContext("order-001");
  assert.equal(context.originalAmount, 75);
  assert.equal(context.paymentStatus, "pending");
}

async function verifyPostgresLatestAuthorizationHasNoProviderFilter() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const authorization = await repository.getLatestAuthorizationForOrder("order-001");
  assert.equal(authorization.provider, "ecpay");
  const lookup = calls.find((call) => (
    call.sql.includes("FROM payment_authorizations") && call.sql.includes("WHERE order_id = $1")
  ));
  assert.ok(lookup, "expected a latest-authorization-for-order lookup");
  // Unlike paymentAuthorizationRequestRepository's LINE-Pay-scoped equivalent, this lookup
  // must not filter by provider -- an in-flight authorization from any provider (LINE Pay or
  // ECPay) has to be visible here, since requestEcpayAuthorizationUnlocked's "already
  // authorized"/"already pending" checks depend on it.
  assert.equal(lookup.sql.includes("provider"), false);
}

async function verifyPostgresCreatePendingAuthorizationHasNoReliabilityJob() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const result = await repository.createPendingAuthorization({
    orderId: "order-001",
    amount: 75,
    provider: "ecpay",
    providerTransactionId: "merchant-trade-no-001",
    now: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(result.orderId, "order-001");
  assert.equal(result.status, "pending");
  assert.equal(result.provider, "ecpay");
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO payment_authorizations")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO status_history")));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  // ECPay has no reconciliation job type to enqueue (unlike LINE Pay's request flow, which
  // enqueues reconcile_line_pay_request as a separate explicit step) -- this must stay absent.
  assert.equal(calls.some((call) => call.sql.includes("payment_reliability_jobs")), false);
}

async function verifyPostgresCreatePendingAuthorizationIdempotency() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls, { existingAuthorization: true }),
  });
  const result = await repository.createPendingAuthorization({
    orderId: "order-001",
    amount: 75,
    provider: "ecpay",
    providerTransactionId: "merchant-trade-no-001",
  });
  assert.equal(result.id, "authorization-existing");
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO")), false);
}

// Regression test for a /security-review finding: the FOR UPDATE lock on the order row was
// being taken but never actually checked against the requested amount, so a concurrent order
// edit (PATCH /api/orders/:orderId) landing between ecpayService.js's pre-check and this
// transaction could leave a payment_authorizations row persisted with a stale amount.
async function verifyPostgresCreatePendingAuthorizationRejectsStaleAmount() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls, { lockedOrderAmount: 1 }),
  });
  const result = await repository.createPendingAuthorization({
    orderId: "order-001",
    amount: 75,
    provider: "ecpay",
    providerTransactionId: "merchant-trade-no-001",
  });
  assert.equal(result, null, "a stale amount must be rejected, not persisted");
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO payment_authorizations")), false);
}

async function verifyPostgresAuthorizeAuthorization() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
    env: {},
  });
  const result = await repository.authorizeAuthorization({
    orderId: "order-001",
    provider: "ecpay",
    amount: 75,
    providerPayload: { RtnCode: "1" },
    now: "2026-08-20T00:00:00.000Z",
  });
  assert.equal(result.status, "authorized");
  assert.equal(result.authorizedAmount, 75);
}

async function verifyPostgresAuthorizationContext() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const context = await repository.getAuthorizationContext({ orderId: "order-001", provider: "ecpay" });
  assert.equal(context.authorization.provider, "ecpay");
  assert.equal(context.activityId, "activity-001");
}

async function verifyPostgresProviderEventPayload() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const payload = await repository.getLatestProviderEventPayload({
    resourceType: "authorization",
    resourceId: "authorization-001",
    eventType: "confirm_success",
  });
  assert.equal(payload.TradeNo, "ECPAYTRADE001");
}

async function verifyPostgresOperationLock() {
  const calls = [];
  const repository = createEcpayAuthorizationRepository({
    runtime: "postgres",
    database: createFakeDatabase(calls),
  });
  const result = await repository.withOperationLock("order-001", async () => "operation-complete");
  assert.equal(result, "operation-complete");
  const acquireIndex = calls.findIndex((call) => call.sql.includes("INSERT INTO operation_locks"));
  const releaseIndex = calls.findIndex((call) => call.sql.includes("DELETE FROM operation_locks"));
  assert.ok(acquireIndex >= 0);
  assert.ok(releaseIndex > acquireIndex);
  // Must match withEcpayOperationLock's `ecpay:${orderId}` key in ecpayService.js exactly,
  // not the `order:${orderId}:payment-lifecycle` / `line-pay:${id}` keys used elsewhere --
  // otherwise the Postgres lock wouldn't serialize against the same operations SQLite does.
  assert.equal(calls[acquireIndex].parameters[0], "ecpay:order-001");
}

function createFakeDatabase(calls, options = {}) {
  const database = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("INSERT INTO operation_locks")) {
        return { rows: [{ lock_key: parameters[0], owner_id: parameters[1] }] };
      }
      if (sql.includes("DELETE FROM operation_locks")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM orders") && sql.includes("activity_id")) {
        return { rows: [orderPaymentContextRow()] };
      }
      if (sql.includes("FROM payment_authorizations") && sql.includes("WHERE order_id = $1")) {
        return { rows: [authorizationRow()] };
      }
      if (sql.includes("FROM payment_authorizations payment_auth") && sql.includes("LIMIT 1")) {
        return { rows: [contextRow()] };
      }
      if (sql.includes("FROM payment_provider_events")) {
        return { rows: [{ payload_json: { TradeNo: "ECPAYTRADE001" } }] };
      }
      throw new Error(`Unexpected SQL outside transaction: ${sql}`);
    },
    async transaction(operation) {
      return operation({ query });
    },
  };

  async function query(sql, parameters = []) {
    calls.push({ sql, parameters });
    if (sql.includes("FROM order_revisions")) return { rows: [] };
    if (sql.includes("FROM orders") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "order-001", original_amount: options.lockedOrderAmount ?? 75 }] };
    }
    if (
      sql.includes("FROM payment_authorizations")
      && sql.includes("provider_authorization_id")
      && sql.includes("LIMIT 1")
    ) {
      return { rows: options.existingAuthorization ? [{ ...authorizationRow(), id: "authorization-existing" }] : [] };
    }
    if (sql.includes("FROM group_buy_activities") && sql.includes("FOR UPDATE")) {
      return { rows: [{
        id: "activity-001",
        deadline_at: new Date("2099-01-01T00:00:00.000Z"),
        maximum_cups: 10,
      }] };
    }
    if (sql.includes("FOR UPDATE OF payment_auth")) return { rows: [stateRow()] };
    if (sql.includes("AS authorized_cups")) return { rows: [{ authorized_cups: 0 }] };
    if (sql.includes("UPDATE payment_authorizations") && sql.includes("RETURNING *")) {
      return { rows: [{ ...stateRow(), status: "authorized", authorized_amount: 75 }] };
    }
    if (sql.includes("SELECT * FROM payment_authorizations WHERE id = $1")) {
      return { rows: [authorizationRow()] };
    }
    if (sql.includes("SELECT\n      *\n    FROM payment_authorizations\n    WHERE id = $1")) {
      return { rows: [authorizationRow()] };
    }
    if (sql.includes("FROM payment_authorizations") && sql.includes("WHERE id = $1")) {
      return { rows: [authorizationRow()] };
    }
    if (sql.includes("UPDATE") || sql.includes("INSERT INTO")) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in transaction: ${sql}`);
  }
  return database;
}

function orderPaymentContextRow() {
  return {
    id: "order-001",
    activity_id: "activity-001",
    customer_user_id: "customer-001",
    total_cups: 1,
    original_amount: 75,
    payment_status: "pending",
    authorization_status: "pending",
  };
}

function authorizationRow() {
  return {
    id: "authorization-001",
    order_id: "order-001",
    order_revision_id: null,
    provider: "ecpay",
    payment_flow: "authorization",
    status: "pending",
    original_amount: 75,
    authorized_amount: 0,
    provider_authorization_id: "merchant-trade-no-001",
    expires_at: null,
    authorized_at: null,
    voided_at: null,
    failure_reason: null,
    created_at: new Date("2026-08-20T00:00:00.000Z"),
    updated_at: new Date("2026-08-20T00:00:00.000Z"),
  };
}

function contextRow() {
  return {
    ...authorizationRow(),
    activity_id: "activity-001",
    order_original_amount: 75,
  };
}

function stateRow() {
  return {
    ...authorizationRow(),
    activity_id: "activity-001",
    total_cups: 1,
    order_original_amount: 75,
    order_payment_status: "pending",
  };
}

function verifyRuntimeValidation() {
  assert.equal(resolveEcpayAuthorizationRuntime({ env: {} }), "sqlite");
  assert.equal(resolveEcpayAuthorizationRuntime({
    env: { ECPAY_AUTHORIZATION_RUNTIME: "POSTGRESQL" },
  }), "postgres");
  assert.throws(
    () => resolveEcpayAuthorizationRuntime({ runtime: "mysql" }),
    /Unsupported ECPAY_AUTHORIZATION_RUNTIME/
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
