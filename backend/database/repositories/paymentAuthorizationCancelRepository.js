"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function resolvePaymentAuthorizationCancelRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(
    input.runtime || env.PAYMENT_AUTHORIZATION_CANCEL_RUNTIME || "sqlite"
  ).trim().toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported PAYMENT_AUTHORIZATION_CANCEL_RUNTIME: ${runtime}`);
}

function createPaymentAuthorizationCancelRepository(input = {}) {
  const runtime = resolvePaymentAuthorizationCancelRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of [
      "getAuthorizationContext",
      "cancelPendingAuthorization",
      "voidAuthorization",
      "recordVoidFailure",
    ]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when PAYMENT_AUTHORIZATION_CANCEL_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getAuthorizationContext: async (query) => gateway.getAuthorizationContext(query),
      cancelPendingAuthorization: async (value) => gateway.cancelPendingAuthorization(value),
      voidAuthorization: async (value) => gateway.voidAuthorization(value),
      recordVoidFailure: async (value) => gateway.recordVoidFailure(value),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    getAuthorizationContext: (query) => getPostgresAuthorizationContext(database, query),
    cancelPendingAuthorization: (value) => cancelPendingPostgresAuthorization(database, value),
    voidAuthorization: (value) => voidPostgresAuthorization(database, value),
    recordVoidFailure: (value) => recordPostgresVoidFailure(database, value),
    withOperationLock: (value, operation) => withPostgresPaymentOperationLock(database, value, operation),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresAuthorizationContext(database, input = {}) {
  const provider = input.provider || "line_pay";
  const result = await database.query(`
    SELECT payment_auth.*, order_record.activity_id
    FROM payment_authorizations payment_auth
    JOIN orders order_record ON order_record.id = payment_auth.order_id
    WHERE payment_auth.provider = $1
      AND ($2::text IS NULL OR payment_auth.provider_authorization_id = $2)
      AND ($3::text IS NULL OR payment_auth.order_id = $3)
    ORDER BY payment_auth.created_at DESC, payment_auth.id DESC
    LIMIT 1
  `, [provider, input.providerTransactionId || null, input.orderId || null]);
  return result.rows[0] ? mapPaymentAuthorizationContext(result.rows[0]) : null;
}

async function withPostgresPaymentOperationLock(database, input, operation) {
  const identifier = input.orderId || input.transactionId;
  if (!identifier) return operation();
  const lockKey = `order:${identifier}:payment-lifecycle`;
  const ownerId = `payment-cancel-${process.pid}-${randomUUID()}`;
  const now = input.now || new Date().toISOString();
  const lockedUntil = new Date(Date.parse(now) + Number(input.leaseMs || 300_000)).toISOString();
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
    const error = new Error("Payment cancellation is already in progress");
    error.code = "operation_locked";
    error.lock = { lockKey };
    throw error;
  }
  try {
    return await operation();
  } finally {
    await database.query(`
      DELETE FROM operation_locks
      WHERE lock_key = $1 AND owner_id = $2
    `, [lockKey, ownerId]);
  }
}

async function cancelPendingPostgresAuthorization(database, input = {}) {
  const initial = await getPostgresAuthorizationContext(database, input);
  if (!initial) return null;
  const now = input.now || new Date().toISOString();
  const reason = input.reason || "line_pay_cancel_redirect";
  return database.transaction(async (transaction) => {
    const state = await lockAuthorizationState(transaction, initial.authorization.id, initial.activityId);
    if (!state) return null;
    if (state.status !== "pending") return mapPaymentAuthorization(state);
    const updated = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'failed', failure_reason = $1, updated_at = $2
      WHERE id = $3
      RETURNING *
    `, [reason, now, state.id]);
    await insertProviderEvent(transaction, state, "cancel_redirect", {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
    }, input.providerTransactionId ? `${state.provider}_cancel:${input.providerTransactionId}` : null, now);
    await insertStatusHistory(transaction, state, "failed", reason, now);
    await insertAudit(transaction, "line_pay_cancel_authorization", state, {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
    }, now);
    await cancelReliabilityJob(transaction, state.id, now);
    return mapPaymentAuthorization(updated.rows[0]);
  });
}

