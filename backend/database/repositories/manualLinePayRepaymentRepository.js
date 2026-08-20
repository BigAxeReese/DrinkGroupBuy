"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const { withPostgresPaymentOperationLock } = require("./paymentAuthorizationCancelRepository");
const { getPostgresOrderDetail } = require("./customerOrderReadRepository");

function resolveManualLinePayRepaymentRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.MANUAL_LINE_PAY_REPAYMENT_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported MANUAL_LINE_PAY_REPAYMENT_RUNTIME: ${runtime}`);
}

function createManualLinePayRepaymentRepository(input = {}) {
  const runtime = resolveManualLinePayRepaymentRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of ["getRepaymentContext", "completeRepayment"]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when MANUAL_LINE_PAY_REPAYMENT_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getRepaymentContext: async (orderId, query) => gateway.getRepaymentContext(orderId, query),
      completeRepayment: async (value) => gateway.completeRepayment(value),
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
    getRepaymentContext: (orderId, query) => getPostgresRepaymentContext(database, orderId, query),
    completeRepayment: (value) => completePostgresRepayment(database, value),
    withOperationLock: (value, operation) => withPostgresPaymentOperationLock(database, value, operation),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresRepaymentContext(database, orderId, input = {}) {
  const now = input.now || new Date().toISOString();
  const cutoffMinutes = Number.isInteger(input.cutoffMinutes) && input.cutoffMinutes > 0
    ? input.cutoffMinutes
    : 15;

  const result = await database.query(`
    SELECT
      order_record.id,
      order_record.customer_user_id,
      order_record.status,
      order_record.payment_status,
      order_record.original_amount,
      order_record.final_amount,
      activity.id AS activity_id,
      activity.status AS activity_status,
      activity.pickup_start_at,
      capture.id AS failed_capture_id,
      capture.final_amount AS failed_capture_final_amount,
      capture.attempt_number AS failed_capture_attempt_number,
      capture.retryable AS failed_capture_retryable,
      original_payment_auth.id AS original_authorization_id,
      original_payment_auth.provider AS original_provider,
      original_payment_auth.status AS original_authorization_status,
      original_payment_auth.provider_authorization_id AS original_provider_transaction_id
    FROM orders order_record
    JOIN group_buy_activities activity ON activity.id = order_record.activity_id
    LEFT JOIN payment_captures capture
      ON capture.id = (
        SELECT id
        FROM payment_captures
        WHERE order_id = order_record.id
          AND status = 'failed'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )
    -- "authorization" is a reserved word in PostgreSQL and cannot be used as a bare table
    -- alias (confirmed against a real PostgreSQL 16 server); aliased as original_payment_auth
    -- instead since this specific join represents the authorization behind a failed capture.
    LEFT JOIN payment_authorizations original_payment_auth
      ON original_payment_auth.id = capture.payment_authorization_id
    WHERE order_record.id = $1
  `, [orderId]);
  const row = result.rows[0];
  if (!row) return null;

  const latestRepaymentResult = await database.query(`
    SELECT *
    FROM payment_authorizations
    WHERE order_id = $1
      AND payment_flow = 'direct_repayment'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [orderId]);
  const latestRepaymentRow = latestRepaymentResult.rows[0] || null;

  const pickupStartTime = Date.parse(toIsoString(row.pickup_start_at));
  const nowTime = Date.parse(now);
  const cutoffAt = Number.isNaN(pickupStartTime)
    ? null
    : new Date(pickupStartTime - cutoffMinutes * 60 * 1000).toISOString();
  const cutoffTime = cutoffAt ? Date.parse(cutoffAt) : Number.NaN;
  const finalAmount = Number(row.failed_capture_final_amount ?? row.final_amount ?? 0);
  const terminalCaptureFailure = Boolean(row.failed_capture_id) && !Boolean(row.failed_capture_retryable);

  const reason = determineManualRepaymentIneligibilityReason({
    paymentStatus: row.payment_status,
    latestRepaymentStatus: latestRepaymentRow?.status || null,
    terminalCaptureFailure,
    finalAmount,
    nowTime,
    cutoffTime,
  });

  return {
    orderId: row.id,
    customerUserId: row.customer_user_id,
    orderStatus: row.status,
    paymentStatus: row.payment_status,
    activityId: row.activity_id,
    activityStatus: row.activity_status,
    originalAmount: row.original_amount,
    finalAmount,
    pickupStartAt: toIsoString(row.pickup_start_at),
    cutoffAt,
    cutoffMinutes,
    eligible: reason == null,
    reason,
    failedCapture: row.failed_capture_id ? {
      id: row.failed_capture_id,
      attemptNumber: row.failed_capture_attempt_number,
      retryable: Boolean(row.failed_capture_retryable),
    } : null,
    originalAuthorization: row.original_authorization_id ? {
      id: row.original_authorization_id,
      provider: row.original_provider,
      status: row.original_authorization_status,
      providerAuthorizationId: row.original_provider_transaction_id,
    } : null,
    latestRepayment: latestRepaymentRow ? mapPaymentAuthorization(latestRepaymentRow) : null,
  };
}

