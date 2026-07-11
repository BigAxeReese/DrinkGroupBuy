const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "..", "database", "drink-group-buy-dev.sqlite");

function openDatabase() {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  ensureRuntimeSchema(database);
  return database;
}

function ensureRuntimeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS order_revisions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending_authorization'
        CHECK (status IN ('pending_authorization', 'applied', 'failed', 'cancelled')),
      original_payment_authorization_id TEXT REFERENCES payment_authorizations(id),
      replacement_payment_authorization_id TEXT REFERENCES payment_authorizations(id),
      fallback_purchase_preference TEXT NOT NULL DEFAULT 'decline_original_price'
        CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
      previous_total_cups INTEGER NOT NULL CHECK (previous_total_cups > 0),
      previous_original_amount INTEGER NOT NULL CHECK (previous_original_amount >= 0),
      total_cups INTEGER NOT NULL CHECK (total_cups > 0),
      original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      applied_at TEXT,
      cancelled_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_order_revisions_order ON order_revisions(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_revisions_status ON order_revisions(status);

    CREATE TABLE IF NOT EXISTS order_revision_items (
      id TEXT PRIMARY KEY,
      order_revision_id TEXT NOT NULL REFERENCES order_revisions(id) ON DELETE CASCADE,
      menu_item_id TEXT REFERENCES menu_items(id),
      item_name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_snapshot INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
    );

    CREATE TABLE IF NOT EXISTS order_revision_item_customizations (
      id TEXT PRIMARY KEY,
      order_revision_item_id TEXT NOT NULL REFERENCES order_revision_items(id) ON DELETE CASCADE,
      customization_option_id TEXT REFERENCES customization_options(id),
      option_type TEXT NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
      label_snapshot TEXT NOT NULL,
      price_delta_snapshot INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  const paymentAuthorizationColumns = database.prepare("PRAGMA table_info(payment_authorizations)").all();
  const hasOrderRevisionId = paymentAuthorizationColumns.some((column) => column.name === "order_revision_id");
  if (!hasOrderRevisionId) {
    database.exec("ALTER TABLE payment_authorizations ADD COLUMN order_revision_id TEXT REFERENCES order_revisions(id);");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_payment_authorizations_order_revision
    ON payment_authorizations(order_revision_id);
  `);
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
    const progressRows = database.prepare(`
      SELECT
        activity_id,
        COALESCE(SUM(total_cups), 0) AS authorized_cups,
        COUNT(*) AS participant_count
      FROM orders
      WHERE payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
      GROUP BY activity_id
    `).all();
    const progressByActivityId = new Map(progressRows.map((row) => [row.activity_id, row]));

    return rows.map((row) => {
      const activityTiers = tiers
        .filter((tier) => tier.activity_id === row.id)
        .map((tier) => ({
          id: tier.id,
          targetCups: tier.target_cups,
          cups: tier.target_cups,
          discountAmount: tier.discount_amount,
          sortOrder: tier.sort_order
        }));
      const progress = progressByActivityId.get(row.id);
      const authorizedCups = Number(progress?.authorized_cups ?? 0);
      const participantCount = Number(progress?.participant_count ?? 0);
      const firstTargetCups = activityTiers[0]?.targetCups ?? row.maximum_cups ?? 0;
      const displayStatus = row.status === "recruiting" && authorizedCups >= firstTargetCups
        ? "confirmed"
        : row.status;

      return {
        id: row.id,
        storeId: row.store_id,
        createdByUserId: row.created_by_user_id,
        title: row.title,
        status: displayStatus,
        rawStatus: row.status,
        startAt: row.start_at,
        deadlineAt: row.deadline_at,
        pickupStartAt: row.pickup_start_at,
        pickupEndAt: row.pickup_end_at,
        maximumCups: row.maximum_cups,
        targetCups: firstTargetCups,
        currentCups: authorizedCups,
        authorizedCups,
        participantCount,
        withdrawalLockMinutes: row.withdrawal_lock_minutes,
        cancellationReason: row.cancellation_reason,
        store: {
          name: row.store_name,
          address: row.store_address,
          latitude: row.latitude,
          longitude: row.longitude
        },
        tiers: activityTiers
      };
    });
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

function listDueGroupBuyActivitiesForSettlement(input = {}) {
  const database = openDatabase();
  const now = input.now || new Date().toISOString();
  const nowTime = Date.parse(now);
  const limit = normalizePositiveInteger(input.limit, 20);

  try {
    const rows = database.prepare(`
      SELECT
        activity.id,
        activity.status,
        activity.deadline_at
      FROM group_buy_activities activity
      LEFT JOIN activity_settlements settlement
        ON settlement.activity_id = activity.id
      WHERE settlement.id IS NULL
        AND activity.status IN ('recruiting', 'confirmed', 'ordering')
      ORDER BY activity.deadline_at ASC
    `).all();

    return rows
      .map((row) => ({
        id: row.id,
        status: row.status,
        deadlineAt: row.deadline_at,
        deadlineTime: Date.parse(row.deadline_at)
      }))
      .filter((activity) => !Number.isNaN(nowTime)
        && !Number.isNaN(activity.deadlineTime)
        && activity.deadlineTime <= nowTime)
      .sort((left, right) => left.deadlineTime - right.deadlineTime)
      .slice(0, limit)
      .map(({ deadlineTime, ...activity }) => activity);
  } finally {
    database.close();
  }
}

function createGroupBuySettlementPlan(activityId, input = {}) {
  const database = openDatabase();
  const now = input.now || new Date().toISOString();
  const actorUserId = input.actorUserId || null;
  const force = Boolean(input.force);
  let transactionStarted = false;

  try {
    const existingSettlement = database.prepare(`
      SELECT *
      FROM activity_settlements
      WHERE activity_id = ?
    `).get(activityId);
    if (existingSettlement) {
      return {
        error: "activity_already_settled",
        settlement: mapActivitySettlement(existingSettlement)
      };
    }

    const activity = database.prepare(`
      SELECT *
      FROM group_buy_activities
      WHERE id = ?
    `).get(activityId);
    if (!activity) {
      return null;
    }

    if (activity.status === "cancelled") {
      return { error: "activity_cancelled", status: activity.status };
    }

    if (["failed", "completed", "ready_for_pickup"].includes(activity.status)) {
      return { error: "activity_not_settleable", status: activity.status };
    }

    if (!force && Date.parse(activity.deadline_at) > Date.parse(now)) {
      return {
        error: "settlement_not_due",
        deadlineAt: activity.deadline_at,
        now
      };
    }

    const tiers = database.prepare(`
      SELECT id, target_cups, discount_amount, sort_order
      FROM promotion_tiers
      WHERE activity_id = ?
      ORDER BY target_cups ASC, sort_order ASC
    `).all(activityId);

    const orderRows = database.prepare(`
      SELECT
        orders.*,
        authorization.id AS payment_authorization_id,
        authorization.provider AS payment_provider,
        authorization.provider_authorization_id,
        authorization.authorized_amount,
        authorization.status AS payment_authorization_status
      FROM orders
      LEFT JOIN payment_authorizations authorization
        ON authorization.id = (
          SELECT id
          FROM payment_authorizations
          WHERE order_id = orders.id
            AND provider IN ('line_pay', 'mock_line_pay')
            AND status IN ('authorized', 'captured')
          ORDER BY authorized_at DESC, created_at DESC
          LIMIT 1
        )
      WHERE orders.activity_id = ?
        AND orders.payment_status IN ('authorized', 'captured')
        AND orders.status NOT IN ('cancelled')
      ORDER BY orders.submitted_at ASC
    `).all(activityId);

    const authorizedCups = orderRows.reduce((sum, order) => sum + order.total_cups, 0);
    const appliedTier = tiers
      .filter((tier) => authorizedCups >= tier.target_cups)
      .at(-1) || null;
    const outcome = appliedTier ? "qualified" : "failed";
    const settlementOrders = orderRows.map((order) => mapSettlementOrder(order, {
      outcome,
      appliedTier
    }));
    const capturedOrderCount = settlementOrders
      .filter((order) => order.action === "already_captured")
      .length;

    database.exec("BEGIN;");
    transactionStarted = true;

    if (activity.status !== "ordering") {
      database.prepare(`
        UPDATE group_buy_activities
        SET status = 'ordering',
            updated_at = ?
        WHERE id = ?
      `).run(now, activityId);

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
        ) VALUES (?, 'activity', ?, ?, 'ordering', 'deadline_settlement_started', ?, ?)
      `).run(
        `status-history-${randomUUID()}`,
        activityId,
        activity.status,
        actorUserId,
        now
      );
    }

    database.prepare(`
      UPDATE orders
      SET status = 'locked',
          updated_at = ?
      WHERE activity_id = ?
        AND status = 'submitted'
        AND payment_status = 'authorized'
    `).run(now, activityId);

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, 'start_group_buy_settlement', 'activity', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      actorUserId,
      activityId,
      JSON.stringify({
        force,
        authorizedCups,
        outcome,
        appliedTierId: appliedTier?.id || null
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return {
      activity: mapSettlementActivity(activity),
      outcome,
      authorizedCups,
      appliedTier: appliedTier ? mapSettlementTier(appliedTier) : null,
      capturedOrderCount,
      orders: settlementOrders
    };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function completeGroupBuySettlement(activityId, input = {}) {
  const database = openDatabase();
  const now = input.now || new Date().toISOString();
  const settlementId = `activity-settlement-${randomUUID()}`;
  const actorUserId = input.actorUserId || null;
  const outcome = input.outcome || "failed";
  const capturedOrderCount = Number(input.capturedOrderCount || 0);
  const finalStatus = outcome === "qualified" || capturedOrderCount > 0
    ? "ordering"
    : "failed";
  let transactionStarted = false;

  try {
    const existingSettlement = database.prepare(`
      SELECT *
      FROM activity_settlements
      WHERE activity_id = ?
    `).get(activityId);
    if (existingSettlement) {
      return {
        settlement: mapActivitySettlement(existingSettlement),
        alreadyCompleted: true
      };
    }

    const activity = database.prepare(`
      SELECT id, status
      FROM group_buy_activities
      WHERE id = ?
    `).get(activityId);
    if (!activity) {
      return null;
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      INSERT INTO activity_settlements (
        id,
        activity_id,
        outcome,
        authorized_cups,
        applied_tier_id,
        discount_amount,
        settled_at,
        reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      settlementId,
      activityId,
      outcome,
      Number(input.authorizedCups || 0),
      input.appliedTierId || null,
      Number(input.discountAmount || 0),
      now,
      input.reason || "deadline_settlement_completed"
    );

    database.prepare(`
      UPDATE group_buy_activities
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(finalStatus, now, activityId);

    if (activity.status !== finalStatus) {
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
        ) VALUES (?, 'activity', ?, ?, ?, 'deadline_settlement_completed', ?, ?)
      `).run(
        `status-history-${randomUUID()}`,
        activityId,
        activity.status,
        finalStatus,
        actorUserId,
        now
      );
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
      ) VALUES (?, ?, 'complete_group_buy_settlement', 'activity', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      actorUserId,
      activityId,
      JSON.stringify({
        outcome,
        finalStatus,
        capturedOrderCount,
        voidedOrderCount: Number(input.voidedOrderCount || 0),
        appliedTierId: input.appliedTierId || null,
        discountAmount: Number(input.discountAmount || 0)
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return {
      settlement: getActivitySettlementByActivityId(activityId),
      activity: listGroupBuyActivities().find((activityItem) => activityItem.id === activityId)
    };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function getUserAuthProfileByLoginIdentifier(identifier) {
  const database = openDatabase();
  try {
    const user = database.prepare(`
      SELECT id, login_name, phone_number, email, password_hash, display_name, surname, status
      FROM users
      WHERE (
          phone_number = ?
          OR lower(login_name) = lower(?)
          OR lower(email) = lower(?)
        )
        AND status = 'active'
    `).get(identifier, identifier, identifier);

    return user ? hydrateUserAuthProfile(database, user) : null;
  } finally {
    database.close();
  }
}

function getUserAuthProfileByFirebaseUid(firebaseUid) {
  const database = openDatabase();
  try {
    const user = database.prepare(`
      SELECT id, login_name, phone_number, email, password_hash, display_name, surname, status
      FROM users
      WHERE firebase_uid = ?
        AND status = 'active'
    `).get(firebaseUid);

    return user ? hydrateUserAuthProfile(database, user) : null;
  } finally {
    database.close();
  }
}

function getUserAuthProfileById(userId) {
  const database = openDatabase();
  try {
    const user = database.prepare(`
      SELECT id, login_name, phone_number, email, password_hash, display_name, surname, status
      FROM users
      WHERE id = ?
        AND status = 'active'
    `).get(userId);

    return user ? hydrateUserAuthProfile(database, user) : null;
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

function updatePendingOrder(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const items = normalizeOrderItems(input.items);
  const totalCups = items.reduce((sum, item) => sum + item.quantity, 0);
  const originalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  let transactionStarted = false;

  try {
    const order = database.prepare(`
      SELECT id, activity_id, customer_user_id, status, payment_status
      FROM orders
      WHERE id = ?
    `).get(input.orderId);

    if (!order) {
      return { error: "order_not_found" };
    }
    if (order.customer_user_id !== input.customerUserId) {
      return { error: "order_access_denied" };
    }
    if (order.status !== "submitted" || order.payment_status !== "pending") {
      return {
        error: "order_not_editable",
        status: order.status,
        paymentStatus: order.payment_status
      };
    }

    const activity = database.prepare(`
      SELECT id, status, maximum_cups
      FROM group_buy_activities
      WHERE id = ?
    `).get(order.activity_id);
    if (!activity) {
      return { error: "activity_not_found" };
    }
    if (!["recruiting", "confirmed"].includes(activity.status)) {
      return { error: "activity_not_joinable", status: activity.status };
    }

    const authorizedCups = database.prepare(`
      SELECT COALESCE(SUM(total_cups), 0) AS cups
      FROM orders
      WHERE activity_id = ?
        AND id != ?
        AND payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
    `).get(order.activity_id, input.orderId).cups;

    if (activity.maximum_cups && authorizedCups + totalCups > activity.maximum_cups) {
      return {
        error: "capacity_exceeded",
        maximumCups: activity.maximum_cups,
        authorizedCups,
        requestedCups: totalCups
      };
    }

    const pendingAuthorizations = database.prepare(`
      SELECT id, status, provider_authorization_id
      FROM payment_authorizations
      WHERE order_id = ?
        AND provider = 'line_pay'
        AND status = 'pending'
    `).all(input.orderId);

    database.exec("BEGIN;");
    transactionStarted = true;

    for (const authorization of pendingAuthorizations) {
      database.prepare(`
        UPDATE payment_authorizations
        SET status = 'failed',
            failure_reason = 'order_updated_before_authorization',
            updated_at = ?
        WHERE id = ?
      `).run(now, authorization.id);

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
        ) VALUES (?, 'payment_authorization', ?, 'pending', 'failed', 'order_updated_before_authorization', ?, ?)
      `).run(
        `status-history-${randomUUID()}`,
        authorization.id,
        input.customerUserId,
        now
      );
    }

    database.prepare(`
      DELETE FROM order_item_customizations
      WHERE order_item_id IN (
        SELECT id
        FROM order_items
        WHERE order_id = ?
      )
    `).run(input.orderId);
    database.prepare("DELETE FROM order_items WHERE order_id = ?").run(input.orderId);

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
        input.orderId,
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
      UPDATE orders
      SET fallback_purchase_preference = ?,
          total_cups = ?,
          original_amount = ?,
          final_amount = NULL,
          payment_status = 'pending',
          authorization_status = 'pending',
          merchant_acceptance_status = 'pending',
          pickup_status = 'not_ready',
          updated_at = ?
      WHERE id = ?
    `).run(
      input.fallbackPurchasePreference || "decline_original_price",
      totalCups,
      originalAmount,
      now,
      input.orderId
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
      ) VALUES (?, 'order', ?, 'submitted', 'submitted', 'customer_update_pending_order', ?, ?)
    `).run(
      `status-history-${randomUUID()}`,
      input.orderId,
      input.customerUserId,
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return {
      order: getOrderById(input.orderId),
      failedAuthorizations: pendingAuthorizations.map((authorization) => ({
        id: authorization.id,
        providerAuthorizationId: authorization.provider_authorization_id
      }))
    };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function createOrderRevision(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const revisionId = `order-revision-${randomUUID()}`;
  const items = normalizeOrderItems(input.items);
  const totalCups = items.reduce((sum, item) => sum + item.quantity, 0);
  const originalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  let transactionStarted = false;

  try {
    const order = database.prepare(`
      SELECT
        orders.id,
        orders.activity_id,
        orders.customer_user_id,
        orders.status,
        orders.payment_status,
        orders.authorization_status,
        orders.total_cups,
        orders.original_amount,
        activity.status AS activity_status,
        activity.maximum_cups,
        activity.deadline_at,
        activity.withdrawal_lock_minutes
      FROM orders
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      WHERE orders.id = ?
    `).get(input.orderId);

    if (!order) {
      return { error: "order_not_found" };
    }
    if (order.customer_user_id !== input.customerUserId) {
      return { error: "order_access_denied" };
    }
    if (
      order.status !== "submitted"
      || order.payment_status !== "authorized"
      || order.authorization_status !== "authorized"
    ) {
      return {
        error: "order_not_revisable",
        status: order.status,
        paymentStatus: order.payment_status,
        authorizationStatus: order.authorization_status
      };
    }
    if (!["recruiting", "confirmed"].includes(order.activity_status)) {
      return { error: "activity_not_joinable", status: order.activity_status };
    }

    const lockMinutes = Number(order.withdrawal_lock_minutes || 30);
    const deadlineTime = Date.parse(order.deadline_at);
    const nowTime = Date.parse(now);
    if (!Number.isNaN(deadlineTime) && deadlineTime - nowTime <= lockMinutes * 60 * 1000) {
      return {
        error: "order_locked_by_deadline",
        deadlineAt: order.deadline_at,
        lockMinutes
      };
    }

    const pendingRevision = database.prepare(`
      SELECT id
      FROM order_revisions
      WHERE order_id = ?
        AND status = 'pending_authorization'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(input.orderId);
    if (pendingRevision) {
      return {
        error: "order_revision_already_pending",
        orderRevisionId: pendingRevision.id
      };
    }

    const originalAuthorization = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE order_id = ?
        AND status = 'authorized'
      ORDER BY authorized_at DESC, created_at DESC
      LIMIT 1
    `).get(input.orderId);
    if (!originalAuthorization) {
      return { error: "order_authorization_missing" };
    }

    const authorizedCups = database.prepare(`
      SELECT COALESCE(SUM(total_cups), 0) AS cups
      FROM orders
      WHERE activity_id = ?
        AND id != ?
        AND payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
    `).get(order.activity_id, input.orderId).cups;

    if (order.maximum_cups && authorizedCups + totalCups > order.maximum_cups) {
      return {
        error: "capacity_exceeded",
        maximumCups: order.maximum_cups,
        authorizedCups,
        requestedCups: totalCups
      };
    }

    database.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;

    database.prepare(`
      INSERT INTO order_revisions (
        id,
        order_id,
        status,
        original_payment_authorization_id,
        fallback_purchase_preference,
        previous_total_cups,
        previous_original_amount,
        total_cups,
        original_amount,
        created_at,
        updated_at
      ) VALUES (?, ?, 'pending_authorization', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revisionId,
      input.orderId,
      originalAuthorization.id,
      input.fallbackPurchasePreference || order.fallback_purchase_preference || "decline_original_price",
      order.total_cups,
      order.original_amount,
      totalCups,
      originalAmount,
      now,
      now
    );

    insertOrderRevisionItems(database, revisionId, items);

    database.prepare(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, 'customer_create_order_revision', 'order', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      input.customerUserId,
      input.orderId,
      JSON.stringify({
        orderRevisionId: revisionId,
        previousTotalCups: order.total_cups,
        requestedTotalCups: totalCups,
        previousOriginalAmount: order.original_amount,
        requestedOriginalAmount: originalAmount
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return { revision: getOrderRevisionById(revisionId) };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function insertOrderRevisionItems(database, revisionId, items) {
  const insertRevisionItem = database.prepare(`
    INSERT INTO order_revision_items (
      id,
      order_revision_id,
      menu_item_id,
      item_name_snapshot,
      quantity,
      unit_price_snapshot,
      subtotal
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRevisionCustomization = database.prepare(`
    INSERT INTO order_revision_item_customizations (
      id,
      order_revision_item_id,
      customization_option_id,
      option_type,
      label_snapshot,
      price_delta_snapshot,
      sort_order
    ) VALUES (?, ?, NULL, ?, ?, 0, ?)
  `);

  items.forEach((item) => {
    const revisionItemId = `order-revision-item-${randomUUID()}`;
    const menuItem = item.menuItemId
      ? database.prepare("SELECT id FROM menu_items WHERE id = ?").get(item.menuItemId)
      : null;

    insertRevisionItem.run(
      revisionItemId,
      revisionId,
      menuItem?.id ?? null,
      item.itemName,
      item.quantity,
      item.unitPrice,
      item.subtotal
    );

    item.customizations.forEach((customization, index) => {
      insertRevisionCustomization.run(
        `order-revision-item-customization-${randomUUID()}`,
        revisionItemId,
        customization.optionType,
        customization.label,
        index
      );
    });
  });
}

function copyOrderRevisionItemsToOrder(database, revisionId, orderId) {
  const revisionItems = database.prepare(`
    SELECT *
    FROM order_revision_items
    WHERE order_revision_id = ?
    ORDER BY rowid ASC
  `).all(revisionId);
  const revisionCustomizations = database.prepare(`
    SELECT *
    FROM order_revision_item_customizations
    WHERE order_revision_item_id = ?
    ORDER BY sort_order ASC
  `);
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
  const insertOrderCustomization = database.prepare(`
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

  revisionItems.forEach((item) => {
    const orderItemId = `order-item-${randomUUID()}`;
    insertOrderItem.run(
      orderItemId,
      orderId,
      item.menu_item_id,
      item.item_name_snapshot,
      item.quantity,
      item.unit_price_snapshot,
      item.subtotal
    );

    revisionCustomizations.all(item.id).forEach((customization, index) => {
      insertOrderCustomization.run(
        `order-item-customization-${randomUUID()}`,
        orderItemId,
        customization.option_type,
        customization.label_snapshot,
        index
      );
    });
  });
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

function getOrderRevisionPaymentContext(orderRevisionId) {
  const database = openDatabase();
  try {
    const revision = database.prepare(`
      SELECT
        revision.id,
        revision.order_id,
        revision.status,
        revision.total_cups,
        revision.original_amount,
        orders.customer_user_id,
        orders.payment_status,
        orders.authorization_status
      FROM order_revisions revision
      JOIN orders ON orders.id = revision.order_id
      WHERE revision.id = ?
    `).get(orderRevisionId);

    return revision ? {
      id: revision.id,
      orderId: revision.order_id,
      status: revision.status,
      totalCups: revision.total_cups,
      originalAmount: revision.original_amount,
      customerUserId: revision.customer_user_id,
      paymentStatus: revision.payment_status,
      authorizationStatus: revision.authorization_status
    } : null;
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

function getLatestLinePayAuthorizationForOrderRevision(orderRevisionId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE order_revision_id = ?
        AND provider = 'line_pay'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(orderRevisionId);

    return row ? mapPaymentAuthorization(row) : null;
  } finally {
    database.close();
  }
}

function getLinePayAuthorizationContext(input) {
  const database = openDatabase();
  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    const order = database.prepare(`
      SELECT id, original_amount
      FROM orders
      WHERE id = ?
    `).get(authorization.order_id);

    return {
      authorization: mapPaymentAuthorization(authorization),
      order: order
        ? {
            id: order.id,
            originalAmount: order.original_amount
          }
        : null,
      amount: authorization.original_amount,
      currency: process.env.LINE_PAY_CURRENCY || "TWD"
    };
  } finally {
    database.close();
  }
}

function getOrderRevisionById(orderRevisionId) {
  const database = openDatabase();
  try {
    const revision = database.prepare(`
      SELECT *
      FROM order_revisions
      WHERE id = ?
    `).get(orderRevisionId);
    if (!revision) return null;

    const items = database.prepare(`
      SELECT *
      FROM order_revision_items
      WHERE order_revision_id = ?
      ORDER BY rowid ASC
    `).all(orderRevisionId);
    const customizations = database.prepare(`
      SELECT *
      FROM order_revision_item_customizations
      WHERE order_revision_item_id = ?
      ORDER BY sort_order ASC
    `);

    return mapOrderRevision(revision, items.map((item) => ({
      ...item,
      customizations: customizations.all(item.id)
    })));
  } finally {
    database.close();
  }
}

function getOrderDetail(orderId) {
  const order = getOrderById(orderId);
  if (!order) return null;
  return {
    ...order,
    latestLinePayAuthorization: getLatestLinePayAuthorizationForOrder(orderId),
    pendingRevision: getPendingOrderRevisionByOrderId(orderId)
  };
}

function getPendingOrderRevisionByOrderId(orderId) {
  const database = openDatabase();
  try {
    const revision = database.prepare(`
      SELECT id
      FROM order_revisions
      WHERE order_id = ?
        AND status = 'pending_authorization'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(orderId);

    return revision ? getOrderRevisionById(revision.id) : null;
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
    const revision = input.orderRevisionId
      ? database.prepare(`
          SELECT id, order_id, status, original_amount
          FROM order_revisions
          WHERE id = ?
        `).get(input.orderRevisionId)
      : null;
    if (input.orderRevisionId && !revision) {
      return null;
    }
    if (revision && revision.status !== "pending_authorization") {
      return null;
    }

    const order = database.prepare(`
      SELECT id, original_amount, payment_status
      FROM orders
      WHERE id = ?
    `).get(revision?.order_id || input.orderId);

    if (!order) {
      return null;
    }
    if (revision && input.orderId && revision.order_id !== input.orderId) {
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
        order_revision_id,
        provider,
        status,
        original_amount,
        authorized_amount,
        provider_authorization_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'line_pay', 'pending', ?, 0, ?, ?, ?)
    `).run(
      authorizationId,
      revision?.order_id || input.orderId,
      revision?.id || null,
      revision?.original_amount ?? input.amount,
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
        orderId: revision?.order_id || input.orderId,
        orderRevisionId: revision?.id || null,
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

    if (authorization.status !== "pending") {
      return mapPaymentAuthorization(authorization);
    }

    database.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;

    const order = database.prepare(`
      SELECT
        orders.id,
        orders.activity_id,
        orders.total_cups,
        orders.original_amount,
        activity.maximum_cups
      FROM orders
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      WHERE orders.id = ?
    `).get(authorization.order_id);

    if (!order) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return null;
    }

    const revision = authorization.order_revision_id
      ? database.prepare(`
          SELECT *
          FROM order_revisions
          WHERE id = ?
        `).get(authorization.order_revision_id)
      : null;
    if (authorization.order_revision_id && !revision) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return {
        error: "order_revision_not_found",
        authorization: mapPaymentAuthorization(authorization)
      };
    }
    if (revision && revision.status !== "pending_authorization") {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return {
        error: "order_revision_not_pending",
        revision: mapOrderRevision(revision),
        authorization: mapPaymentAuthorization(authorization)
      };
    }

    const requestedCups = revision?.total_cups || order.total_cups;
    const requestedAmount = revision?.original_amount || order.original_amount;
    const authorizedCups = database.prepare(`
      SELECT COALESCE(SUM(total_cups), 0) AS cups
      FROM orders
      WHERE activity_id = ?
        AND id != ?
        AND payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
    `).get(order.activity_id, order.id).cups;

    if (order.maximum_cups && authorizedCups + requestedCups > order.maximum_cups) {
      database.prepare(`
        UPDATE payment_authorizations
        SET status = 'failed',
            failure_reason = 'capacity_exceeded_at_confirm',
            updated_at = ?
        WHERE id = ?
      `).run(now, authorization.id);

      if (revision) {
        database.prepare(`
          UPDATE order_revisions
          SET status = 'failed',
              failure_reason = 'capacity_exceeded_at_confirm',
              updated_at = ?,
              cancelled_at = ?
          WHERE id = ?
        `).run(now, now, revision.id);
      }

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
        ) VALUES (?, ?, 'authorization', ?, 'confirm_capacity_rejected', ?, ?, ?, ?)
      `).run(
        `provider-event-${randomUUID()}`,
        authorization.provider,
        authorization.id,
        input.providerTransactionId
          ? `${authorization.provider}_confirm_capacity_rejected:${input.providerTransactionId}`
          : null,
        JSON.stringify({
          providerPayload: input.providerPayload || {},
          maximumCups: order.maximum_cups,
          authorizedCups,
          requestedCups,
          orderRevisionId: revision?.id || null
        }),
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
        ) VALUES (?, 'payment_authorization', ?, ?, 'failed', 'capacity_exceeded_at_confirm', NULL, ?)
      `).run(
        `status-history-${randomUUID()}`,
        authorization.id,
        authorization.status,
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
        ) VALUES (?, NULL, 'line_pay_confirm_capacity_rejected', 'payment_authorization', ?, ?, ?)
      `).run(
        `audit-log-${randomUUID()}`,
        authorization.id,
        JSON.stringify({
          orderId: authorization.order_id,
          orderRevisionId: revision?.id || null,
          providerTransactionId: input.providerTransactionId,
          maximumCups: order.maximum_cups,
          authorizedCups,
          requestedCups
        }),
        now
      );

      database.exec("COMMIT;");
      transactionStarted = false;

      return {
        error: "capacity_exceeded",
        maximumCups: order.maximum_cups,
        authorizedCups,
        requestedCups,
        authorization: getPaymentAuthorizationById(authorization.id)
      };
    }

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

    let replacedAuthorization = null;
    if (revision) {
      replacedAuthorization = revision.original_payment_authorization_id
        ? database.prepare(`
            SELECT *
            FROM payment_authorizations
            WHERE id = ?
          `).get(revision.original_payment_authorization_id)
        : null;

      database.prepare(`
        DELETE FROM order_item_customizations
        WHERE order_item_id IN (
          SELECT id
          FROM order_items
          WHERE order_id = ?
        )
      `).run(authorization.order_id);
      database.prepare("DELETE FROM order_items WHERE order_id = ?").run(authorization.order_id);

      copyOrderRevisionItemsToOrder(database, revision.id, authorization.order_id);

      database.prepare(`
        UPDATE orders
        SET fallback_purchase_preference = ?,
            total_cups = ?,
            original_amount = ?,
            final_amount = NULL,
            payment_status = 'authorized',
            authorization_status = 'authorized',
            merchant_acceptance_status = 'accepted',
            pickup_status = 'not_ready',
            updated_at = ?
        WHERE id = ?
      `).run(
        revision.fallback_purchase_preference,
        revision.total_cups,
        revision.original_amount,
        now,
        authorization.order_id
      );

      database.prepare(`
        UPDATE order_revisions
        SET status = 'applied',
            replacement_payment_authorization_id = ?,
            applied_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        authorization.id,
        now,
        now,
        revision.id
      );
    } else {
      database.prepare(`
        UPDATE orders
        SET payment_status = 'authorized',
            authorization_status = 'authorized',
            merchant_acceptance_status = 'accepted',
            updated_at = ?
        WHERE id = ?
      `).run(now, authorization.order_id);
    }

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
      ) VALUES (?, ?, 'authorization', ?, 'confirm_success', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.provider,
      authorization.id,
      input.providerTransactionId ? `${authorization.provider}_confirm:${input.providerTransactionId}` : null,
      JSON.stringify({
        providerPayload: input.providerPayload || {},
        orderRevisionId: revision?.id || null
      }),
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

    if (revision) {
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
        ) VALUES (?, 'order', ?, 'submitted', 'submitted', 'order_revision_authorized_and_applied', NULL, ?)
      `).run(
        `status-history-${randomUUID()}`,
        authorization.order_id,
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
        ) VALUES (?, NULL, 'apply_order_revision_after_authorization', 'order', ?, ?, ?)
      `).run(
        `audit-log-${randomUUID()}`,
        authorization.order_id,
        JSON.stringify({
          orderRevisionId: revision.id,
          replacementPaymentAuthorizationId: authorization.id,
          originalPaymentAuthorizationId: revision.original_payment_authorization_id,
          previousTotalCups: revision.previous_total_cups,
          totalCups: revision.total_cups,
          previousOriginalAmount: revision.previous_original_amount,
          originalAmount: revision.original_amount
        }),
        now
      );
    }

    database.exec("COMMIT;");
    transactionStarted = false;

    const authorizedPayment = getPaymentAuthorizationById(authorization.id);
    if (!revision) {
      return authorizedPayment;
    }

    return {
      ...authorizedPayment,
      appliedOrderRevision: getOrderRevisionById(revision.id),
      replacedAuthorization: replacedAuthorization ? mapPaymentAuthorization(replacedAuthorization) : null
    };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function cancelPendingLinePayAuthorizationInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const reason = input.reason || "line_pay_cancel_redirect";
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    if (authorization.status !== "pending") {
      return mapPaymentAuthorization(authorization);
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      UPDATE payment_authorizations
      SET status = 'failed',
          failure_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).run(reason, now, authorization.id);

    if (authorization.order_revision_id) {
      database.prepare(`
        UPDATE order_revisions
        SET status = 'failed',
            failure_reason = ?,
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'pending_authorization'
      `).run(reason, now, now, authorization.order_revision_id);
    }

    database.prepare(`
      INSERT OR IGNORE INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, 'line_pay', 'authorization', ?, 'cancel_redirect', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.id,
      input.providerTransactionId ? `line_pay_cancel:${input.providerTransactionId}` : null,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null
      }),
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
      ) VALUES (?, 'payment_authorization', ?, 'pending', 'failed', ?, NULL, ?)
    `).run(
      `status-history-${randomUUID()}`,
      authorization.id,
      reason,
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
      ) VALUES (?, NULL, 'line_pay_cancel_authorization', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorization.id,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason
      }),
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

function voidLinePayAuthorizationInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const reason = input.reason || "line_pay_void_authorization";
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    if (authorization.status === "authorization_voided") {
      return mapPaymentAuthorization(authorization);
    }

    if (authorization.status === "captured") {
      return {
        error: "authorization_already_captured",
        authorization: mapPaymentAuthorization(authorization)
      };
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      UPDATE payment_authorizations
      SET status = 'authorization_voided',
          voided_at = ?,
          failure_reason = COALESCE(failure_reason, ?),
          updated_at = ?
      WHERE id = ?
    `).run(now, reason, now, authorization.id);

    database.prepare(`
      UPDATE orders
      SET payment_status = 'authorization_voided',
          authorization_status = 'authorization_voided',
          updated_at = ?
      WHERE id = ?
        AND payment_status != 'captured'
        AND NOT EXISTS (
          SELECT 1
          FROM payment_authorizations active_authorization
          WHERE active_authorization.order_id = ?
            AND active_authorization.id != ?
            AND active_authorization.status IN ('authorized', 'captured')
        )
    `).run(now, authorization.order_id, authorization.order_id, authorization.id);

    database.prepare(`
      INSERT OR IGNORE INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, ?, 'authorization', ?, 'void_success', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.provider,
      authorization.id,
      input.providerTransactionId ? `${authorization.provider}_void:${input.providerTransactionId}` : null,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason,
        providerPayload: input.providerPayload || {}
      }),
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
      ) VALUES (?, 'payment_authorization', ?, ?, 'authorization_voided', ?, NULL, ?)
    `).run(
      `status-history-${randomUUID()}`,
      authorization.id,
      authorization.status,
      reason,
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
      ) VALUES (?, NULL, 'line_pay_void_authorization', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorization.id,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason
      }),
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

function recordLinePayVoidFailureInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const reason = input.reason || "line_pay_void_failed";
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      INSERT OR IGNORE INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, ?, 'authorization', ?, 'void_failed', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.provider,
      authorization.id,
      input.providerTransactionId ? `${authorization.provider}_void_failed:${input.providerTransactionId}` : null,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason,
        providerPayload: input.providerPayload || {}
      }),
      now,
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
      ) VALUES (?, NULL, 'line_pay_void_authorization_failed', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorization.id,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason,
        providerPayload: input.providerPayload || {}
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return mapPaymentAuthorization(authorization);
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function captureLinePayAuthorizationInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const captureAmount = Number(input.amount);
  const finalAmount = Number(input.finalAmount ?? input.amount);
  const reason = input.reason || "line_pay_capture_success";
  const captureId = `payment-capture-${randomUUID()}`;
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    if (authorization.status === "captured") {
      const latestCapture = getLatestPaymentCaptureByAuthorizationId(authorization.id);
      return {
        authorization: mapPaymentAuthorization(authorization),
        capture: latestCapture,
        status: "captured"
      };
    }

    if (authorization.status !== "authorized") {
      return {
        error: "authorization_not_capturable",
        status: authorization.status,
        authorization: mapPaymentAuthorization(authorization)
      };
    }

    if (!Number.isInteger(captureAmount) || captureAmount < 0) {
      return { error: "invalid_capture_amount" };
    }

    if (captureAmount > authorization.authorized_amount) {
      return {
        error: "capture_amount_exceeds_authorized_amount",
        authorizedAmount: authorization.authorized_amount,
        captureAmount
      };
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      INSERT INTO payment_captures (
        id,
        payment_authorization_id,
        order_id,
        status,
        final_amount,
        capture_amount,
        released_amount,
        provider_capture_id,
        captured_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'captured', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      captureId,
      authorization.id,
      authorization.order_id,
      finalAmount,
      captureAmount,
      Math.max(authorization.authorized_amount - captureAmount, 0),
      input.providerCaptureId || input.providerTransactionId || authorization.provider_authorization_id || null,
      now,
      now,
      now
    );

    database.prepare(`
      UPDATE payment_authorizations
      SET status = 'captured',
          updated_at = ?
      WHERE id = ?
    `).run(now, authorization.id);

    database.prepare(`
      UPDATE orders
      SET payment_status = 'captured',
          authorization_status = 'captured',
          final_amount = ?,
          updated_at = ?
      WHERE id = ?
    `).run(finalAmount, now, authorization.order_id);

    database.prepare(`
      INSERT OR IGNORE INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, ?, 'capture', ?, 'capture_success', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.provider,
      captureId,
      input.providerTransactionId
        ? `${authorization.provider}_capture:${input.providerTransactionId}:${captureAmount}`
        : null,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason,
        providerPayload: input.providerPayload || {}
      }),
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
      ) VALUES (?, 'payment_authorization', ?, ?, 'captured', ?, NULL, ?)
    `).run(
      `status-history-${randomUUID()}`,
      authorization.id,
      authorization.status,
      reason,
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
      ) VALUES (?, NULL, 'line_pay_capture_authorization', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorization.id,
      JSON.stringify({
        captureId,
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        finalAmount,
        captureAmount,
        releasedAmount: Math.max(authorization.authorized_amount - captureAmount, 0),
        reason
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return {
      authorization: getPaymentAuthorizationById(authorization.id),
      capture: getPaymentCaptureById(captureId),
      status: "captured"
    };
  } catch (error) {
    if (transactionStarted) {
      database.exec("ROLLBACK;");
    }
    throw error;
  } finally {
    database.close();
  }
}

function recordLinePayCaptureFailureInDatabase(input) {
  const database = openDatabase();
  const now = new Date().toISOString();
  const captureAmount = Number(input.amount || 0);
  const finalAmount = Number(input.finalAmount ?? input.amount ?? 0);
  const reason = input.reason || "line_pay_capture_failed";
  const captureId = `payment-capture-${randomUUID()}`;
  let transactionStarted = false;

  try {
    const authorization = findLinePayAuthorization(database, input);
    if (!authorization) {
      return null;
    }

    database.exec("BEGIN;");
    transactionStarted = true;

    database.prepare(`
      INSERT INTO payment_captures (
        id,
        payment_authorization_id,
        order_id,
        status,
        final_amount,
        capture_amount,
        released_amount,
        provider_capture_id,
        failure_reason,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'failed', ?, ?, 0, ?, ?, ?, ?)
    `).run(
      captureId,
      authorization.id,
      authorization.order_id,
      Number.isInteger(finalAmount) && finalAmount >= 0 ? finalAmount : 0,
      Number.isInteger(captureAmount) && captureAmount >= 0 ? captureAmount : 0,
      input.providerCaptureId || input.providerTransactionId || authorization.provider_authorization_id || null,
      reason,
      now,
      now
    );

    database.prepare(`
      INSERT OR IGNORE INTO payment_provider_events (
        id,
        provider,
        resource_type,
        resource_id,
        event_type,
        idempotency_key,
        payload_json,
        received_at,
        processed_at
      ) VALUES (?, ?, 'capture', ?, 'capture_failed', ?, ?, ?, ?)
    `).run(
      `provider-event-${randomUUID()}`,
      authorization.provider,
      captureId,
      input.providerTransactionId
        ? `${authorization.provider}_capture_failed:${input.providerTransactionId}:${captureAmount}`
        : null,
      JSON.stringify({
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        reason,
        providerPayload: input.providerPayload || {}
      }),
      now,
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
      ) VALUES (?, NULL, 'line_pay_capture_authorization_failed', 'payment_authorization', ?, ?, ?)
    `).run(
      `audit-log-${randomUUID()}`,
      authorization.id,
      JSON.stringify({
        captureId,
        orderId: input.orderId || authorization.order_id,
        providerTransactionId: input.providerTransactionId || authorization.provider_authorization_id || null,
        finalAmount,
        captureAmount,
        reason,
        providerPayload: input.providerPayload || {}
      }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;

    return {
      authorization: mapPaymentAuthorization(authorization),
      capture: getPaymentCaptureById(captureId),
      status: "failed"
    };
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

function normalizePositiveInteger(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return fallback;
  }
  return numberValue;
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

function getPaymentCaptureById(captureId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM payment_captures
      WHERE id = ?
    `).get(captureId);
    return row ? mapPaymentCapture(row) : null;
  } finally {
    database.close();
  }
}

function getLatestPaymentCaptureByAuthorizationId(authorizationId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM payment_captures
      WHERE payment_authorization_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(authorizationId);
    return row ? mapPaymentCapture(row) : null;
  } finally {
    database.close();
  }
}

function getActivitySettlementByActivityId(activityId) {
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT *
      FROM activity_settlements
      WHERE activity_id = ?
    `).get(activityId);
    return row ? mapActivitySettlement(row) : null;
  } finally {
    database.close();
  }
}

function findLinePayAuthorization(database, input) {
  const provider = input.provider || "line_pay";

  if (input.providerTransactionId) {
    const byProviderTransaction = database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = ?
        AND provider_authorization_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(provider, input.providerTransactionId);

    if (byProviderTransaction) {
      return byProviderTransaction;
    }
  }

  if (input.orderRevisionId) {
    return database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = ?
        AND order_revision_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(provider, input.orderRevisionId);
  }

  if (input.orderId) {
    return database.prepare(`
      SELECT *
      FROM payment_authorizations
      WHERE provider = ?
        AND order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(provider, input.orderId);
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
    orderRevisionId: row.order_revision_id,
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
    capturedAt: row.captured_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapActivitySettlement(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    outcome: row.outcome,
    authorizedCups: row.authorized_cups,
    appliedTierId: row.applied_tier_id,
    discountAmount: row.discount_amount,
    settledAt: row.settled_at,
    reason: row.reason
  };
}

function mapSettlementActivity(row) {
  return {
    id: row.id,
    status: row.status,
    deadlineAt: row.deadline_at,
    maximumCups: row.maximum_cups
  };
}

function mapSettlementTier(row) {
  return {
    id: row.id,
    targetCups: row.target_cups,
    discountAmount: row.discount_amount,
    sortOrder: row.sort_order
  };
}

function mapSettlementOrder(row, context) {
  const appliedTier = context.appliedTier;
  const isAlreadyCaptured = row.payment_status === "captured";
  const finalAmount = appliedTier
    ? calculateDiscountedFinalAmount(row, appliedTier)
    : row.original_amount;
  let action = "void";
  let actionReason = "discount_not_qualified";

  if (isAlreadyCaptured) {
    action = "already_captured";
    actionReason = "already_captured";
  } else if (!row.payment_authorization_id) {
    action = "error_missing_authorization";
    actionReason = "authorized_order_missing_authorization";
  } else if (context.outcome === "qualified") {
    action = "capture";
    actionReason = "discount_qualified";
  } else if (row.fallback_purchase_preference === "accept_original_price") {
    action = "capture";
    actionReason = "fallback_original_price_accepted";
  }

  return {
    id: row.id,
    activityId: row.activity_id,
    customerUserId: row.customer_user_id,
    paymentAuthorizationId: row.payment_authorization_id,
    paymentProvider: row.payment_provider,
    providerTransactionId: row.provider_authorization_id,
    paymentStatus: row.payment_status,
    orderStatus: row.status,
    fallbackPurchasePreference: row.fallback_purchase_preference,
    totalCups: row.total_cups,
    originalAmount: row.original_amount,
    authorizedAmount: row.authorized_amount,
    finalAmount,
    captureAmount: finalAmount,
    action,
    actionReason
  };
}

function calculateDiscountedFinalAmount(order, tier) {
  if (!tier) return order.original_amount;

  const discountPerCup = Math.floor(tier.discount_amount / tier.target_cups);
  const orderDiscount = Math.min(order.original_amount, discountPerCup * order.total_cups);
  return Math.max(order.original_amount - orderDiscount, 0);
}

function hydrateUserAuthProfile(database, user) {
  const roles = database.prepare(`
    SELECT role
    FROM user_roles
    WHERE user_id = ?
      AND status = 'active'
    ORDER BY role ASC
  `).all(user.id).map((row) => row.role);

  const merchantStores = database.prepare(`
    SELECT
      store.id,
      store.name,
      store.merchant_id,
      merchant_user.permission_level
    FROM merchant_users merchant_user
    JOIN stores store ON store.merchant_id = merchant_user.merchant_id
    WHERE merchant_user.user_id = ?
      AND merchant_user.status = 'active'
    ORDER BY store.name ASC
  `).all(user.id).map((row) => ({
    id: row.id,
    name: row.name,
    merchantId: row.merchant_id,
    permissionLevel: row.permission_level
  }));

  return {
    id: user.id,
    loginName: user.login_name,
    phoneNumber: user.phone_number,
    email: user.email,
    passwordHash: user.password_hash,
    displayName: user.display_name,
    surname: user.surname,
    roles,
    merchantStores
  };
}

function toPublicUser(user) {
  return {
    id: user.id,
    loginName: user.loginName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    displayName: user.displayName,
    surname: user.surname,
    roles: user.roles,
    merchantStores: user.merchantStores
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

function mapOrderRevision(row, items = []) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    originalPaymentAuthorizationId: row.original_payment_authorization_id,
    replacementPaymentAuthorizationId: row.replacement_payment_authorization_id,
    fallbackPurchasePreference: row.fallback_purchase_preference,
    previousTotalCups: row.previous_total_cups,
    previousOriginalAmount: row.previous_original_amount,
    totalCups: row.total_cups,
    originalAmount: row.original_amount,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at,
    cancelledAt: row.cancelled_at,
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
  cancelPendingLinePayAuthorizationInDatabase,
  cancelGroupBuyActivity,
  captureLinePayAuthorizationInDatabase,
  completeGroupBuySettlement,
  createGroupBuyActivity,
  createOrder,
  createGroupBuySettlementPlan,
  createOrderRevision,
  createPendingLinePayAuthorization,
  getLinePayAuthorizationContext,
  getOrderDetail,
  getLatestLinePayAuthorizationForOrder,
  getLatestLinePayAuthorizationForOrderRevision,
  getOrderPaymentContext,
  getOrderRevisionById,
  getOrderRevisionPaymentContext,
  getUserAuthProfileByFirebaseUid,
  getUserAuthProfileByLoginIdentifier,
  getUserAuthProfileById,
  listDueGroupBuyActivitiesForSettlement,
  listGroupBuyActivities,
  recordLinePayCaptureFailureInDatabase,
  recordLinePayVoidFailureInDatabase,
  toPublicUser,
  updatePendingOrder,
  voidLinePayAuthorizationInDatabase
};
