"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function resolvePaymentAuthorizationConfirmRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(
    input.runtime || env.PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME || "sqlite"
  ).trim().toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME: ${runtime}`);
}

function createPaymentAuthorizationConfirmRepository(input = {}) {
  const runtime = resolvePaymentAuthorizationConfirmRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of ["getAuthorizationContext", "confirmAuthorization"]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when PAYMENT_AUTHORIZATION_CONFIRM_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getAuthorizationContext: async (query) => gateway.getAuthorizationContext(query),
      confirmAuthorization: async (confirmation) => gateway.confirmAuthorization(confirmation),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  const env = input.env || process.env;
  return {
    kind: "postgres",
    getAuthorizationContext: (query) => getPostgresAuthorizationContext(database, query, env),
    confirmAuthorization: (confirmation) => (
      confirmPostgresAuthorization(database, confirmation, env)
    ),
    recordCompensatingVoidSuccess: (voidInput) => (
      recordPostgresCompensatingVoidSuccess(database, voidInput)
    ),
    recordCompensatingVoidFailure: (voidInput) => (
      recordPostgresCompensatingVoidFailure(database, voidInput)
    ),
    withConfirmLock: (lockInput, operation) => (
      withPostgresConfirmLock(database, lockInput, operation)
    ),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresAuthorizationContext(database, input = {}, env = process.env) {
  const provider = input.provider || "line_pay";
  const result = await database.query(`
    SELECT
      payment_auth.*,
      order_record.activity_id,
      order_record.original_amount AS order_original_amount
    FROM payment_authorizations payment_auth
    JOIN orders order_record ON order_record.id = payment_auth.order_id
    WHERE payment_auth.provider = $1
      AND ($2::text IS NULL OR payment_auth.provider_authorization_id = $2)
      AND ($3::text IS NULL OR payment_auth.order_id = $3)
    ORDER BY payment_auth.created_at DESC, payment_auth.id DESC
    LIMIT 1
  `, [provider, input.providerTransactionId || null, input.orderId || null]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    authorization: mapPaymentAuthorization(row),
    order: {
      id: row.order_id,
      activityId: row.activity_id,
      originalAmount: Number(row.order_original_amount),
    },
    amount: Number(row.original_amount),
    currency: env.LINE_PAY_CURRENCY || "TWD",
  };
}

async function withPostgresConfirmLock(database, input, operation) {
  const identifier = input.transactionId || input.orderId;
  const lockKey = `line-pay:${identifier}`;
  const ownerId = `line-pay-confirm-${process.pid}-${randomUUID()}`;
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
    const error = new Error("LINE Pay confirm is already in progress");
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

async function confirmPostgresAuthorization(database, input, env = process.env) {
  const initial = await getPostgresAuthorizationContext(database, input, env);
  if (!initial) return null;
  if (initial.authorization.status !== "pending") return initial.authorization;
  const now = input.now || new Date().toISOString();

  return database.transaction(async (transaction) => {
    const activityResult = await transaction.query(`
      SELECT id, deadline_at, maximum_cups
      FROM group_buy_activities
      WHERE id = $1
      FOR UPDATE
    `, [initial.order.activityId]);
    const activity = activityResult.rows[0];
    if (!activity) return null;

    const stateResult = await transaction.query(`
      SELECT
        payment_auth.*,
        order_record.activity_id,
        order_record.total_cups,
        order_record.original_amount AS order_original_amount,
        order_record.payment_status AS order_payment_status
      FROM payment_authorizations payment_auth
      JOIN orders order_record ON order_record.id = payment_auth.order_id
      WHERE payment_auth.id = $1
      FOR UPDATE OF payment_auth, order_record
    `, [initial.authorization.id]);
    const state = stateResult.rows[0];
    if (!state) return null;
    if (state.status !== "pending") return mapPaymentAuthorization(state);

    const authorizationExpiresAt = extractAuthorizationExpiresAt(input.providerPayload);
    const rejection = validateConfirmation({
      now,
      deadlineAt: activity.deadline_at,
      provider: state.provider,
      expiresAt: authorizationExpiresAt,
      env,
    });
    const capacityResult = await transaction.query(`
      SELECT COALESCE(SUM(total_cups), 0)::integer AS authorized_cups
      FROM orders
      WHERE activity_id = $1
        AND id != $2
        AND payment_status IN ('authorized', 'captured')
        AND status != 'cancelled'
    `, [state.activity_id, state.order_id]);
    const authorizedCups = Number(capacityResult.rows[0]?.authorized_cups || 0);
    const requestedCups = Number(state.total_cups);
    const maximumCups = activity.maximum_cups == null ? null : Number(activity.maximum_cups);
    const capacityExceeded = maximumCups != null && authorizedCups + requestedCups > maximumCups;
    const error = rejection || (capacityExceeded ? "capacity_exceeded" : null);

    if (error) {
      return persistConfirmRejection(transaction, {
        state,
        activity,
        error,
        now,
        authorizationExpiresAt,
        authorizedCups,
        requestedCups,
        maximumCups,
        providerPayload: input.providerPayload,
        providerTransactionId: input.providerTransactionId,
        env,
      });
    }

    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount !== Number(state.original_amount)) {
      throw new Error("Confirmed authorization amount does not match persisted authorization");
    }
    const authorizationResult = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'authorized',
          authorized_amount = $1,
          expires_at = $2,
          authorized_at = $3,
          failure_reason = NULL,
          updated_at = $3
      WHERE id = $4 AND status = 'pending'
      RETURNING *
    `, [amount, authorizationExpiresAt, now, state.id]);
    await transaction.query(`
      UPDATE orders
      SET payment_status = 'authorized',
          authorization_status = 'authorized',
          merchant_acceptance_status = 'accepted',
          updated_at = $1
      WHERE id = $2
    `, [now, state.order_id]);
    await insertProviderEvent(transaction, {
      authorization: state,
      eventType: "confirm_success",
      idempotencyKey: input.providerTransactionId
        ? `${state.provider}_confirm:${input.providerTransactionId}`
        : null,
      payload: { providerPayload: input.providerPayload || {}, orderRevisionId: null },
      now,
    });
    await insertStatusHistory(transaction, state, "authorized", "line_pay_confirm_success", now);
    await insertAudit(transaction, {
      actionType: "line_pay_confirm_authorized",
      authorizationId: state.id,
      metadata: {
        orderId: state.order_id,
        activityId: state.activity_id,
        providerTransactionId: input.providerTransactionId,
        authorizedAmount: amount,
        authorizedCups: authorizedCups + requestedCups,
      },
      now,
    });
    await completeReliabilityJob(transaction, state.id, now);
    return mapPaymentAuthorization(authorizationResult.rows[0]);
  });
}

