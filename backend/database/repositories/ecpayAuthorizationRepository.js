"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const { getPostgresOrderPaymentContext } = require("./paymentAuthorizationRequestRepository");
const { getPostgresAuthorizationContext } = require("./paymentAuthorizationCancelRepository");
const { confirmPostgresAuthorization } = require("./paymentAuthorizationConfirmRepository");
const { getLatestProviderEventPayloadPostgres } = require("./paymentRefundRepository");

function resolveEcpayAuthorizationRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(
    input.runtime || env.ECPAY_AUTHORIZATION_RUNTIME || "sqlite"
  ).trim().toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported ECPAY_AUTHORIZATION_RUNTIME: ${runtime}`);
}

// getOrderPaymentContext / getAuthorizationContext / authorizeAuthorization are delegated
// to already-verified LINE Pay repository functions instead of re-implemented here: they
// take `provider` as an explicit parameter and contain no LINE-Pay-only business rules (the
// one exception, LINE_PAY_CAPTURE_SEPARATED's expiry-window check inside
// confirmPostgresAuthorization, is itself gated on `provider === "line_pay"` and is a no-op
// for any other provider). getLatestAuthorizationForOrder and createPendingAuthorization are
// NOT reused from paymentAuthorizationRequestRepository: that repository's Postgres versions
// hardcode a `provider IN ('line_pay', 'mock_line_pay')` filter and auto-enqueue a
// `reconcile_line_pay_request` reliability job, neither of which matches this project's
// SQLite source of truth (backend/db.js's getLatestLinePayAuthorizationForOrder is provider-
// agnostic, and createPendingLinePayAuthorization never enqueues a job -- that only happens
// as a separate explicit step in linePayService.js's own request flow).
function createEcpayAuthorizationRepository(input = {}) {
  const runtime = resolveEcpayAuthorizationRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of [
      "getOrderPaymentContext",
      "getLatestAuthorizationForOrder",
      "getAuthorizationContext",
      "createPendingAuthorization",
      "authorizeAuthorization",
      "getLatestProviderEventPayload",
    ]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when ECPAY_AUTHORIZATION_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getOrderPaymentContext: async (orderId) => gateway.getOrderPaymentContext(orderId),
      getLatestAuthorizationForOrder: async (orderId) => (
        gateway.getLatestAuthorizationForOrder(orderId)
      ),
      getAuthorizationContext: async (query) => gateway.getAuthorizationContext(query),
      createPendingAuthorization: async (value) => gateway.createPendingAuthorization(value),
      authorizeAuthorization: async (value) => gateway.authorizeAuthorization(value),
      getLatestProviderEventPayload: async (value) => gateway.getLatestProviderEventPayload(value),
      withOperationLock: async (orderId, operation) => operation(),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  const env = input.env || process.env;
  return {
    kind: "postgres",
    getOrderPaymentContext: (orderId) => getPostgresOrderPaymentContext(database, orderId),
    getLatestAuthorizationForOrder: (orderId) => (
      getLatestPostgresEcpayAuthorizationForOrder(database, orderId)
    ),
    getAuthorizationContext: (query) => getPostgresAuthorizationContext(database, query),
    createPendingAuthorization: (value) => createPostgresPendingEcpayAuthorization(database, value),
    authorizeAuthorization: (value) => confirmPostgresAuthorization(database, value, env),
    getLatestProviderEventPayload: (value) => getLatestProviderEventPayloadPostgres(database, value),
    withOperationLock: (orderId, operation) => (
      withPostgresEcpayOperationLock(database, orderId, operation)
    ),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

// Mirrors withEcpayOperationLock's `ecpay:${orderId}` lock key in backend/payments/
// ecpayService.js exactly, so the Postgres path serializes requests the same way the
// existing SQLite lease does.
async function withPostgresEcpayOperationLock(database, orderId, operation) {
  const lockKey = `ecpay:${orderId}`;
  const ownerId = `ecpay-operation-${process.pid}-${randomUUID()}`;
  const now = new Date().toISOString();
  const lockedUntil = new Date(Date.parse(now) + 120_000).toISOString();
  const result = await database.query(`
    INSERT INTO operation_locks (lock_key, owner_id, locked_until, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (lock_key) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        locked_until = EXCLUDED.locked_until,
        updated_at = EXCLUDED.updated_at
    WHERE operation_locks.locked_until <= $4
    RETURNING lock_key, owner_id, locked_until
  `, [lockKey, ownerId, lockedUntil, now]);
  if (!result.rows[0]) {
    const error = new Error("ECPay operation is already in progress");
    error.code = "operation_locked";
    error.lock = { lockKey };
    throw error;
  }
  try {
    return await operation();
  } finally {
    await database.query(`
      DELETE FROM operation_locks
      WHERE lock_key = $1
        AND owner_id = $2
    `, [lockKey, ownerId]);
  }
}

// Matches getLatestLinePayAuthorizationForOrder in backend/db.js exactly: no provider
// filter, since the same function backs both LINE Pay's and ECPay's "latest authorization
// for this order" lookups today.
async function getLatestPostgresEcpayAuthorizationForOrder(database, orderId) {
  const result = await database.query(`
    SELECT *
    FROM payment_authorizations
    WHERE order_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [orderId]);
  return result.rows[0] ? mapPaymentAuthorization(result.rows[0]) : null;
}

