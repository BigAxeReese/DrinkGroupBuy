"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");

function resolveCustomerOrderCancelRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(
    input.runtime || env.CUSTOMER_ORDER_CANCEL_RUNTIME || "sqlite"
  ).trim().toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported CUSTOMER_ORDER_CANCEL_RUNTIME: ${runtime}`);
}

function createCustomerOrderCancelRepository(input = {}) {
  const runtime = resolveCustomerOrderCancelRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of ["getEligibility", "cancelOrder"]) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when CUSTOMER_ORDER_CANCEL_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getEligibility: async (value) => gateway.getEligibility(value),
      cancelOrder: async (value) => gateway.cancelOrder(value),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    getEligibility: (value) => getPostgresCancellationEligibility(database, value),
    cancelOrder: (value) => cancelPostgresCustomerOrder(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function getPostgresCancellationEligibility(database, input = {}) {
  const result = await database.query(`
    SELECT order_record.*, activity.deadline_at, activity.withdrawal_lock_minutes
    FROM orders order_record
    JOIN group_buy_activities activity ON activity.id = order_record.activity_id
    WHERE order_record.id = $1
  `, [input.orderId]);
  return evaluateCancellation(result.rows[0], input, input.now || new Date().toISOString());
}

async function cancelPostgresCustomerOrder(database, input = {}) {
  const now = input.now || new Date().toISOString();
  const initial = await database.query(`
    SELECT activity_id FROM orders WHERE id = $1
  `, [input.orderId]);
  if (!initial.rows[0]) return { error: "order_not_found" };

  return database.transaction(async (transaction) => {
    const activityResult = await transaction.query(`
      SELECT id, deadline_at, withdrawal_lock_minutes
      FROM group_buy_activities
      WHERE id = $1
      FOR UPDATE
    `, [initial.rows[0].activity_id]);
    const activity = activityResult.rows[0];
    if (!activity) return { error: "order_not_found" };

    if (input.idempotencyKey) {
      const actionResult = await transaction.query(`
        SELECT order_id, actor_user_id, action_type, result_json
        FROM order_action_idempotency
        WHERE idempotency_key = $1
      `, [input.idempotencyKey]);
      const action = actionResult.rows[0];
      if (action) {
        if (action.order_id !== input.orderId
          || action.actor_user_id !== input.customerUserId
          || action.action_type !== "customer_cancel_order") {
          return { error: "idempotency_key_conflict" };
        }
        return { ...action.result_json, idempotent: true };
      }
    }

    const orderResult = await transaction.query(`
      SELECT order_record.*, $2::timestamptz AS deadline_at,
             $3::integer AS withdrawal_lock_minutes
      FROM orders order_record
      WHERE order_record.id = $1
      FOR UPDATE
    `, [input.orderId, activity.deadline_at, Number(activity.withdrawal_lock_minutes || 30)]);
    const order = orderResult.rows[0];
    const eligibility = evaluateCancellation(order, input, now);
    if (eligibility.error) return eligibility;
    if (eligibility.alreadyCancelled) {
      return { orderId: order.id, status: "cancelled", idempotent: true };
    }
    if (order.payment_status === "authorized") {
      return { error: "authorization_void_required", paymentStatus: order.payment_status };
    }

    const pendingAuthorizations = await transaction.query(`
      SELECT id, status
      FROM payment_authorizations
      WHERE order_id = $1 AND status = 'pending'
      FOR UPDATE
    `, [order.id]);
    const updateResult = await transaction.query(`
      UPDATE orders
      SET status = 'cancelled', pickup_status = 'cancelled',
          merchant_acceptance_status = 'cancelled', updated_at = $1
      WHERE id = $2
        AND status != 'cancelled'
        AND payment_status NOT IN ('captured', 'refunded')
      RETURNING id
    `, [now, order.id]);
    if (!updateResult.rows[0]) return { error: "order_state_changed" };

    await transaction.query(`
      UPDATE payment_authorizations
      SET status = 'failed', failure_reason = 'customer_cancelled_order', updated_at = $1
      WHERE order_id = $2 AND status = 'pending'
    `, [now, order.id]);
    for (const authorization of pendingAuthorizations.rows) {
      await transaction.query(`
        INSERT INTO status_history (
          id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
        ) VALUES ($1, 'payment_authorization', $2, $3, 'failed',
                  'customer_cancelled_order', $4, $5)
      `, [`status-history-${randomUUID()}`, authorization.id, authorization.status,
        input.customerUserId, now]);
      await transaction.query(`
        UPDATE payment_reliability_jobs
        SET status = 'cancelled', locked_by = NULL, locked_until = NULL,
            updated_at = $1, completed_at = $1
        WHERE job_type = 'reconcile_line_pay_request'
          AND resource_type = 'payment_authorization'
          AND resource_id = $2
          AND status IN ('queued', 'running', 'retry_wait')
      `, [now, authorization.id]);
    }
    await transaction.query(`
      INSERT INTO status_history (
        id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
      ) VALUES ($1, 'order', $2, $3, 'cancelled', $4, $5, $6)
    `, [`status-history-${randomUUID()}`, order.id, order.status,
      input.reason || "customer_withdrawal", input.customerUserId, now]);
    await transaction.query(`
      INSERT INTO audit_logs (
        id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
      ) VALUES ($1, $2, 'customer_cancel_order', 'order', $3, $4::jsonb, $5)
    `, [`audit-log-${randomUUID()}`, input.customerUserId, order.id,
      JSON.stringify({ reason: input.reason || "customer_withdrawal" }), now]);

    const result = { orderId: order.id, status: "cancelled", idempotent: false };
    if (input.idempotencyKey) {
      await transaction.query(`
        INSERT INTO order_action_idempotency (
          idempotency_key, order_id, action_type, actor_user_id, result_json, created_at
        ) VALUES ($1, $2, 'customer_cancel_order', $3, $4::jsonb, $5)
      `, [input.idempotencyKey, order.id, input.customerUserId, JSON.stringify(result), now]);
    }
    return result;
  });
}

function evaluateCancellation(order, input, now) {
  if (!order) return { error: "order_not_found" };
  if (order.customer_user_id !== input.customerUserId) return { error: "order_access_denied" };
  if (order.status === "cancelled") {
    return { eligible: true, alreadyCancelled: true, paymentStatus: order.payment_status };
  }
  if (["captured", "refunded"].includes(order.payment_status)) {
    return { error: "captured_order_cannot_be_cancelled" };
  }
  if (!["pending", "authorized", "authorization_voided", "failed"].includes(order.payment_status)) {
    return { error: "order_not_cancellable", paymentStatus: order.payment_status };
  }
  const deadline = Date.parse(toIsoString(order.deadline_at));
  const lockMinutes = Number(order.withdrawal_lock_minutes || 30);
  if (!Number.isNaN(deadline) && deadline - Date.parse(now) <= lockMinutes * 60_000) {
    return {
      error: "order_locked_by_deadline",
      deadlineAt: toIsoString(order.deadline_at),
      lockMinutes,
    };
  }
  return { eligible: true, paymentStatus: order.payment_status };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  cancelPostgresCustomerOrder,
  createCustomerOrderCancelRepository,
  evaluateCancellation,
  getPostgresCancellationEligibility,
  resolveCustomerOrderCancelRuntime,
};
