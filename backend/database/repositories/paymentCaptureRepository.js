"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const {
  getPostgresAuthorizationContext,
  withPostgresPaymentOperationLock,
} = require("./paymentAuthorizationCancelRepository");

function resolvePaymentCaptureRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.PAYMENT_CAPTURE_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported PAYMENT_CAPTURE_RUNTIME: ${runtime}`);
}

function createPaymentCaptureRepository(input = {}) {
  const runtime = resolvePaymentCaptureRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of ["getAuthorizationContext", "captureAuthorization", "recordCaptureFailure"]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when PAYMENT_CAPTURE_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getAuthorizationContext: async (value) => gateway.getAuthorizationContext(value),
      captureAuthorization: async (value) => gateway.captureAuthorization(value),
      recordCaptureFailure: async (value) => gateway.recordCaptureFailure(value),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    getAuthorizationContext: (value) => getPostgresAuthorizationContext(database, value),
    captureAuthorization: (value) => capturePostgresAuthorization(database, value),
    recordCaptureFailure: (value) => recordPostgresCaptureFailure(database, value),
    withOperationLock: (value, operation) => (
      withPostgresPaymentOperationLock(database, value, operation)
    ),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function capturePostgresAuthorization(database, input = {}) {
  const initial = await getPostgresAuthorizationContext(database, input);
  if (!initial) return null;
  const now = input.now || new Date().toISOString();
  const captureAmount = Number(input.amount);
  const finalAmount = Number(input.finalAmount ?? input.amount);
  const reason = input.reason || "line_pay_capture_success";

  return database.transaction(async (transaction) => {
    const state = await lockCaptureState(transaction, initial.authorization.id, initial.activityId);
    if (!state) return null;
    if (state.status === "captured") {
      const latest = await getLatestCapture(transaction, state.id);
      return {
        authorization: mapPaymentAuthorization(state),
        capture: latest,
        status: "captured",
      };
    }
    if (state.status !== "authorized") {
      return {
        error: "authorization_not_capturable",
        status: state.status,
        authorization: mapPaymentAuthorization(state),
      };
    }
    if (!Number.isInteger(captureAmount) || captureAmount < 0) {
      return { error: "invalid_capture_amount" };
    }
    if (captureAmount > Number(state.authorized_amount)) {
      return {
        error: "capture_amount_exceeds_authorized_amount",
        authorizedAmount: Number(state.authorized_amount),
        captureAmount,
      };
    }

    const captureId = `payment-capture-${randomUUID()}`;
    const releasedAmount = Math.max(Number(state.authorized_amount) - captureAmount, 0);
    const captureResult = await transaction.query(`
      INSERT INTO payment_captures (
        id, payment_authorization_id, order_id, status,
        final_amount, capture_amount, released_amount,
        provider_capture_id, captured_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'captured', $4, $5, $6, $7, $8, $8, $8)
      RETURNING *
    `, [
      captureId,
      state.id,
      state.order_id,
      finalAmount,
      captureAmount,
      releasedAmount,
      input.providerCaptureId || input.providerTransactionId || state.provider_authorization_id || null,
      now,
    ]);
    const authorizationResult = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'captured', updated_at = $1
      WHERE id = $2
      RETURNING *
    `, [now, state.id]);
    await transaction.query(`
      UPDATE orders
      SET payment_status = 'captured', authorization_status = 'captured',
          final_amount = $1, updated_at = $2
      WHERE id = $3
    `, [finalAmount, now, state.order_id]);
    await insertProviderEvent(transaction, state.provider, captureId, "capture_success", {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      providerPayload: input.providerPayload || {},
    }, input.providerTransactionId
      ? `${state.provider}_capture:${input.providerTransactionId}:${captureAmount}`
      : null, now);
    await transaction.query(`
      INSERT INTO status_history (
        id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
      ) VALUES ($1, 'payment_authorization', $2, $3, 'captured', $4, NULL, $5)
    `, [`status-history-${randomUUID()}`, state.id, state.status, reason, now]);
    await insertAudit(transaction, "line_pay_capture_authorization", state.id, {
      captureId,
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      finalAmount,
      captureAmount,
      releasedAmount,
      reason,
    }, now);
    return {
      authorization: mapPaymentAuthorization(authorizationResult.rows[0]),
      capture: mapPaymentCapture(captureResult.rows[0]),
      status: "captured",
    };
  });
}