async function persistConfirmRejection(transaction, input) {
  const failureReason = input.error === "capacity_exceeded"
    ? "capacity_exceeded_at_confirm"
    : input.error;
  const updated = await transaction.query(`
    UPDATE payment_authorizations
    SET status = 'failed',
        expires_at = $1,
        failure_reason = $2,
        updated_at = $3
    WHERE id = $4
    RETURNING *
  `, [input.authorizationExpiresAt, failureReason, input.now, input.state.id]);
  const eventType = input.error === "capacity_exceeded"
    ? "confirm_capacity_rejected"
    : input.error === "authorization_confirmed_after_deadline"
      ? "confirm_deadline_rejected"
      : "confirm_expiry_rejected";
  await insertProviderEvent(transaction, {
    authorization: input.state,
    eventType,
    idempotencyKey: input.providerTransactionId
      ? `${input.state.provider}_${eventType}:${input.providerTransactionId}`
      : null,
    payload: {
      providerPayload: input.providerPayload || {},
      maximumCups: input.maximumCups,
      authorizedCups: input.authorizedCups,
      requestedCups: input.requestedCups,
      confirmAt: input.now,
      deadlineAt: toIsoString(input.activity.deadline_at),
      authorizationExpiresAt: input.authorizationExpiresAt,
      requiredExpiresAfter: getRequiredExpiry(input.activity.deadline_at, input.env),
    },
    now: input.now,
  });
  await insertStatusHistory(
    transaction,
    input.state,
    "failed",
    failureReason,
    input.now
  );
  await insertAudit(transaction, {
    actionType: `line_pay_${eventType}`,
    authorizationId: input.state.id,
    metadata: {
      orderId: input.state.order_id,
      activityId: input.state.activity_id,
      providerTransactionId: input.providerTransactionId,
      maximumCups: input.maximumCups,
      authorizedCups: input.authorizedCups,
      requestedCups: input.requestedCups,
      failureReason,
    },
    now: input.now,
  });
  await completeReliabilityJob(transaction, input.state.id, input.now);
  return {
    error: input.error,
    maximumCups: input.maximumCups,
    authorizedCups: input.authorizedCups,
    requestedCups: input.requestedCups,
    confirmAt: input.now,
    deadlineAt: toIsoString(input.activity.deadline_at),
    authorizationExpiresAt: input.authorizationExpiresAt,
    requiredExpiresAfter: getRequiredExpiry(input.activity.deadline_at, input.env),
    authorization: mapPaymentAuthorization(updated.rows[0]),
  };
}