function determineManualRepaymentIneligibilityReason({
  paymentStatus,
  latestRepaymentStatus,
  terminalCaptureFailure,
  finalAmount,
  nowTime,
  cutoffTime,
}) {
  if (paymentStatus === "captured" || latestRepaymentStatus === "captured") return "already_paid";
  if (latestRepaymentStatus === "pending") return "repayment_already_pending";
  if (paymentStatus !== "failed") return "payment_not_failed";
  if (!terminalCaptureFailure) return "automatic_capture_not_finished";
  if (!Number.isInteger(finalAmount) || finalAmount <= 0) return "final_amount_missing";
  if (Number.isNaN(nowTime) || Number.isNaN(cutoffTime) || nowTime >= cutoffTime) return "manual_repayment_expired";
  return null;
}

async function completePostgresRepayment(database, input) {
  const now = input.now || new Date().toISOString();
  const captureId = `payment-capture-${randomUUID()}`;
  const provider = input.provider || "line_pay";

  return database.transaction(async (transaction) => {
    const authorizationResult = await transaction.query(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = $1
        AND provider_authorization_id = $2
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [provider, input.providerTransactionId]);
    const authorization = authorizationResult.rows[0];
    if (!authorization) return null;
    if (authorization.payment_flow !== "direct_repayment") {
      return {
        error: "payment_flow_mismatch",
        authorization: mapPaymentAuthorization(authorization),
      };
    }
    if (authorization.status === "captured") {
      const existingCaptureResult = await transaction.query(`
        SELECT * FROM payment_captures
        WHERE payment_authorization_id = $1 AND status = 'captured'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `, [authorization.id]);
      const existingCapture = existingCaptureResult.rows[0];
      return {
        authorization: mapPaymentAuthorization(authorization),
        capture: existingCapture ? mapPaymentCapture(existingCapture) : null,
        status: "captured",
      };
    }
    if (authorization.status !== "pending") {
      return {
        error: "repayment_not_pending",
        authorization: mapPaymentAuthorization(authorization),
      };
    }

    const orderResult = await transaction.query(`
      SELECT order_record.*, activity.status AS activity_status
      FROM orders order_record
      JOIN group_buy_activities activity ON activity.id = order_record.activity_id
      WHERE order_record.id = $1
      FOR UPDATE OF order_record
    `, [authorization.order_id]);
    const order = orderResult.rows[0];
    if (!order) return null;

    const amount = Number(input.amount ?? authorization.original_amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount !== Number(authorization.original_amount)) {
      return {
        error: "repayment_amount_mismatch",
        expectedAmount: Number(authorization.original_amount),
        requestedAmount: amount,
        authorization: mapPaymentAuthorization(authorization),
      };
    }
    if (order.payment_status === "captured") {
      return {
        error: "already_paid",
        authorization: mapPaymentAuthorization(authorization),
      };
    }

    const updateAuthorizationResult = await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'captured',
          authorized_amount = $2,
          authorized_at = $3,
          failure_reason = NULL,
          updated_at = $3
      WHERE id = $1
        AND status = 'pending'
      RETURNING *
    `, [authorization.id, amount, now]);
    if (updateAuthorizationResult.rowCount !== 1) {
      const currentResult = await transaction.query(`
        SELECT * FROM payment_authorizations WHERE id = $1
      `, [authorization.id]);
      return {
        error: "repayment_state_changed",
        authorization: mapPaymentAuthorization(currentResult.rows[0]),
      };
    }

    await transaction.query(`
      INSERT INTO payment_captures (
        id, payment_authorization_id, order_id, status, final_amount, capture_amount,
        released_amount, provider_capture_id, captured_at, attempt_number, retryable,
        next_retry_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'captured', $4, $4, 0, $5, $6, 1, false, NULL, $6, $6)
    `, [
      captureId,
      authorization.id,
      authorization.order_id,
      amount,
      input.providerCaptureId || input.providerTransactionId || authorization.provider_authorization_id,
      now,
    ]);

    await transaction.query(`
      UPDATE orders
      SET payment_status = 'captured',
          authorization_status = 'captured',
          final_amount = $2,
          merchant_acceptance_status = 'accepted',
          pickup_status = CASE WHEN pickup_status = 'cancelled' THEN pickup_status ELSE 'not_ready' END,
          updated_at = $3
      WHERE id = $1
        AND payment_status != 'captured'
    `, [authorization.order_id, amount, now]);

    const activityUpdateResult = await transaction.query(`
      UPDATE group_buy_activities
      SET status = 'ordering',
          updated_at = $2
      WHERE id = $1
        AND status = 'failed'
    `, [order.activity_id, now]);

    await transaction.query(`
      INSERT INTO payment_provider_events (
        id, provider, resource_type, resource_id, event_type, idempotency_key, payload_json, received_at, processed_at
      ) VALUES ($1, $2, 'capture', $3, 'manual_repayment_confirmed', $4, $5::jsonb, $6, $6)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      `provider-event-${randomUUID()}`,
      authorization.provider,
      captureId,
      authorization.provider_authorization_id
        ? `${authorization.provider}_manual_repayment_confirmed:${authorization.provider_authorization_id}`
        : null,
      JSON.stringify({
        orderId: authorization.order_id,
        amount,
        providerPayload: input.providerPayload || {},
      }),
      now,
    ]);

    await transaction.query(`
      INSERT INTO status_history (
        id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
      ) VALUES ($1, 'payment_authorization', $2, 'pending', 'captured', 'manual_repayment_confirmed', NULL, $3)
    `, [`status-history-${randomUUID()}`, authorization.id, now]);

    if (activityUpdateResult.rowCount === 1) {
      await transaction.query(`
        INSERT INTO status_history (
          id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
        ) VALUES ($1, 'activity', $2, 'failed', 'ordering', 'manual_repayment_received', NULL, $3)
      `, [`status-history-${randomUUID()}`, order.activity_id, now]);
    }

    await transaction.query(`
      INSERT INTO audit_logs (
        id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
      ) VALUES ($1, NULL, 'line_pay_manual_repayment_captured', 'order', $2, $3::jsonb, $4)
    `, [
      `audit-log-${randomUUID()}`,
      authorization.order_id,
      JSON.stringify({
        paymentAuthorizationId: authorization.id,
        captureId,
        amount,
        providerTransactionId: authorization.provider_authorization_id,
      }),
      now,
    ]);

    const capture = {
      id: captureId,
      paymentAuthorizationId: authorization.id,
      orderId: authorization.order_id,
      status: "captured",
      finalAmount: amount,
      captureAmount: amount,
      releasedAmount: 0,
      providerCaptureId: input.providerCaptureId || input.providerTransactionId || authorization.provider_authorization_id,
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    return {
      authorization: {
        ...mapPaymentAuthorization(authorization),
        status: "captured",
        authorizedAmount: amount,
        authorizedAt: now,
        failureReason: null,
        updatedAt: now,
      },
      capture,
      order: await getPostgresOrderDetail(transaction, authorization.order_id),
      status: "captured",
    };
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
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  completePostgresRepayment,
  createManualLinePayRepaymentRepository,
  getPostgresRepaymentContext,
  resolveManualLinePayRepaymentRuntime,
};