async function voidPostgresAuthorization(database, input = {}) {
  const initial = await getPostgresAuthorizationContext(database, input);
  if (!initial) return null;
  const now = input.now || new Date().toISOString();
  const reason = input.reason || "line_pay_void_authorization";
  return database.transaction(async (transaction) => {
    const state = await lockAuthorizationState(transaction, initial.authorization.id, initial.activityId);
    if (!state) return null;
    if (state.status === "authorization_voided") return mapPaymentAuthorization(state);
    if (state.status === "captured") {
      return { error: "authorization_already_captured", authorization: mapPaymentAuthorization(state) };
    }
    const updated = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'authorization_voided', voided_at = $1,
          failure_reason = COALESCE(failure_reason, $2), updated_at = $1
      WHERE id = $3
      RETURNING *
    `, [now, reason, state.id]);
    await transaction.query(`
      UPDATE orders
      SET payment_status = 'authorization_voided',
          authorization_status = 'authorization_voided', updated_at = $1
      WHERE id = $2
        AND payment_status != 'captured'
        AND NOT EXISTS (
          SELECT 1 FROM payment_authorizations active_authorization
          WHERE active_authorization.order_id = $2
            AND active_authorization.id != $3
            AND active_authorization.status IN ('authorized', 'captured')
        )
    `, [now, state.order_id, state.id]);
    await insertProviderEvent(transaction, state, "void_success", {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      providerPayload: input.providerPayload || {},
    }, input.providerTransactionId ? `${state.provider}_void:${input.providerTransactionId}` : null, now);
    await insertStatusHistory(transaction, state, "authorization_voided", reason, now);
    await insertAudit(transaction, "line_pay_void_authorization", state, {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
    }, now);
    await cancelReliabilityJob(transaction, state.id, now);
    return mapPaymentAuthorization(updated.rows[0]);
  });
}

async function recordPostgresVoidFailure(database, input = {}) {
  const context = await getPostgresAuthorizationContext(database, input);
  if (!context) return null;
  const now = input.now || new Date().toISOString();
  const reason = input.reason || "line_pay_void_failed";
  await database.transaction(async (transaction) => {
    const state = await lockAuthorizationState(transaction, context.authorization.id, context.activityId);
    if (!state) return;
    await insertProviderEvent(transaction, state, "void_failed", {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      providerPayload: input.providerPayload || {},
    }, input.providerTransactionId ? `${state.provider}_void_failed:${input.providerTransactionId}` : null, now);
    await insertAudit(transaction, "line_pay_void_authorization_failed", state, {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      providerPayload: input.providerPayload || {},
    }, now);
  });
  return context.authorization;
}

async function lockAuthorizationState(transaction, authorizationId, activityId) {
  const activity = await transaction.query(`
    SELECT id FROM group_buy_activities WHERE id = $1 FOR UPDATE
  `, [activityId]);
  if (!activity.rows[0]) return null;
  const state = await transaction.query(`
    SELECT payment_auth.*
    FROM payment_authorizations payment_auth
    JOIN orders order_record ON order_record.id = payment_auth.order_id
    WHERE payment_auth.id = $1
    FOR UPDATE OF payment_auth, order_record
  `, [authorizationId]);
  return state.rows[0] || null;
}

async function insertProviderEvent(database, authorization, eventType, payload, idempotencyKey, now) {
  await database.query(`
    INSERT INTO payment_provider_events (
      id, provider, resource_type, resource_id, event_type,
      idempotency_key, payload_json, received_at, processed_at
    ) VALUES ($1, $2, 'authorization', $3, $4, $5, $6::jsonb, $7, $7)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [`provider-event-${randomUUID()}`, authorization.provider, authorization.id,
    eventType, idempotencyKey, JSON.stringify(payload), now]);
}

async function insertStatusHistory(database, authorization, toStatus, reason, now) {
  await database.query(`
    INSERT INTO status_history (
      id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
    ) VALUES ($1, 'payment_authorization', $2, $3, $4, $5, NULL, $6)
  `, [`status-history-${randomUUID()}`, authorization.id, authorization.status, toStatus, reason, now]);
}

async function insertAudit(database, actionType, authorization, metadata, now) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, NULL, $2, 'payment_authorization', $3, $4::jsonb, $5)
  `, [`audit-log-${randomUUID()}`, actionType, authorization.id, JSON.stringify(metadata), now]);
}

async function cancelReliabilityJob(database, authorizationId, now) {
  await database.query(`
    UPDATE payment_reliability_jobs
    SET status = 'cancelled', locked_by = NULL, locked_until = NULL,
        updated_at = $1, completed_at = $1
    WHERE job_type = 'reconcile_line_pay_request'
      AND resource_type = 'payment_authorization'
      AND resource_id = $2
      AND status IN ('queued', 'running', 'retry_wait')
  `, [now, authorizationId]);
}

function mapPaymentAuthorizationContext(row) {
  return { authorization: mapPaymentAuthorization(row), activityId: row.activity_id };
}

function mapPaymentAuthorization(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderRevisionId: null,
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
  cancelPendingPostgresAuthorization,
  createPaymentAuthorizationCancelRepository,
  getPostgresAuthorizationContext,
  recordPostgresVoidFailure,
  resolvePaymentAuthorizationCancelRuntime,
  voidPostgresAuthorization,
  withPostgresPaymentOperationLock,
};
