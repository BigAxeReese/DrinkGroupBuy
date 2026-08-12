"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const {
  pricePostgresOrderItems,
  validatePostgresOrderDiscount,
} = require("./customerOrderWriteRepository");

function resolveOrderRevisionRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.ORDER_REVISION_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported ORDER_REVISION_RUNTIME: ${runtime}`);
}

const GATEWAY_METHODS = ["createRevision", "getRevisionById", "getRevisionPaymentContext"];

function createOrderRevisionRepository(input = {}) {
  const runtime = resolveOrderRevisionRuntime(input);
  if (runtime === "sqlite") {
    const gateway = input.sqliteGateway || {};
    for (const name of GATEWAY_METHODS) {
      if (typeof gateway[name] !== "function") {
        throw new Error(`${name} is required when ORDER_REVISION_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      createRevision: async (value) => gateway.createRevision(value),
      getRevisionById: async (value) => gateway.getRevisionById(value),
      getRevisionPaymentContext: async (value) => gateway.getRevisionPaymentContext(value),
      close: async () => {},
    };
  }

  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    createRevision: (value) => createPostgresOrderRevision(database, value),
    getRevisionById: (value) => getPostgresOrderRevisionById(database, value.orderRevisionId),
    getRevisionPaymentContext: (value) => getPostgresOrderRevisionPaymentContext(database, value.orderRevisionId),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function createPostgresOrderRevision(database, input) {
  const now = input.now || new Date().toISOString();
  const revisionId = `order-revision-${randomUUID()}`;

  return database.transaction(async (transaction) => {
    const orderResult = await transaction.query(`
      SELECT
        orders.id, orders.activity_id, orders.customer_user_id, orders.status,
        orders.payment_status, orders.authorization_status, orders.total_cups, orders.original_amount,
        activity.status AS activity_status, activity.store_id, activity.maximum_cups,
        activity.deadline_at, activity.withdrawal_lock_minutes
      FROM orders
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      WHERE orders.id = $1
      FOR UPDATE OF orders, activity
    `, [input.orderId]);
    const order = orderResult.rows[0];
    if (!order) return { error: "order_not_found" };
    // Locking both orders and activity here (matching the confirm/cancel repositories'
    // lock-ordering convention of activity-then-order) means a concurrent confirm/cancel/
    // capture on this order can't race the checks below -- those operations all lock+update
    // the orders row too, so this transitively protects the authorization read further down
    // without needing a separate lock on payment_authorizations.

    if (order.customer_user_id !== input.customerUserId) return { error: "order_access_denied" };
    if (
      order.status !== "submitted"
      || order.payment_status !== "authorized"
      || order.authorization_status !== "authorized"
    ) {
      return {
        error: "order_not_revisable",
        status: order.status,
        paymentStatus: order.payment_status,
        authorizationStatus: order.authorization_status,
      };
    }
    if (!["recruiting", "confirmed"].includes(order.activity_status)) {
      return { error: "activity_not_joinable", status: order.activity_status };
    }

    const pricedItems = await pricePostgresOrderItems(transaction, order.store_id, input.items);
    if (pricedItems.error) return pricedItems;
    const items = pricedItems.items;
    const totalCups = items.reduce((sum, item) => sum + item.quantity, 0);
    const originalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    if (pricedItems.priceChanged) {
      return { error: "order_price_changed", originalAmount, items: toAuthoritativeOrderItems(items) };
    }

    const discountValidation = await validatePostgresOrderDiscount(transaction, order.activity_id, items);
    if (!discountValidation.valid) return discountValidation;

    const lockMinutes = Number(order.withdrawal_lock_minutes || 30);
    const deadlineTime = Date.parse(order.deadline_at);
    const nowTime = Date.parse(now);
    if (!Number.isNaN(deadlineTime) && deadlineTime - nowTime <= lockMinutes * 60 * 1000) {
      return { error: "order_locked_by_deadline", deadlineAt: toIsoString(order.deadline_at), lockMinutes };
    }

    const pendingRevisionResult = await transaction.query(`
      SELECT id FROM order_revisions
      WHERE order_id = $1 AND status = 'pending_authorization'
      ORDER BY created_at DESC LIMIT 1
    `, [input.orderId]);
    if (pendingRevisionResult.rows[0]) {
      return { error: "order_revision_already_pending", orderRevisionId: pendingRevisionResult.rows[0].id };
    }

    const originalAuthorizationResult = await transaction.query(`
      SELECT id FROM payment_authorizations
      WHERE order_id = $1 AND status = 'authorized'
      ORDER BY authorized_at DESC, created_at DESC LIMIT 1
    `, [input.orderId]);
    const originalAuthorization = originalAuthorizationResult.rows[0];
    if (!originalAuthorization) return { error: "order_authorization_missing" };

    const authorizedCupsResult = await transaction.query(`
      SELECT COALESCE(SUM(total_cups), 0)::integer AS cups
      FROM orders
      WHERE activity_id = $1 AND id != $2
        AND payment_status IN ('authorized', 'captured') AND status != 'cancelled'
    `, [order.activity_id, input.orderId]);
    const authorizedCups = Number(authorizedCupsResult.rows[0]?.cups || 0);
    if (order.maximum_cups && authorizedCups + totalCups > Number(order.maximum_cups)) {
      return {
        error: "capacity_exceeded",
        maximumCups: Number(order.maximum_cups),
        authorizedCups,
        requestedCups: totalCups,
      };
    }

    await transaction.query(`
      INSERT INTO order_revisions (
        id, order_id, status, original_payment_authorization_id, fallback_purchase_preference,
        previous_total_cups, previous_original_amount, total_cups, original_amount,
        created_at, updated_at
      ) VALUES ($1, $2, 'pending_authorization', $3, $4, $5, $6, $7, $8, $9, $9)
    `, [
      revisionId, input.orderId, originalAuthorization.id,
      input.fallbackPurchasePreference || "decline_original_price",
      order.total_cups, order.original_amount, totalCups, originalAmount, now,
    ]);
    await insertOrderRevisionItems(transaction, revisionId, items);
    await transaction.query(`
      INSERT INTO audit_logs (
        id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
      ) VALUES ($1, $2, 'customer_create_order_revision', 'order', $3, $4::jsonb, $5)
    `, [
      `audit-log-${randomUUID()}`, input.customerUserId, input.orderId,
      JSON.stringify({
        orderRevisionId: revisionId,
        previousTotalCups: order.total_cups,
        requestedTotalCups: totalCups,
        previousOriginalAmount: order.original_amount,
        requestedOriginalAmount: originalAmount,
      }),
      now,
    ]);

    return { revision: await getPostgresOrderRevisionById(transaction, revisionId) };
  });
}

