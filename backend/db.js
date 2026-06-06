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
      input.maximumCups ?? tiers[tiers.length - 1].targetCups,
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

module.exports = {
  cancelGroupBuyActivity,
  createGroupBuyActivity,
  listGroupBuyActivities
};
