"use strict";

const { createRuntimeDatabaseAdapter } = require("..");

function resolveCustomerOrderReadRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.CUSTOMER_ORDER_READ_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported CUSTOMER_ORDER_READ_RUNTIME: ${runtime}`);
}

function createCustomerOrderReadRepository(input = {}) {
  const runtime = resolveCustomerOrderReadRuntime(input);
  if (runtime === "sqlite") {
    const readers = input.sqliteReaders || {};
    for (const name of [
      "getOrderDetail",
      "getOrderPaymentContext",
      "listCustomerOrders",
      "listMerchantStoreOrders",
    ]) {
      if (typeof readers[name] !== "function") {
        throw new Error(`${name} sqliteReader is required when CUSTOMER_ORDER_READ_RUNTIME=sqlite`);
      }
    }
    return {
      kind: "sqlite",
      getOrderDetail: async (orderId, query) => readers.getOrderDetail(orderId, query),
      getOrderPaymentContext: async (orderId) => readers.getOrderPaymentContext(orderId),
      listCustomerOrders: async (customerUserId, query) => (
        readers.listCustomerOrders(customerUserId, query)
      ),
      listMerchantStoreOrders: async (storeId, query) => (
        readers.listMerchantStoreOrders(storeId, query)
      ),
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
    getOrderDetail: (orderId) => getPostgresOrderDetail(database, orderId),
    getOrderPaymentContext: (orderId) => getPostgresOrderPaymentContext(database, orderId),
    listCustomerOrders: (customerUserId, query) => listPostgresOrders(database, {
      ...query,
      customerUserId,
      role: "customer",
    }),
    listMerchantStoreOrders: (storeId, query) => listPostgresOrders(database, {
      ...query,
      storeId,
      role: "merchant",
    }),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
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

async function getPostgresOrderDetail(database, orderId) {
  const [orderResult, itemsResult, authorizationsResult, refundsResult] = await Promise.all([
    database.query(`
      SELECT *
      FROM orders
      WHERE id = $1
    `, [orderId]),
    database.query(`
      SELECT
        item.id,
        item.menu_item_id,
        item.item_name_snapshot,
        item.quantity,
        item.unit_price_snapshot,
        item.subtotal,
        customization.id AS customization_id,
        customization.customization_option_id,
        customization.option_type,
        customization.label_snapshot,
        customization.price_delta_snapshot,
        customization.sort_order
      FROM order_items item
      LEFT JOIN order_item_customizations customization
        ON customization.order_item_id = item.id
      WHERE item.order_id = $1
      ORDER BY item.id, customization.sort_order, customization.id
    `, [orderId]),
    database.query(`
      SELECT *
      FROM payment_authorizations
      WHERE order_id = $1
        AND provider IN ('line_pay', 'mock_line_pay')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `, [orderId]),
    database.query(`
      SELECT *
      FROM payment_refunds
      WHERE order_id = $1
      ORDER BY created_at DESC, id DESC
    `, [orderId]),
  ]);
  const orderRow = orderResult.rows[0];
  if (!orderRow) return null;

  const latestAuthorization = authorizationsResult.rows[0]
    ? mapPaymentAuthorization(authorizationsResult.rows[0])
    : null;
  const latestCapture = latestAuthorization
    ? await getLatestPostgresCapture(database, latestAuthorization.id)
    : null;
  const refunds = refundsResult.rows.map(mapPaymentRefund);
  return {
    ...mapOrder(orderRow, groupOrderItems(itemsResult.rows)),
    latestLinePayAuthorization: latestAuthorization,
    latestPaymentCapture: latestCapture,
    paymentRefunds: refunds,
    refundedAmount: refunds
      .filter((refund) => refund.status === "refunded")
      .reduce((sum, refund) => sum + refund.refundAmount, 0),
    pendingRevision: null,
    manualRepayment: null,
  };
}

async function getLatestPostgresCapture(database, authorizationId) {
  const result = await database.query(`
    SELECT *
    FROM payment_captures
    WHERE payment_authorization_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [authorizationId]);
  return result.rows[0] ? mapPaymentCapture(result.rows[0]) : null;
}