async function recordPostgresCompensatingVoidSuccess(database, input) {
  const now = input.now || new Date().toISOString();
  return database.transaction(async (transaction) => {
    const result = await transaction.query(`
      SELECT * FROM payment_authorizations
      WHERE provider_authorization_id = $1 AND provider = $2
      FOR UPDATE
    `, [input.providerTransactionId, input.provider || "line_pay"]);
    const authorization = result.rows[0];
    if (!authorization) return null;
    if (authorization.status === "authorization_voided") return mapPaymentAuthorization(authorization);
    const updated = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'authorization_voided',
          voided_at = $1,
          failure_reason = COALESCE(failure_reason, $2),
          updated_at = $1
      WHERE id = $3
      RETURNING *
    `, [now, input.reason, authorization.id]);
    await transaction.query(`
      UPDATE orders
      SET payment_status = 'authorization_voided',
          authorization_status = 'authorization_voided',
          updated_at = $1
      WHERE id = $2
        AND payment_status != 'captured'
        AND NOT EXISTS (
          SELECT 1
          FROM payment_authorizations active_authorization
          WHERE active_authorization.order_id = $2
            AND active_authorization.id != $3
            AND active_authorization.status IN ('authorized', 'captured')
        )
    `, [now, authorization.order_id, authorization.id]);
    await insertProviderEvent(transaction, {
      authorization,
      eventType: "void_success",
      idempotencyKey: `${authorization.provider}_void:${input.providerTransactionId}`,
      payload: {
        orderId: authorization.order_id,
        reason: input.reason,
        providerPayload: input.providerPayload || {},
      },
      now,
    });
    await insertStatusHistory(transaction, authorization, "authorization_voided", input.reason, now);
    await insertAudit(transaction, {
      actionType: "line_pay_confirm_rejection_void",
      authorizationId: authorization.id,
      metadata: { orderId: authorization.order_id, reason: input.reason },
      now,
    });
    return mapPaymentAuthorization(updated.rows[0]);
  });
}

async function recordPostgresCompensatingVoidFailure(database, input) {
  const now = input.now || new Date().toISOString();
  const context = await getPostgresAuthorizationContext(database, input);
  if (!context) return null;
  await database.transaction(async (transaction) => {
    await insertProviderEvent(transaction, {
      authorization: {
        id: context.authorization.id,
        provider: context.authorization.provider,
      },
      eventType: "confirm_rejection_void_failed",
      idempotencyKey: `${context.authorization.provider}_confirm_void_failed:${input.providerTransactionId}`,
      payload: {
        orderId: context.authorization.orderId,
        reason: input.reason,
        providerPayload: input.providerPayload || {},
      },
      now,
    });
    await insertAudit(transaction, {
      actionType: "line_pay_confirm_rejection_void_failed",
      authorizationId: context.authorization.id,
      metadata: {
        orderId: context.authorization.orderId,
        reason: input.reason,
        providerPayload: input.providerPayload || {},
      },
      now,
    });
  });
  return context.authorization;
}

async function insertProviderEvent(database, input) {
  await database.query(`
    INSERT INTO payment_provider_events (
      id, provider, resource_type, resource_id, event_type,
      idempotency_key, payload_json, received_at, processed_at
    ) VALUES ($1, $2, 'authorization', $3, $4, $5, $6::jsonb, $7, $7)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [
    `provider-event-${randomUUID()}`,
    input.authorization.provider,
    input.authorization.id,
    input.eventType,
    input.idempotencyKey,
    JSON.stringify(input.payload || {}),
    input.now,
  ]);
}

async function insertStatusHistory(database, authorization, toStatus, reason, now) {
  await database.query(`
    INSERT INTO status_history (
      id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
    ) VALUES ($1, 'payment_authorization', $2, $3, $4, $5, NULL, $6)
  `, [
    `status-history-${randomUUID()}`,
    authorization.id,
    authorization.status,
    toStatus,
    reason,
    now,
  ]);
}

async function insertAudit(database, input) {
  await database.query(`
    INSERT INTO audit_logs (
      id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
    ) VALUES ($1, NULL, $2, 'payment_authorization', $3, $4::jsonb, $5)
  `, [
    `audit-log-${randomUUID()}`,
    input.actionType,
    input.authorizationId,
    JSON.stringify(input.metadata || {}),
    input.now,
  ]);
}

async function completeReliabilityJob(database, authorizationId, now) {
  await database.query(`
    UPDATE payment_reliability_jobs
    SET status = 'succeeded',
        locked_by = NULL,
        locked_until = NULL,
        updated_at = $1,
        completed_at = $1
    WHERE job_type = 'reconcile_line_pay_request'
      AND resource_type = 'payment_authorization'
      AND resource_id = $2
      AND status IN ('queued', 'running', 'retry_wait')
  `, [now, authorizationId]);
}

function validateConfirmation({ now, deadlineAt, provider, expiresAt, env }) {
  if (Date.parse(now) >= Date.parse(deadlineAt)) {
    return "authorization_confirmed_after_deadline";
  }
  if (provider !== "line_pay" || !readBoolean(env.LINE_PAY_CAPTURE_SEPARATED, false)) {
    return null;
  }
  if (!expiresAt) return "authorization_expiry_missing";
  if (Number.isNaN(Date.parse(expiresAt))) return "authorization_expiry_invalid";
  const required = getRequiredExpiry(deadlineAt, env);
  return required && Date.parse(expiresAt) <= Date.parse(required)
    ? "authorization_expiry_too_short"
    : null;
}

function extractAuthorizationExpiresAt(payload) {
  const value = payload?.info?.authorizationExpireDate || payload?.authorizationExpireDate;
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(Date.parse(value)).toISOString();
}

function getRequiredExpiry(deadlineAt, env) {
  const deadline = Date.parse(deadlineAt);
  if (Number.isNaN(deadline)) return null;
  const configured = Number(env.LINE_PAY_AUTHORIZATION_SETTLEMENT_BUFFER_MINUTES);
  const bufferMinutes = Number.isInteger(configured) && configured > 0 ? configured : 30;
  return new Date(deadline + bufferMinutes * 60_000).toISOString();
}

function readBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
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
  confirmPostgresAuthorization,
  createPaymentAuthorizationConfirmRepository,
  getPostgresAuthorizationContext,
  recordPostgresCompensatingVoidFailure,
  recordPostgresCompensatingVoidSuccess,
  resolvePaymentAuthorizationConfirmRuntime,
  withPostgresConfirmLock,
};
