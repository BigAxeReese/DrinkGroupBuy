"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function resolvePaymentAuthorizationRequestRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(
    input.runtime || env.PAYMENT_AUTHORIZATION_REQUEST_RUNTIME || "sqlite"
  ).trim().toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported PAYMENT_AUTHORIZATION_REQUEST_RUNTIME: ${runtime}`);
}

function createPaymentAuthorizationRequestRepository(input = {}) {
  const runtime = resolvePaymentAuthorizationRequestRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of [
      "getOrderPaymentContext",
      "getLatestAuthorizationForOrder",
      "getLatestAuthorizationForOrderRevision",
      "recordRuleConsent",
      "createPendingAuthorization",
    ]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when PAYMENT_AUTHORIZATION_REQUEST_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getOrderPaymentContext: async (orderId) => gateway.getOrderPaymentContext(orderId),
      getLatestAuthorizationForOrder: async (orderId) => (
        gateway.getLatestAuthorizationForOrder(orderId)
      ),
      getLatestAuthorizationForOrderRevision: async (orderRevisionId) => (
        gateway.getLatestAuthorizationForOrderRevision(orderRevisionId)
      ),
      recordRuleConsent: async (consentInput) => gateway.recordRuleConsent(consentInput),
      createPendingAuthorization: async (authorizationInput) => (
        gateway.createPendingAuthorization(authorizationInput)
      ),
      withRequestLock: async (orderId, operation) => operation(),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({
    ...input,
    runtime: "postgres",
  });
  return {
    kind: "postgres",
    getOrderPaymentContext: (orderId) => getPostgresOrderPaymentContext(database, orderId),
    getLatestAuthorizationForOrder: (orderId) => (
      getLatestPostgresAuthorizationForOrder(database, orderId)
    ),
    getLatestAuthorizationForOrderRevision: (orderRevisionId) => (
      getLatestPostgresAuthorizationForOrderRevision(database, orderRevisionId)
    ),
    recordRuleConsent: (consentInput) => recordPostgresOrderRuleConsent(database, consentInput),
    createPendingAuthorization: (authorizationInput) => (
      createPostgresPendingAuthorization(database, authorizationInput)
    ),
    withRequestLock: (orderId, operation) => (
      withPostgresAuthorizationRequestLock(database, orderId, operation)
    ),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function withPostgresAuthorizationRequestLock(database, orderId, operation, input = {}) {
  const lockKey = `line-pay-request:${orderId}`;
  const ownerId = input.ownerId || `line-pay-request-${process.pid}-${randomUUID()}`;
  const now = input.now || new Date().toISOString();
  const leaseMs = Number(input.leaseMs) > 0 ? Number(input.leaseMs) : 120_000;
  const lockedUntil = new Date(Date.parse(now) + leaseMs).toISOString();
  const result = await database.query(`
    INSERT INTO operation_locks (
      lock_key,
      owner_id,
      locked_until,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (lock_key) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        locked_until = EXCLUDED.locked_until,
        updated_at = EXCLUDED.updated_at
    WHERE operation_locks.locked_until <= $4
    RETURNING lock_key, owner_id, locked_until
  `, [lockKey, ownerId, lockedUntil, now]);
  if (!result.rows[0]) {
    const error = new Error("Payment authorization request is already in progress");
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

async function getPostgresOrderPaymentContext(database, orderId) {
  const result = await database.query(`
    SELECT
      id,
      activity_id,
      customer_user_id,
      total_cups,
      original_amount,
      payment_status,
      authorization_status
    FROM orders
    WHERE id = $1
  `, [orderId]);
  return result.rows[0] ? mapOrderPaymentContext(result.rows[0]) : null;
}

async function getLatestPostgresAuthorizationForOrder(database, orderId) {
  // No provider filter: getLatestLinePayAuthorizationForOrder in backend/db.js (the SQLite
  // source of truth this mirrors) returns the latest authorization for the order regardless
  // of provider. A provider-scoped filter here would miss a still-pending authorization from
  // a different provider (e.g. an ECPay attempt) and let a duplicate LINE Pay authorization
  // request slip past the "already pending" check in requestLinePayAuthorizationUnlocked.
  const result = await database.query(`
    SELECT *
    FROM payment_authorizations
    WHERE order_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [orderId]);
  return result.rows[0] ? mapPaymentAuthorization(result.rows[0]) : null;
}