async function recordPostgresCaptureFailure(database, input = {}) {
  const initial = await getPostgresAuthorizationContext(database, input);
  if (!initial) return null;
  const now = input.now || new Date().toISOString();
  const captureAmount = normalizeNonNegativeInteger(input.amount);
  const finalAmount = normalizeNonNegativeInteger(input.finalAmount ?? input.amount);
  const reason = input.reason || "line_pay_capture_failed";
  const maxAttempts = normalizePositiveInteger(input.maxAttempts, 3);
  const retryIntervalMs = normalizePositiveInteger(input.retryIntervalMs, 30_000);

  return database.transaction(async (transaction) => {
    const state = await lockCaptureState(transaction, initial.authorization.id, initial.activityId);
    if (!state) return null;
    if (state.status === "captured") {
      return {
        authorization: mapPaymentAuthorization(state),
        capture: await getLatestCapture(transaction, state.id),
        status: "captured",
        retryable: false,
        nextRetryAt: null,
      };
    }
    const attemptsResult = await transaction.query(`
      SELECT *
      FROM payment_captures
      WHERE payment_authorization_id = $1 AND status = 'failed'
      ORDER BY created_at DESC, id DESC
      FOR UPDATE
    `, [state.id]);
    const previousAttempts = attemptsResult.rows;
    if (previousAttempts.length >= maxAttempts) {
      await markOrderCaptureFailed(transaction, state.order_id, now);
      return {
        authorization: mapPaymentAuthorization(state),
        capture: previousAttempts[0] ? mapPaymentCapture(previousAttempts[0]) : null,
        status: "retry_exhausted",
        attemptCount: previousAttempts.length,
        maxAttempts,
        retryable: false,
        nextRetryAt: null,
      };
    }

    const attemptNumber = previousAttempts.length + 1;
    const retryable = Boolean(input.retryable) && attemptNumber < maxAttempts;
    const nextRetryAt = retryable
      ? new Date(Date.parse(now) + retryIntervalMs).toISOString()
      : null;
    const captureId = `payment-capture-${randomUUID()}`;
    const captureResult = await transaction.query(`
      INSERT INTO payment_captures (
        id, payment_authorization_id, order_id, status,
        final_amount, capture_amount, released_amount,
        provider_capture_id, failure_reason, attempt_number,
        retryable, next_retry_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'failed', $4, $5, 0, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *
    `, [
      captureId,
      state.id,
      state.order_id,
      finalAmount,
      captureAmount,
      input.providerCaptureId || input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      attemptNumber,
      retryable,
      nextRetryAt,
      now,
    ]);
    if (!retryable) await markOrderCaptureFailed(transaction, state.order_id, now);
    await insertProviderEvent(transaction, state.provider, captureId, "capture_failed", {
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      reason,
      attemptNumber,
      maxAttempts,
      retryable,
      nextRetryAt,
      providerPayload: input.providerPayload || {},
    }, input.providerTransactionId
      ? `${state.provider}_capture_failed:${input.providerTransactionId}:${captureAmount}:${attemptNumber}`
      : null, now);
    await insertAudit(transaction, "line_pay_capture_authorization_failed", state.id, {
      captureId,
      orderId: state.order_id,
      providerTransactionId: input.providerTransactionId || state.provider_authorization_id || null,
      finalAmount,
      captureAmount,
      reason,
      attemptNumber,
      maxAttempts,
      retryable,
      nextRetryAt,
      providerPayload: input.providerPayload || {},
    }, now);
    return {
      authorization: mapPaymentAuthorization(state),
      capture: mapPaymentCapture(captureResult.rows[0]),
      status: retryable ? "retry_pending" : "retry_exhausted",
      attemptCount: attemptNumber,
      maxAttempts,
      retryable,
      nextRetryAt,
    };
  });
}

async function lockCaptureState(transaction, authorizationId, activityId) {
  const activityResult = await transaction.query(`
    SELECT id FROM group_buy_activities WHERE id = $1 FOR UPDATE
  `, [activityId]);
  if (!activityResult.rows[0]) return null;
  const stateResult = await transaction.query(`
    SELECT payment_auth.*
    FROM payment_authorizations payment_auth
    JOIN orders order_record ON order_record.id = payment_auth.order_id
    WHERE payment_auth.id = $1
    FOR UPDATE OF payment_auth, order_record
  `, [authorizationId]);
  return stateResult.rows[0] || null;
}

async function getLatestCapture(database, authorizationId) {
  const result = await database.query(`
    SELECT * FROM payment_captures
    WHERE payment_authorization_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [authorizationId]);
  return result.rows[0] ? mapPaymentCapture(result.rows[0]) : null;
}

async function markOrderCaptureFailed(database, orderId, now) {
  await database.query(`
    UPDATE orders
    SET payment_status = 'failed', updated_at = $1
    WHERE id = $2 AND payment_status != 'captured'
  `, [now, orderId]);
}

async function insertProviderEvent(database, provider, captureId, eventType, payload, key, now) {
  await database.query(`
    INSERT INTO payment_provider_events (
      id, provider, resource_type, resource_id, event_type,
      idempotency_key, payload_json, received_at, processed_at
    ) VALUES ($1, $2, 'capture', $3, $4, $5, $6::jsonb, $7, $7)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [`provider-event-${randomUUID()}`, provider, captureId, eventType, key,
    JSON.stringify(payload), now]);
}

async function insertAudit(database, actionType, authorizationId, metadata, now) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, NULL, $2, 'payment_authorization', $3, $4::jsonb, $5)
  `, [`audit-log-${randomUUID()}`, actionType, authorizationId, JSON.stringify(metadata), now]);
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

function mapPaymentCapture(row) {
  return {
    id: row.id,
    paymentAuthorizationId: row.payment_authorization_id,
    orderId: row.order_id,
    status: row.status,
    finalAmount: Number(row.final_amount),
    captureAmount: Number(row.capture_amount),
    releasedAmount: Number(row.released_amount),
    providerCaptureId: row.provider_capture_id,
    capturedAt: toIsoString(row.captured_at),
    failureReason: row.failure_reason,
    attemptNumber: Number(row.attempt_number),
    retryable: Boolean(row.retryable),
    nextRetryAt: toIsoString(row.next_retry_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  capturePostgresAuthorization,
  createPaymentCaptureRepository,
  recordPostgresCaptureFailure,
  resolvePaymentCaptureRuntime,
};
