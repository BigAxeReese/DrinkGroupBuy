const { randomInt, randomUUID } = require("node:crypto");
const { calculatePickupExpirationAt, openDatabase } = require("../db");
const {
  OperationLeaseError,
  withOperationLeaseSync
} = require("../reliability/operationLease");

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60_000;
const BLOCK_DURATION_MS = 60_000;
const failedAttempts = new Map();

async function markGroupBuyActivityReadyForPickup(activityId, input = {}) {
  const repository = input.pickupCredentialRepository;
  if (repository?.kind === "postgres") {
    try {
      return await repository.withOperationLock(
        { activityId, now: input.now },
        () => repository.markReady({ activityId, actorUserId: input.actorUserId || null, now: input.now })
      );
    } catch (error) {
      if (error?.code === "operation_locked") {
        return {
          error: "operation_locked",
          lockKey: error.lock?.lockKey,
          lockedUntil: error.lock?.lockedUntil
        };
      }
      throw error;
    }
  }
  try {
    return withOperationLeaseSync({
      lockKey: `pickup:activity:${activityId}:transition`,
      leaseMs: 120_000,
      now: input.now
    }, () => markGroupBuyActivityReadyForPickupUnlocked(activityId, input));
  } catch (error) {
    if (error instanceof OperationLeaseError) {
      return {
        error: "operation_locked",
        lockKey: error.lock.lockKey,
        lockedUntil: error.lock.lockedUntil
      };
    }
    throw error;
  }
}

