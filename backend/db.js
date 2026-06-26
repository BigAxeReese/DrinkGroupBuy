const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");

function openDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function listGroupBuyActivities() {
  const database = openDatabase();
  try {
    const rows = database.prepare(`
      SELECT
        activity.id,
        activity.store_id,
        activity.created_by_user_id,
        activity.title,
        activity.status,
        activity.start_at,
        activity.deadline_at,
        activity.pickup_start_at,
        activity.pickup_end_at,
        activity.maximum_cups,
        activity.withdrawal_lock_minutes,
        activity.cancellation_reason,
        store.name AS store_name,
        store.address AS store_address,
        store.latitude,
        store.longitude
      FROM group_buy_activities activity
      JOIN stores store ON store.id = activity.store_id
      ORDER BY activity.created_at DESC
    `).all();

    const tiers = database.prepare(`
      SELECT id, activity_id, target_cups, discount_amount, sort_order
      FROM promotion_tiers
      ORDER BY target_cups ASC
    `).all();

    return rows.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      createdByUserId: row.created_by_user_id,
      title: row.title,
      status: row.status,
      startAt: row.start_at,
      deadlineAt: row.deadline_at,
      pickupStartAt: row.pickup_start_at,
      pickupEndAt: row.pickup_end_at,
      maximumCups: row.maximum_cups,
      withdrawalLockMinutes: row.withdrawal_lock_minutes,
      cancellationReason: row.cancellation_reason,
      store: {
        name: row.store_name,
        address: row.store_address,
        latitude: row.latitude,
        longitude: row.longitude
      },
      tiers: tiers
        .filter((tier) => tier.activity_id === row.id)
        .map((tier) => ({
          id: tier.id,
          targetCups: tier.target_cups,
          discountAmount: tier.discount_amount,
          sortOrder: tier.sort_order
        }))
    }));
  } finally {
    database.close();
  }
}