async function listPostgresOrders(database, input = {}) {
  const scope = input.scope === "history" ? "history" : "active";
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
  const cursor = decodeOrderListCursor(input.cursor);
  const now = input.now || new Date().toISOString();
  const rowsResult = await database.query(`
    SELECT
      order_record.id,
      order_record.submitted_at,
      activity.id AS activity_id,
      activity.title AS activity_title,
      activity.status AS activity_status,
      activity.deadline_at,
      activity.pickup_start_at,
      activity.pickup_end_at,
      activity.withdrawal_lock_minutes,
      store.id AS store_id,
      store.name AS store_name,
      store.address AS store_address,
      credential.id AS pickup_credential_id,
      CASE
        WHEN credential.redeemed_at IS NOT NULL THEN 'redeemed'
        WHEN credential.expired_at IS NOT NULL THEN 'expired'
        WHEN credential.id IS NOT NULL THEN 'active'
        ELSE NULL
      END AS pickup_credential_status,
      credential.expires_at AS pickup_credential_expires_at
    FROM orders order_record
    JOIN group_buy_activities activity ON activity.id = order_record.activity_id
    JOIN stores store ON store.id = activity.store_id
    LEFT JOIN pickup_credentials credential ON credential.order_id = order_record.id
    WHERE ($1::text IS NULL OR order_record.customer_user_id = $1)
      AND ($2::text IS NULL OR activity.store_id = $2)
      AND ($3::text IS NULL OR order_record.activity_id = $3)
      AND (
        $4::timestamptz IS NULL
        OR order_record.submitted_at < $4
        OR (order_record.submitted_at = $4 AND order_record.id < $5)
      )
    ORDER BY order_record.submitted_at DESC, order_record.id DESC
  `, [
    input.customerUserId || null,
    input.storeId || null,
    input.activityId || null,
    cursor?.submittedAt || null,
    cursor?.id || null,
  ]);

  const hydrated = await Promise.all(rowsResult.rows.map(async (row) => {
    const order = await getPostgresOrderDetail(database, row.id);
    const context = {
      activity: {
        id: row.activity_id,
        title: row.activity_title,
        status: row.activity_status,
        deadlineAt: toIsoString(row.deadline_at),
        pickupStartAt: toIsoString(row.pickup_start_at),
        pickupEndAt: toIsoString(row.pickup_end_at),
        withdrawalLockMinutes: row.withdrawal_lock_minutes,
        storeId: row.store_id,
      },
      store: {
        id: row.store_id,
        name: row.store_name,
        address: row.store_address,
      },
      customer: input.role === "merchant" ? { alias: "匿名顧客" } : undefined,
      pickupCredential: row.pickup_credential_id ? {
        exists: true,
        status: row.pickup_credential_status,
        expiresAt: toIsoString(row.pickup_credential_expires_at),
      } : { exists: false, status: null, expiresAt: null },
    };
    const lifecycleBucket = getOrderLifecycleBucket(order, context, now);
    return {
      ...order,
      ...context,
      lifecycleBucket,
      availableActions: getPostgresAvailableActions(order, context, input.role, lifecycleBucket),
    };
  }));
  const matching = hydrated.filter((order) => order.lifecycleBucket === scope);
  const page = matching.slice(0, limit);
  return {
    orders: page,
    nextCursor: matching.length > limit && page.length
      ? encodeOrderListCursor(page[page.length - 1])
      : null,
  };
}

function groupOrderItems(rows) {
  const items = new Map();
  for (const row of rows) {
    let item = items.get(row.id);
    if (!item) {
      item = {
        id: row.id,
        menu_item_id: row.menu_item_id,
        item_name_snapshot: row.item_name_snapshot,
        quantity: row.quantity,
        unit_price_snapshot: row.unit_price_snapshot,
        subtotal: row.subtotal,
        customizations: [],
      };
      items.set(row.id, item);
    }
    if (row.customization_id) {
      item.customizations.push({
        id: row.customization_id,
        customization_option_id: row.customization_option_id,
        option_type: row.option_type,
        label_snapshot: row.label_snapshot,
        price_delta_snapshot: row.price_delta_snapshot,
      });
    }
  }
  return [...items.values()];
}