function markGroupBuyActivityReadyForPickupUnlocked(activityId, input = {}) {
  const database = openDatabase();
  const now = input.now || new Date().toISOString();
  const actorUserId = input.actorUserId || null;
  let transactionStarted = false;

  try {
    const activity = database.prepare(`
      SELECT
        activity.*,
        EXISTS (
          SELECT 1
          FROM stores store
          JOIN merchant_users merchant_user ON merchant_user.merchant_id = store.merchant_id
          WHERE store.id = activity.store_id
            AND merchant_user.user_id = ?
            AND merchant_user.status = 'active'
        ) AS can_manage
      FROM group_buy_activities activity
      WHERE activity.id = ?
    `).get(actorUserId, activityId);

    if (!activity) return { error: "activity_not_found" };
    if (!activity.can_manage) return { error: "activity_access_denied" };
    if (!["ordering", "ready_for_pickup"].includes(activity.status)) {
      return { error: "activity_not_readyable", activityStatus: activity.status };
    }

    const expiresAt = calculatePickupExpirationAt(activity.pickup_start_at, activity.pickup_end_at);
    if (!isBefore(now, expiresAt)) {
      return { error: "pickup_window_expired", expiresAt };
    }

    database.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;

    const orders = database.prepare(`
      SELECT id, pickup_status
      FROM orders
      WHERE activity_id = ?
        AND payment_status = 'captured'
        AND status != 'cancelled'
        AND pickup_status IN ('not_ready', 'ready')
      ORDER BY submitted_at ASC, id ASC
    `).all(activityId);
    if (orders.length === 0) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return { error: "no_captured_orders" };
    }

    const activityUpdate = database.prepare(`
      UPDATE group_buy_activities
      SET status = 'ready_for_pickup', updated_at = ?
      WHERE id = ? AND status IN ('ordering', 'ready_for_pickup')
    `).run(now, activityId);
    if (activityUpdate.changes !== 1) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return { error: "activity_already_changed" };
    }

    const insertHistory = database.prepare(`
      INSERT INTO status_history (
        id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    if (activity.status !== "ready_for_pickup") {
      insertHistory.run(
        "status-history-" + randomUUID(),
        "activity",
        activityId,
        activity.status,
        "ready_for_pickup",
        "merchant_marked_ready_for_pickup",
        actorUserId,
        now
      );
    }

    const getCredential = database.prepare(
      "SELECT * FROM pickup_credentials WHERE order_id = ?"
    );
    const insertCredential = database.prepare(`
      INSERT INTO pickup_credentials (
        id, order_id, pickup_code, visible_after_merchant_acceptance,
        expires_at, expired_at, redeemed_at, redeemed_by_user_id, created_at
      ) VALUES (?, ?, ?, 1, ?, NULL, NULL, NULL, ?)
    `);
    const markReady = database.prepare(`
      UPDATE orders
      SET pickup_status = 'ready', updated_at = ?
      WHERE id = ?
        AND payment_status = 'captured'
        AND status != 'cancelled'
        AND pickup_status = 'not_ready'
    `);

    const credentials = [];
    let createdCredentialCount = 0;
    let readyOrderCount = 0;

    for (const order of orders) {
      const readyUpdate = markReady.run(now, order.id);
      if (readyUpdate.changes === 1) {
        readyOrderCount += 1;
        insertHistory.run(
          "status-history-" + randomUUID(),
          "pickup",
          order.id,
          order.pickup_status,
          "ready",
          "merchant_marked_ready_for_pickup",
          actorUserId,
          now
        );
      }

      let credential = getCredential.get(order.id);
      if (!credential) {
        insertCredential.run(
          "pickup-credential-" + randomUUID(),
          order.id,
          generateAvailableCode(database),
          expiresAt,
          now
        );
        credential = getCredential.get(order.id);
        createdCredentialCount += 1;
      } else if (credential.redeemed_at || credential.expired_at) {
        throw new Error("Inactive pickup credential exists for order " + order.id);
      } else {
        database.prepare(`
          UPDATE pickup_credentials
          SET expires_at = ?
          WHERE order_id = ? AND redeemed_at IS NULL AND expired_at IS NULL
        `).run(expiresAt, order.id);
        credential = getCredential.get(order.id);
      }

      credentials.push(mapCredential(credential, {
        pickup_status: "ready",
        payment_status: "captured",
        activity_status: "ready_for_pickup"
      }, now));
    }

    if (activity.status !== "ready_for_pickup"
      || createdCredentialCount > 0
      || readyOrderCount > 0) {
      database.prepare(`
        INSERT INTO audit_logs (
          id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
        ) VALUES (?, ?, 'merchant_mark_activity_ready_for_pickup', 'activity', ?, ?, ?)
      `).run(
        "audit-log-" + randomUUID(),
        actorUserId,
        activityId,
        JSON.stringify({ createdCredentialCount, readyOrderCount, expiresAt }),
        now
      );
    }

    database.exec("COMMIT;");
    transactionStarted = false;
    return {
      status: "ready_for_pickup",
      activityId,
      expiresAt,
      createdCredentialCount,
      readyOrderCount,
      credentials
    };
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
}

async function getPickupCredentialForOrder(orderId, input = {}) {
  const repository = input.pickupCredentialRepository;
  const now = input.now || new Date().toISOString();
  if (repository?.kind === "postgres") {
    return repository.getCredentialForOrder({ orderId, now });
  }
  const database = openDatabase();
  try {
    const row = database.prepare(`
      SELECT
        credential.*,
        orders.pickup_status,
        orders.payment_status,
        activity.status AS activity_status,
        store.id AS store_id,
        store.name AS store_name
      FROM pickup_credentials credential
      JOIN orders ON orders.id = credential.order_id
      JOIN group_buy_activities activity ON activity.id = orders.activity_id
      JOIN stores store ON store.id = activity.store_id
      WHERE credential.order_id = ?
    `).get(orderId);
    return row ? mapCredential(row, row, now) : null;
  } finally {
    database.close();
  }
}

async function lookupPickupCode(input = {}) {
  return accessPickupCode(input, false);
}

async function redeemPickupCode(input = {}) {
  const pickupCode = normalizeCode(input.pickupCode);
  const repository = input.pickupCredentialRepository;
  if (!pickupCode || repository?.kind === "postgres") {
    return accessPickupCode(input, true);
  }
  try {
    return withOperationLeaseSync({
      lockKey: `pickup:code:${pickupCode}:redeem`,
      leaseMs: 120_000,
      now: input.now
    }, () => accessPickupCode(input, true));
  } catch (error) {
    if (error instanceof OperationLeaseError) {
      return {
        error: "operation_locked",
        lockKey: error.lock.lockKey,
        lockedUntil: error.lock.lockedUntil
      };
    }
    throw error;
  }
}

async function accessPickupCode(input, shouldRedeem) {
  const actorUserId = input.actorUserId || null;
  const now = input.now || new Date().toISOString();
  const limited = getRateLimit(actorUserId, now);
  if (limited) return limited;

  const pickupCode = normalizeCode(input.pickupCode);
  if (!pickupCode) {
    recordFailure(actorUserId, now);
    return { error: "pickup_code_invalid" };
  }

  const repository = input.pickupCredentialRepository;
  if (repository?.kind === "postgres") {
    return accessPickupCodePostgres(repository, { pickupCode, actorUserId, now }, shouldRedeem);
  }

  const database = openDatabase();
  let transactionStarted = false;
  try {
    if (shouldRedeem) {
      database.exec("BEGIN IMMEDIATE;");
      transactionStarted = true;
    }

    const row = findMerchantCredential(database, pickupCode, actorUserId);
    if (!row) {
      if (transactionStarted) database.exec("ROLLBACK;");
      transactionStarted = false;
      recordFailure(actorUserId, now);
      return { error: "credential_not_found" };
    }

    clearFailures(actorUserId);
    const credential = mapMerchantCredential(row, now);
    if (!shouldRedeem) return { credential };

    const stateError = getRedemptionError(credential);
    if (stateError) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return { error: stateError, credential };
    }

    const credentialUpdate = database.prepare(`
      UPDATE pickup_credentials
      SET redeemed_at = ?, redeemed_by_user_id = ?
      WHERE id = ? AND redeemed_at IS NULL AND expired_at IS NULL
    `).run(now, actorUserId, row.id);
    if (credentialUpdate.changes !== 1) {
      database.exec("ROLLBACK;");
      transactionStarted = false;
      return { error: "credential_already_changed" };
    }

    const orderUpdate = database.prepare(`
      UPDATE orders
      SET status = 'completed', pickup_status = 'picked_up', updated_at = ?
      WHERE id = ?
        AND payment_status = 'captured'
        AND pickup_status = 'ready'
        AND status != 'cancelled'
    `).run(now, row.order_id);
    if (orderUpdate.changes !== 1) {
      throw new Error("Pickup order changed before redemption: " + row.order_id);
    }

    const insertHistory = database.prepare(`
      INSERT INTO status_history (
        id, resource_type, resource_id, from_status, to_status, reason, actor_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertHistory.run(
      "status-history-" + randomUUID(),
      "pickup",
      row.order_id,
      row.pickup_status,
      "picked_up",
      "merchant_redeemed_pickup_code",
      actorUserId,
      now
    );
    if (row.order_status !== "completed") {
      insertHistory.run(
        "status-history-" + randomUUID(),
        "order",
        row.order_id,
        row.order_status,
        "completed",
        "merchant_redeemed_pickup_code",
        actorUserId,
        now
      );
    }

    const remaining = database.prepare(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE activity_id = ?
        AND payment_status = 'captured'
        AND status != 'cancelled'
        AND pickup_status IN ('not_ready', 'ready')
    `).get(row.activity_id);

    let activityCompleted = false;
    if (Number(remaining.count) === 0) {
      const update = database.prepare(`
        UPDATE group_buy_activities
        SET status = 'completed', updated_at = ?
        WHERE id = ? AND status = 'ready_for_pickup'
      `).run(now, row.activity_id);
      if (update.changes === 1) {
        activityCompleted = true;
        insertHistory.run(
          "status-history-" + randomUUID(),
          "activity",
          row.activity_id,
          row.activity_status,
          "completed",
          "all_captured_orders_picked_up",
          actorUserId,
          now
        );
      }
    }

    database.prepare(`
      INSERT INTO audit_logs (
        id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
      ) VALUES (?, ?, 'merchant_redeem_pickup_code', 'order', ?, ?, ?)
    `).run(
      "audit-log-" + randomUUID(),
      actorUserId,
      row.order_id,
      JSON.stringify({ pickupCredentialId: row.id, activityCompleted }),
      now
    );

    database.exec("COMMIT;");
    transactionStarted = false;
    return {
      status: "redeemed",
      activityCompleted,
      credential: {
        ...credential,
        status: "redeemed",
        pickupStatus: "picked_up",
        orderStatus: "completed",
        redeemedAt: now
      }
    };
  } catch (error) {
    if (transactionStarted) database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }
}

async function accessPickupCodePostgres(repository, { pickupCode, actorUserId, now }, shouldRedeem) {
  const operation = () => (shouldRedeem
    ? repository.redeemCode({ pickupCode, actorUserId, now })
    : repository.lookupCode({ pickupCode, actorUserId, now }));
  try {
    const result = shouldRedeem
      ? await repository.withOperationLock({ pickupCode, now }, operation)
      : await operation();
    if (result?.error === "credential_not_found") {
      recordFailure(actorUserId, now);
    } else {
      clearFailures(actorUserId);
    }
    return result;
  } catch (error) {
    if (error?.code === "operation_locked") {
      return {
        error: "operation_locked",
        lockKey: error.lock?.lockKey,
        lockedUntil: error.lock?.lockedUntil
      };
    }
    throw error;
  }
}

function findMerchantCredential(database, pickupCode, actorUserId) {
  return database.prepare(`
    SELECT
      credential.*,
      orders.status AS order_status,
      orders.pickup_status,
      orders.payment_status,
      orders.total_cups,
      orders.final_amount,
      orders.activity_id,
      activity.status AS activity_status,
      activity.title AS activity_title,
      activity.pickup_start_at,
      activity.pickup_end_at,
      store.id AS store_id,
      store.name AS store_name,
      customer.display_name AS customer_display_name,
      customer.login_name AS customer_login_name
    FROM pickup_credentials credential
    JOIN orders ON orders.id = credential.order_id
    JOIN group_buy_activities activity ON activity.id = orders.activity_id
    JOIN stores store ON store.id = activity.store_id
    JOIN users customer ON customer.id = orders.customer_user_id
    JOIN merchant_users merchant_user ON merchant_user.merchant_id = store.merchant_id
    WHERE credential.pickup_code = ?
      AND merchant_user.user_id = ?
      AND merchant_user.status = 'active'
    ORDER BY
      CASE WHEN credential.redeemed_at IS NULL AND credential.expired_at IS NULL THEN 0 ELSE 1 END,
      credential.created_at DESC
    LIMIT 1
  `).get(pickupCode, actorUserId);
}

function generateAvailableCode(database) {
  const exists = database.prepare(`
    SELECT 1
    FROM pickup_credentials
    WHERE pickup_code = ? AND redeemed_at IS NULL AND expired_at IS NULL
    LIMIT 1
  `);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!exists.get(code)) return code;
  }
  throw new Error("Unable to allocate a unique pickup code");
}

function mapCredential(row, context, now) {
  const status = getCredentialStatus({ ...row, ...context }, now);
  return {
    id: row.id,
    orderId: row.order_id,
    pickupCode: status === "active" ? row.pickup_code : null,
    status,
    pickupStatus: context.pickup_status,
    expiresAt: row.expires_at,
    expiredAt: row.expired_at,
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
    store: row.store_id ? { id: row.store_id, name: row.store_name } : null
  };
}

function mapMerchantCredential(row, now) {
  return {
    ...mapCredential(row, row, now),
    pickupCode: row.pickup_code,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    totalCups: row.total_cups,
    finalAmount: row.final_amount,
    activity: {
      id: row.activity_id,
      title: row.activity_title,
      status: row.activity_status,
      pickupStartAt: row.pickup_start_at,
      pickupEndAt: row.pickup_end_at
    },
    customerDisplayName: row.customer_display_name || row.customer_login_name || null
  };
}

function getCredentialStatus(row, now) {
  if (row.redeemed_at || row.pickup_status === "picked_up") return "redeemed";
  if (row.expired_at || row.pickup_status === "expired" || !isBefore(now, row.expires_at)) {
    return "expired";
  }
  if (row.payment_status === "captured"
    && row.pickup_status === "ready"
    && row.activity_status === "ready_for_pickup") {
    return "active";
  }
  return "unavailable";
}

function getRedemptionError(credential) {
  if (credential.status === "redeemed") return "credential_already_redeemed";
  if (credential.status === "expired") return "credential_expired";
  if (credential.status !== "active") return "order_not_ready_for_pickup";
  return null;
}

function isBefore(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return !Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime < rightTime;
}

function normalizeCode(value) {
  const code = String(value || "").trim();
  return /^\d{6}$/.test(code) ? code : null;
}

function getRateLimit(actorUserId, now) {
  if (!actorUserId) return { error: "merchant_user_required" };
  const nowTime = Date.parse(now);
  const state = failedAttempts.get(actorUserId);
  if (!state || Number.isNaN(nowTime)) return null;
  if (state.blockedUntil > nowTime) {
    return {
      error: "pickup_code_rate_limited",
      retryAfterSeconds: Math.max(Math.ceil((state.blockedUntil - nowTime) / 1000), 1)
    };
  }
  if (nowTime - state.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(actorUserId);
  }
  return null;
}

function recordFailure(actorUserId, now) {
  if (!actorUserId) return;
  const nowTime = Date.parse(now);
  if (Number.isNaN(nowTime)) return;

  const current = failedAttempts.get(actorUserId);
  const state = !current || nowTime - current.windowStartedAt >= ATTEMPT_WINDOW_MS
    ? { failures: 0, windowStartedAt: nowTime, blockedUntil: 0 }
    : current;
  state.failures += 1;
  if (state.failures >= MAX_FAILED_ATTEMPTS) {
    state.blockedUntil = nowTime + BLOCK_DURATION_MS;
  }
  failedAttempts.set(actorUserId, state);
}

function clearFailures(actorUserId) {
  if (actorUserId) failedAttempts.delete(actorUserId);
}

module.exports = {
  getPickupCredentialForOrder,
  lookupPickupCode,
  markGroupBuyActivityReadyForPickup,
  redeemPickupCode
};