async function insertOrderRevisionItems(database, revisionId, items) {
  for (const item of items) {
    const revisionItemId = `order-revision-item-${randomUUID()}`;
    await database.query(`
      INSERT INTO order_revision_items (
        id, order_revision_id, menu_item_id, item_name_snapshot, quantity, unit_price_snapshot, subtotal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [revisionItemId, revisionId, item.menuItemId, item.itemName, item.quantity, item.unitPrice, item.subtotal]);

    for (const [index, customization] of item.customizations.entries()) {
      await database.query(`
        INSERT INTO order_revision_item_customizations (
          id, order_revision_item_id, customization_option_id, option_type,
          label_snapshot, price_delta_snapshot, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        `order-revision-item-customization-${randomUUID()}`, revisionItemId, customization.optionId,
        customization.optionType, customization.label, customization.priceDelta, index,
      ]);
    }
  }
}

async function getPostgresOrderRevisionById(database, orderRevisionId) {
  const revisionResult = await database.query("SELECT * FROM order_revisions WHERE id = $1", [orderRevisionId]);
  const revision = revisionResult.rows[0];
  if (!revision) return null;

  const itemsResult = await database.query(`
    SELECT * FROM order_revision_items WHERE order_revision_id = $1 ORDER BY id ASC
  `, [orderRevisionId]);
  const items = [];
  for (const item of itemsResult.rows) {
    const customizationsResult = await database.query(`
      SELECT * FROM order_revision_item_customizations
      WHERE order_revision_item_id = $1 ORDER BY sort_order ASC
    `, [item.id]);
    items.push({ ...item, customizations: customizationsResult.rows });
  }

  return mapOrderRevision(revision, items);
}

async function getPostgresOrderRevisionPaymentContext(database, orderRevisionId) {
  const result = await database.query(`
    SELECT
      revision.id, revision.order_id, revision.status, revision.total_cups, revision.original_amount,
      orders.customer_user_id, orders.payment_status, orders.authorization_status
    FROM order_revisions revision
    JOIN orders ON orders.id = revision.order_id
    WHERE revision.id = $1
  `, [orderRevisionId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    totalCups: Number(row.total_cups),
    originalAmount: Number(row.original_amount),
    customerUserId: row.customer_user_id,
    paymentStatus: row.payment_status,
    authorizationStatus: row.authorization_status,
  };
}

function mapOrderRevision(row, items = []) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    originalPaymentAuthorizationId: row.original_payment_authorization_id,
    replacementPaymentAuthorizationId: row.replacement_payment_authorization_id,
    fallbackPurchasePreference: row.fallback_purchase_preference,
    previousTotalCups: Number(row.previous_total_cups),
    previousOriginalAmount: Number(row.previous_original_amount),
    totalCups: Number(row.total_cups),
    originalAmount: Number(row.original_amount),
    failureReason: row.failure_reason,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    appliedAt: toIsoString(row.applied_at),
    cancelledAt: toIsoString(row.cancelled_at),
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      itemName: item.item_name_snapshot,
      quantity: item.quantity,
      unitPrice: item.unit_price_snapshot,
      subtotal: item.subtotal,
      customizations: (item.customizations || []).map((customization) => ({
        id: customization.id,
        customizationOptionId: customization.customization_option_id,
        optionType: customization.option_type,
        label: customization.label_snapshot,
        priceDelta: customization.price_delta_snapshot,
      })),
    })),
  };
}

function toAuthoritativeOrderItems(items) {
  return items.map((item) => ({
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    customizationOptionIds: item.customizations.map((customization) => customization.optionId),
    customizations: item.customizations,
  }));
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createOrderRevisionRepository,
  createPostgresOrderRevision,
  getPostgresOrderRevisionById,
  getPostgresOrderRevisionPaymentContext,
  mapOrderRevision,
  resolveOrderRevisionRuntime,
};