function createGroupBuyActivity(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const activityId = `activity-${randomUUID()}`;
  const tiers = normalizeTiers(input.tiers);
  const idempotencyKey = input.idempotencyKey || null;

  try {
    if (idempotencyKey) {
      const existingLog = database.prepare(`
        SELECT resource_id
        FROM audit_logs
        WHERE action_type = 'merchant_create_group_buy_activity'
          AND json_extract(metadata_json, '$.idempotencyKey') = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(idempotencyKey);

      if (existingLog?.resource_id) {
        return listGroupBuyActivities().find((activity) => activity.id === existingLog.resource_id);
      }
    }

    database.exec("BEGIN;");
    database.prepare(`
      INSERT INTO group_buy_activities (
        id,
        store_id,
        created_by_user_id,
        title,
        status,
        start_at,
        deadline_at,
        pickup_start_at,
        pickup_end_at,
        maximum_cups,
        withdrawal_lock_minutes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'recruiting', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activityId,
      input.storeId,
      input.createdByUserId,
      input.title,
      input.startAt,
      input.deadlineAt,
      input.pickupStartAt,
      input.pickupEndAt,
      tiers[tiers.length - 1].targetCups,
      input.withdrawalLockMinutes ?? 30,
      now,
      now
    );

    const insertTier = database.prepare(`
      INSERT INTO promotion_tiers (
        id,
        activity_id,
        target_cups,
        discount_amount,
        sort_order
      ) VALUES (?, ?, ?, ?, ?)
    `);

    tiers.forEach((tier, index) => {
      insertTier.run(
        `tier-${randomUUID()}`,
        activityId,
        tier.targetCups,
        tier.discountAmount,
        index
      );
    });

    if (input.notice) {
      database.prepare(`
        INSERT INTO activity_notices (id, activity_id, content, sort_order)
        VALUES (?, ?, ?, 0)
      `).run(`notice-${randomUUID()}`, activityId, input.notice);
    }

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, 'merchant_create_group_buy_activity', 'activity', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      input.createdByUserId,
      activityId,
      JSON.stringify({ idempotencyKey }),
      now
    );

    database.exec("COMMIT;");
    return listGroupBuyActivities().find((activity) => activity.id === activityId);
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
}

function cancelGroupBuyActivity(activityId, input = {}) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const reason = input.reason || "Deleted by admin prototype action.";
  const requestedActorUserId = input.actorUserId || null;
  let transactionStarted = false;

  try {
    const activity = database.prepare(`
      SELECT id, status
      FROM group_buy_activities
      WHERE id = ?
    `).get(activityId);

    if (!activity) {
      return null;
    }

    if (activity.status === "cancelled") {
      return listGroupBuyActivities().find((item) => item.id === activityId);
    }

    const actor = requestedActorUserId
      ? database.prepare("SELECT id FROM users WHERE id = ?").get(requestedActorUserId)
      : null;
    const actorUserId = actor?.id ?? null;

    database.exec("BEGIN;");
    transactionStarted = true;
    database.prepare(`
      UPDATE group_buy_activities
      SET status = 'cancelled',
          cancellation_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(reason, now, activityId);

    database.prepare(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES (?, 'activity', ?, ?, 'cancelled', ?, ?, ?)
    `).run(
      `status-history-${randomUUID()}`,
      activityId,
      activity.status,
      reason,
      actorUserId,
      now
    );

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, 'admin_cancel_group_buy_activity', 'activity', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      actorUserId,
      activityId,
      JSON.stringify({ reason }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;
    return listGroupBuyActivities().find((item) => item.id === activityId);
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function createOrder(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const orderId = `order-${randomUUID()}`;
  const items = normalizeOrderItems(input.items);
  const totalCups = items.reduce((sum, item) => sum + item.quantity, 0);
  const originalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  let transactionStarted = false;

  try {
    const activity = database.prepare(`
      SELECT id, status, maximum_cups
      FROM group_buy_activities
      WHERE id = ?
    `).get(input.activityId);
    if (!activity) {
      return { error: "activity_not_found" };
    }
    if (!["recruiting", "confirmed"].includes(activity.status)) {
      return { error: "activity_not_joinable", status: activity.status };
    }

    const user = database.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
        AND status = 'active'
    `).get(input.customerUserId);
    if (!user) {
      return { error: "customer_not_found" };
    }

    const authorizedCups = database.prepare(`
      SELECT COALESCE(SUM(total_cups), 0) AS cups
      FROM orders
      WHERE activity_id = ?
        AND payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
    `).get(input.activityId).cups;

    if (activity.maximum_cups && authorizedCups + totalCups > activity.maximum_cups) {
      return {
        error: "capacity_exceeded",
        maximumCups: activity.maximum_cups,
        authorizedCups,
        requestedCups: totalCups
      };
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      INSERT INTO orders (
        id,
        activity_id,
        customer_user_id,
        status,
        fallback_purchase_preference,
        total_cups,
        original_amount,
        payment_status,
        authorization_status,
        merchant_acceptance_status,
        pickup_status,
        submitted_at,
        updated_at
      ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, 'pending', 'pending', 'pending', 'not_ready', ?, ?)
    `).run(
      orderId,
      input.activityId,
      input.customerUserId,
      input.fallbackPurchasePreference || "decline_original_price",
      totalCups,
      originalAmount,
      now,
      now
    );

    const insertOrderItem = database.prepare(`
      INSERT INTO order_items (
        id,
        order_id,
        menu_item_id,
        item_name_snapshot,
        quantity,
        unit_price_snapshot,
        subtotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCustomization = database.prepare(`
      INSERT INTO order_item_customizations (
        id,
        order_item_id,
        customization_option_id,
        option_type,
        label_snapshot,
        price_delta_snapshot,
        sort_order
      ) VALUES (?, ?, NULL, ?, ?, 0, ?)
    `);

    items.forEach((item) => {
      const orderItemId = `order-item-${randomUUID()}`;
      const menuItem = item.menuItemId
        ? database.prepare("SELECT id FROM menu_items WHERE id = ?").get(item.menuItemId)
        : null;

      insertOrderItem.run(
        orderItemId,
        orderId,
        menuItem?.id ?? null,
        item.itemName,
        item.quantity,
        item.unitPrice,
        item.subtotal
      );

      item.customizations.forEach((customization, index) => {
        insertCustomization.run(
          `order-item-customization-${randomUUID()}`,
          orderItemId,
          customization.optionType,
          customization.label,
          index
        );
      });
    });

    database.prepare(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES (?, 'order', ?, NULL, 'submitted', 'customer_submit_cart', ?, ?)
    `).run(
      `status-history-${randomUUID()}`,
      orderId,
      input.customerUserId,
      now
    );

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, 'customer_create_order', 'order', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      input.customerUserId,
      orderId,
      JSON.stringify({
        activityId: input.activityId,
        totalCups,
        originalAmount
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return { order: getOrderById(orderId) };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function getOrderPaymentContext(orderId) {
  const database = openDatabase();
  try {
    const order = database.prepare(`
      SELECT
        id,
        activity_id,
        customer_user_id,
        total_cups,
        original_amount,
        payment_status,
        authorization_status
      FROM orders
      WHERE id = ?
    `).get(orderId);

    return order ? mapOrderPaymentContext(order) : null;
  } finally {
    database.close();
  }
}

function getLatestLinePayAuthorizationForOrder(orderId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE order_id = ?
        AND provider = 'line_pay'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(orderId);

    return row ? mapPaymentAuthorization(row) : null;
  } finally {
    database.close();
  }
}

function createPendingLinePayAuthorization(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const authorizationId = `payment-authorization-${randomUUID()}`;
  let transactionStarted = false;

  try {
    const order = database.prepare(`
      SELECT id, original_amount, payment_status
      FROM orders
      WHERE id = ?
    `).get(input.orderId);

    if (!order) {
      return null;
    }

    const existingAuthorization = input.providerTransactionId
      ? database.prepare(`
          SELECT *
          FROM payment_authorizations
          WHERE provider = 'line_pay'
            AND provider_authorization_id = ?
          LIMIT 1
        `).get(input.providerTransactionId)
      : null;

    if (existingAuthorization) {
      return mapPaymentAuthorization(existingAuthorization);
    }

    database.exec("BEGIN;");
    transactionStarted = true;
    database.prepare(`
      INSERT INTO payment_authorizations (
        id,
        order_id,
        provider,
        status,
        original_amount,
        authorized_amount,
        provider_authorization_id,
        created_at,
        updated_at
      ) VALUES (?, ?, 'line_pay', 'pending', ?, 0, ?, ?, ?)
    `).run(
      authorizationId,
      input.orderId,
      input.amount,
      input.providerTransactionId,
      now,
      now
    );

    database.prepare(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES (?, 'payment_authorization', ?, NULL, 'pending', ?, NULL, ?)
    `).run(
      `status-history-${randomUUID()}`,
      authorizationId,
      "line_pay_request_created",
      now
    );

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, NULL, 'line_pay_request_authorization', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorizationId,
      JSON.stringify({
        orderId: input.orderId,
        providerTransactionId: input.providerTransactionId
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return getPaymentAuthorizationById(authorizationId);
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function authorizeLinePayPaymentInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    if (authorization.status === "authorized") {
      return mapPaymentAuthorization(authorization);
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      UPDATE payment_authorizations
      SET status = 'authorized',
          authorized_amount = ?,
          authorized_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.amount,
      now,
      now,
      authorization.id
    );

    database.prepare(`
      UPDATE orders
      SET payment_status = 'authorized',
          authorization_status = 'authorized',
          updated_at = ?
      WHERE id = ?
    `).run(now, authorization.order_id);

    database.prepare(`
      INSERT INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, 'line_pay', 'authorization', ?, 'confirm_success', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.id,
      input.providerTransactionId ? `line_pay_confirm:${input.providerTransactionId}` : null,
      JSON.stringify(input.providerPayload || {}),
      now,
      now
    );

    database.prepare(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES (?, 'payment_authorization', ?, ?, 'authorized', 'line_pay_confirm_success', NULL, ?)
    `).run(
      `status-history-${randomUUID()}`,
      authorization.id,
      authorization.status,
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return getPaymentAuthorizationById(authorization.id);
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function normalizeTiers(tiers) {
  const normalized = Array.isArray(tiers)
    ? tiers
        .map((tier) => ({
          targetCups: Number(tier.targetCups ?? tier.cups),
          discountAmount: Number(tier.discountAmount)
        }))
        .filter((tier) => Number.isFinite(tier.targetCups)
          && Number.isFinite(tier.discountAmount)
          && tier.targetCups > 0
          && tier.discountAmount >= 0)
        .sort((left, right) => left.targetCups - right.targetCups)
    : [];

  if (normalized.length === 0) {
    return [{ targetCups: 20, discountAmount: 200 }];
  }

  return normalized;
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  return items.map((item, index) => {
    const quantity = Number(item.quantity);
    const subtotal = Number(item.subtotal);
    const unitPrice = Number(item.unitPrice ?? item.price ?? (quantity > 0 ? subtotal / quantity : NaN));
    const itemName = String(item.itemName ?? item.name ?? "").trim();

    if (!itemName) {
      throw new Error(`items[${index}].itemName is required`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`items[${index}].quantity must be a positive integer`);
    }
    if (!Number.isInteger(subtotal) || subtotal < 0) {
      throw new Error(`items[${index}].subtotal must be a non-negative integer`);
    }
    if (!Number.isInteger(unitPrice) || unitPrice < 0) {
      throw new Error(`items[${index}].unitPrice must be a non-negative integer`);
    }

    return {
      menuItemId: item.menuItemId ?? item.drinkId ?? null,
      itemName,
      quantity,
      unitPrice,
      subtotal,
      customizations: normalizeItemCustomizations(item)
    };
  });
}

function normalizeItemCustomizations(item) {
  const customizations = [];
  if (item.size) {
    customizations.push({ optionType: "size", label: item.size });
  }
  if (item.sweetness) {
    customizations.push({ optionType: "sweetness", label: item.sweetness });
  }
  if (item.ice) {
    customizations.push({ optionType: "ice", label: item.ice });
  }
  const toppings = Array.isArray(item.toppings) ? item.toppings : [];
  toppings.forEach((topping) => {
    customizations.push({ optionType: "topping", label: String(topping) });
  });

  return customizations;
}

function getOrderById(orderId) {
  const database = openDatabase();
  try {
    const order = database.prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
    `).get(orderId);
    if (!order) return null;

    const items = database.prepare(`
      SELECT *
      FROM order_items
      WHERE order_id = ?
      ORDER BY rowid ASC
    `).all(orderId);
    const customizations = database.prepare(`
      SELECT *
      FROM order_item_customizations
      WHERE order_item_id = ?
      ORDER BY sort_order ASC
    `);

    return mapOrder(order, items.map((item) => ({
      ...item,
      customizations: customizations.all(item.id)
    })));
  } finally {
    database.close();
  }
}

function getPaymentAuthorizationById(authorizationId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE id = ?
    `).get(authorizationId);
    return row ? mapPaymentAuthorization(row) : null;
  } finally {
    database.close();
  }
}

function findLinePayAuthorization(database, input) {
  if (input.providerTransactionId) {
    const byProviderTransaction = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = 'line_pay'
        AND provider_authorization_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(input.providerTransactionId);

    if (byProviderTransaction) {
      return byProviderTransaction;
    }
  }

  if (input.orderId) {
    return database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = 'line_pay'
        AND order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(input.orderId);
  }

  return null;
}

function mapOrderPaymentContext(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    customerUserId: row.customer_user_id,
    totalCups: row.total_cups,
    originalAmount: row.original_amount,
    paymentStatus: row.payment_status,
    authorizationStatus: row.authorization_status
  };
}

function mapPaymentAuthorization(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    status: row.status,
    originalAmount: row.original_amount,
    authorizedAmount: row.authorized_amount,
    providerAuthorizationId: row.provider_authorization_id,
    expiresAt: row.expires_at,
    authorizedAt: row.authorized_at,
    voidedAt: row.voided_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrder(row, items = []) {
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
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id,
      itemName: item.item_name_snapshot,
      quantity: item.quantity,
      unitPrice: item.unit_price_snapshot,
      subtotal: item.subtotal,
      customizations: (item.customizations || []).map((customization) => ({
        id: customization.id,
        optionType: customization.option_type,
        label: customization.label_snapshot
      }))
    }))
  };
}

module.exports = {
  authorizeLinePayPaymentInDatabase,
  cancelGroupBuyActivity,
  createGroupBuyActivity,
  createOrder,
  createPendingLinePayAuthorization,
  getLatestLinePayAuthorizationForOrder,
  getOrderPaymentContext,
  listGroupBuyActivities
};