function mapOrder(row, items) {
  return {
    id: row.id,
    activityId: row.activity_id,
    customerUserId: row.customer_user_id,
    status: row.status,
    fallbackPurchasePreference: row.fallback_purchase_preference,
    totalCups: row.total_cups,
    originalAmount: row.original_amount,
    finalAmount: row.final_amount,
    paymentStatus: row.payment_status,
    authorizationStatus: row.authorization_status,
    merchantAcceptanceStatus: row.merchant_acceptance_status,
    pickupStatus: row.pickup_status,
    submittedAt: toIsoString(row.submitted_at),
    updatedAt: toIsoString(row.updated_at),
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      itemName: item.item_name_snapshot,
      quantity: item.quantity,
      unitPrice: item.unit_price_snapshot,
      subtotal: item.subtotal,
      customizations: item.customizations.map((customization) => ({
        id: customization.id,
        customizationOptionId: customization.customization_option_id,
        optionType: customization.option_type,
        label: customization.label_snapshot,
        priceDelta: customization.price_delta_snapshot,
      })),
    })),
  };
}

function mapOrderPaymentContext(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    customerUserId: row.customer_user_id,
    totalCups: row.total_cups,
    originalAmount: row.original_amount,
    paymentStatus: row.payment_status,
    authorizationStatus: row.authorization_status,
  };
}

function mapPaymentAuthorization(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderRevisionId: null,
    provider: row.provider,
    paymentFlow: row.payment_flow || "authorization",
    status: row.status,
    originalAmount: row.original_amount,
    authorizedAmount: row.authorized_amount,
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
    finalAmount: row.final_amount,
    captureAmount: row.capture_amount,
    releasedAmount: row.released_amount,
    providerCaptureId: row.provider_capture_id,
    capturedAt: toIsoString(row.captured_at),
    failureReason: row.failure_reason,
    attemptNumber: row.attempt_number,
    retryable: Boolean(row.retryable),
    nextRetryAt: toIsoString(row.next_retry_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapPaymentRefund(row) {
  return {
    id: row.id,
    paymentCaptureId: row.payment_capture_id,
    paymentAuthorizationId: row.payment_authorization_id,
    orderId: row.order_id,
    provider: row.provider,
    status: row.status,
    refundAmount: row.refund_amount,
    providerRefundId: row.provider_refund_id,
    idempotencyKey: row.idempotency_key,
    refundedAt: toIsoString(row.refunded_at),
    failureReason: row.failure_reason,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function getOrderLifecycleBucket(order, context, now) {
  if (["cancelled", "completed"].includes(order.status)) return "history";
  if (["picked_up", "cancelled", "expired"].includes(order.pickupStatus)) return "history";
  if (order.paymentStatus === "failed") {
    const cutoff = Date.parse(context.activity.pickupStartAt) - 15 * 60 * 1000;
    if (!Number.isNaN(cutoff) && Date.parse(now) >= cutoff) return "history";
  }
  return "active";
}

function getPostgresAvailableActions(order, context, role, lifecycleBucket) {
  if (lifecycleBucket === "history") return [];
  if (role === "customer" && order.status === "submitted" && order.paymentStatus === "pending") {
    return ["pay"];
  }
  return [];
}

function encodeOrderListCursor(order) {
  return Buffer.from(JSON.stringify({
    submittedAt: order.submittedAt,
    id: order.id,
  })).toString("base64url");
}

function decodeOrderListCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    return parsed?.submittedAt && parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createCustomerOrderReadRepository,
  getPostgresOrderDetail,
  getPostgresOrderPaymentContext,
  listPostgresOrders,
  resolveCustomerOrderReadRuntime,
};