// Faithful port of createPendingLinePayAuthorization in backend/db.js -- including its
// order-revision handling and its hardcoded "line_pay_request_created" / "line_pay_request_
// authorization" status_history/audit labels, which db.js writes regardless of provider.
// Deliberately does NOT enqueue a payment_reliability_jobs row: db.js's version doesn't
// either (LINE Pay's own request flow enqueues reconciliation as a separate explicit step in
// linePayService.js), and ECPay has no reconciliation job type to enqueue in the first place.
async function createPostgresPendingEcpayAuthorization(database, input) {
  const authorizationId = `payment-authorization-${randomUUID()}`;
  const now = input.now || new Date().toISOString();
  const provider = input.provider || "ecpay";
  const paymentFlow = input.paymentFlow || "authorization";

  return database.transaction(async (transaction) => {
    let revision = null;
    if (input.orderRevisionId) {
      const revisionResult = await transaction.query(`
        SELECT id, order_id, status, original_amount
        FROM order_revisions
        WHERE id = $1
      `, [input.orderRevisionId]);
      revision = revisionResult.rows[0] || null;
      if (!revision || revision.status !== "pending_authorization") return null;
      if (input.orderId && revision.order_id !== input.orderId) return null;
    }

    const resolvedOrderId = revision?.order_id || input.orderId;
    const orderResult = await transaction.query(`
      SELECT id, original_amount
      FROM orders
      WHERE id = $1
      FOR UPDATE
    `, [resolvedOrderId]);
    const order = orderResult.rows[0];
    // Re-validate against the amount locked just now, not the amount ecpayService.js checked
    // moments earlier outside this transaction -- otherwise a concurrent order edit (PATCH
    // /api/orders/:orderId) landing between that check and this transaction could leave a
    // payment_authorizations row persisted with an amount that no longer matches the order's
    // current price, even though the FOR UPDATE lock above was already taken to prevent
    // exactly that. Matches the equivalent check in createPostgresPendingAuthorization
    // (paymentAuthorizationRequestRepository.js), which SQLite's createPendingLinePayAuthorization
    // lacks entirely since its order read isn't inside any transaction at all.
    const expectedAmount = revision ? Number(revision.original_amount) : Number(order?.original_amount);
    if (!order || expectedAmount !== Number(input.amount)) return null;

    if (input.providerTransactionId) {
      const existingResult = await transaction.query(`
        SELECT *
        FROM payment_authorizations
        WHERE provider = $1
          AND provider_authorization_id = $2
        LIMIT 1
      `, [provider, input.providerTransactionId]);
      if (existingResult.rows[0]) return mapPaymentAuthorization(existingResult.rows[0]);
    }

    await transaction.query(`
      INSERT INTO payment_authorizations (
        id,
        order_id,
        order_revision_id,
        provider,
        payment_flow,
        status,
        original_amount,
        authorized_amount,
        provider_authorization_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, 0, $7, $8, $8)
    `, [
      authorizationId,
      resolvedOrderId,
      revision?.id || null,
      provider,
      paymentFlow,
      expectedAmount,
      input.providerTransactionId || null,
      now,
    ]);
    await transaction.query(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES (
        $1, 'payment_authorization', $2, NULL, 'pending',
        $3, NULL, $4
      )
    `, [
      `status-history-${randomUUID()}`,
      authorizationId,
      paymentFlow === "direct_repayment"
        ? "line_pay_direct_repayment_request_created"
        : "line_pay_request_created",
      now,
    ]);
    await transaction.query(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (
        $1, NULL, $2,
        'payment_authorization', $3, $4::jsonb, $5
      )
    `, [
      `audit-log-${randomUUID()}`,
      paymentFlow === "direct_repayment"
        ? "line_pay_request_direct_repayment"
        : "line_pay_request_authorization",
      authorizationId,
      JSON.stringify({
        orderId: resolvedOrderId,
        orderRevisionId: revision?.id || null,
        paymentFlow,
        providerTransactionId: input.providerTransactionId || null,
      }),
      now,
    ]);

    const result = await transaction.query(`
      SELECT *
      FROM payment_authorizations
      WHERE id = $1
    `, [authorizationId]);
    return result.rows[0] ? mapPaymentAuthorization(result.rows[0]) : null;
  });
}

function mapPaymentAuthorization(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderRevisionId: row.order_revision_id || null,
    provider: row.provider,
    paymentFlow: row.payment_flow || "authorization",
    status: row.status,
    originalAmount: Number(row.original_amount),
    authorizedAmount: Number(row.authorized_amount),
    providerAuthorizationId: row.provider_authorization_id,
    expiresAt: toIsoString(row.expires_at),
    authorizedAt: toIsoString(row.authorized_at),
    voidedAt: toIsoString(row.voided_at),
    failureReason: row.failure_reason,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createEcpayAuthorizationRepository,
  createPostgresPendingEcpayAuthorization,
  getLatestPostgresEcpayAuthorizationForOrder,
  resolveEcpayAuthorizationRuntime,
  withPostgresEcpayOperationLock,
};