async function getLatestPostgresAuthorizationForOrderRevision(database, orderRevisionId) {
  const result = await database.query(`
    SELECT *
    FROM payment_authorizations
    WHERE order_revision_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [orderRevisionId]);
  return result.rows[0] ? mapPaymentAuthorization(result.rows[0]) : null;
}

async function recordPostgresOrderRuleConsent(database, input) {
  const consentId = `rule-consent-${randomUUID()}`;
  const insertResult = await database.query(`
    INSERT INTO order_rule_consents (
      id,
      order_id,
      customer_user_id,
      rule_type,
      rule_version,
      rule_content_snapshot,
      consented_at
    )
    SELECT $1, orders.id, orders.customer_user_id, $2, $3, $4, $5
    FROM orders
    WHERE orders.id = $6
      AND orders.customer_user_id = $7
    ON CONFLICT (order_id, rule_type, rule_version) DO NOTHING
    RETURNING *
  `, [
    consentId,
    input.ruleType,
    input.ruleVersion,
    input.ruleContentSnapshot,
    input.consentedAt,
    input.orderId,
    input.customerUserId,
  ]);
  if (insertResult.rows[0]) return mapOrderRuleConsent(insertResult.rows[0]);

  const existingResult = await database.query(`
    SELECT *
    FROM order_rule_consents
    WHERE order_id = $1
      AND rule_type = $2
      AND rule_version = $3
  `, [input.orderId, input.ruleType, input.ruleVersion]);
  return existingResult.rows[0] ? mapOrderRuleConsent(existingResult.rows[0]) : null;
}

async function createPostgresPendingAuthorization(database, input) {
  const authorizationId = `payment-authorization-${randomUUID()}`;
  const now = input.now || new Date().toISOString();
  const provider = input.provider || "line_pay";
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
      Number(input.amount),
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
        'line_pay_request_created', NULL, $3
      )
    `, [`status-history-${randomUUID()}`, authorizationId, now]);
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
        $1, NULL, 'line_pay_request_authorization',
        'payment_authorization', $2, $3::jsonb, $4
      )
    `, [
      `audit-log-${randomUUID()}`,
      authorizationId,
      JSON.stringify({
        orderId: resolvedOrderId,
        orderRevisionId: revision?.id || null,
        paymentFlow,
        providerTransactionId: input.providerTransactionId || null,
      }),
      now,
    ]);
    await transaction.query(`
      INSERT INTO payment_reliability_jobs (
        id,
        job_type,
        resource_type,
        resource_id,
        status,
        payload_json,
        attempt_count,
        max_attempts,
        run_after,
        alert_required,
        created_at,
        updated_at
      ) VALUES (
        $1, 'reconcile_line_pay_request', 'payment_authorization', $2,
        'queued', $3::jsonb, 0, 40, $4, false, $5, $5
      )
    `, [
      `payment-job-${randomUUID()}`,
      authorizationId,
      JSON.stringify({
        orderId: resolvedOrderId,
        providerTransactionId: input.providerTransactionId || null,
        paymentFlow,
        amount: Number(input.amount),
      }),
      new Date(Date.parse(now) + 30_000).toISOString(),
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

function mapOrderPaymentContext(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    customerUserId: row.customer_user_id,
    totalCups: row.total_cups,
    originalAmount: Number(row.original_amount),
    paymentStatus: row.payment_status,
    authorizationStatus: row.authorization_status,
  };
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

function mapOrderRuleConsent(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    customerUserId: row.customer_user_id,
    ruleType: row.rule_type,
    ruleVersion: row.rule_version,
    ruleContentSnapshot: row.rule_content_snapshot,
    consentedAt: toIsoString(row.consented_at),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createPaymentAuthorizationRequestRepository,
  createPostgresPendingAuthorization,
  getLatestPostgresAuthorizationForOrder,
  getPostgresOrderPaymentContext,
  recordPostgresOrderRuleConsent,
  resolvePaymentAuthorizationRequestRuntime,
  withPostgresAuthorizationRequestLock,
};
