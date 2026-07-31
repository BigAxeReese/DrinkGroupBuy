"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const {
  calculateGroupBuyDiscountSummary,
  calculateMinimumSellableUnitPrice,
  normalizeDiscountTiers,
  validateDiscountTierConfiguration,
} = require("../../pricing/groupBuyDiscount");

function resolveGroupBuyActivityWriteRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.GROUP_BUY_ACTIVITY_WRITE_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported GROUP_BUY_ACTIVITY_WRITE_RUNTIME: ${runtime}`);
}

function createGroupBuyActivityWriteRepository(input = {}) {
  const runtime = resolveGroupBuyActivityWriteRuntime(input);
  if (runtime === "sqlite") {
    if (typeof input.sqliteWriter !== "function") {
      throw new Error(
        "sqliteWriter is required when GROUP_BUY_ACTIVITY_WRITE_RUNTIME=sqlite"
      );
    }
    return {
      kind: "sqlite",
      createActivity: async (activityInput) => input.sqliteWriter(activityInput),
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
    createActivity: (activityInput) => createPostgresGroupBuyActivity(database, activityInput),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function createPostgresGroupBuyActivity(database, input) {
  const now = new Date().toISOString();
  const activityId = `activity-${randomUUID()}`;
  const idempotencyKey = input.idempotencyKey || null;
  let tiers = normalizeWriteTiers(input.tiers);

  return database.transaction(async (transaction) => {
    const storeResult = await transaction.query(`
      SELECT id, merchant_id, name, address, latitude, longitude
      FROM stores
      WHERE id = $1
      FOR UPDATE
    `, [input.storeId]);
    const store = storeResult.rows[0];
    if (!store) {
      return { error: "store_access_denied", storeId: input.storeId };
    }

    const accessResult = await transaction.query(`
      SELECT merchant_user.id
      FROM merchant_users merchant_user
      JOIN users user_account ON user_account.id = merchant_user.user_id
      JOIN user_roles user_role
        ON user_role.user_id = user_account.id
       AND user_role.role = 'merchant'
       AND user_role.status = 'active'
      WHERE merchant_user.user_id = $1
        AND merchant_user.store_id = $2
        AND merchant_user.status = 'active'
        AND user_account.status = 'active'
      FOR UPDATE OF merchant_user, user_account, user_role
    `, [input.createdByUserId, input.storeId]);
    if (!accessResult.rows[0]) {
      return { error: "store_access_denied", storeId: input.storeId };
    }

    if (idempotencyKey) {
      const existingResult = await transaction.query(`
        SELECT audit_log.resource_id
        FROM audit_logs audit_log
        JOIN group_buy_activities activity
          ON activity.id = audit_log.resource_id
        WHERE audit_log.actor_user_id = $1
          AND activity.store_id = $2
          AND audit_log.action_type = 'merchant_create_group_buy_activity'
          AND audit_log.metadata_json->>'idempotencyKey' = $3
        ORDER BY audit_log.created_at DESC
        LIMIT 1
      `, [input.createdByUserId, input.storeId, idempotencyKey]);
      if (existingResult.rows[0]?.resource_id) {
        return readPostgresGroupBuyActivityById(
          transaction,
          existingResult.rows[0].resource_id
        );
      }
    }

    const menuPricing = await getLockedPostgresStoreDiscountPricingContext(
      transaction,
      input.storeId
    );
    if (menuPricing.error || menuPricing.menuItemCount === 0) {
      return {
        error: "discount_menu_invalid",
        reason: menuPricing.error || "store_menu_empty",
        storeId: input.storeId,
      };
    }
    const tierValidation = validateDiscountTierConfiguration({
      tiers,
      maximumCups: tiers.at(-1)?.targetCups,
      minimumSellableUnitPrice: menuPricing.minimumSellableUnitPrice,
    });
    if (!tierValidation.valid) return tierValidation;
    tiers = tierValidation.tiers.map((tier, index) => ({
      ...tier,
      id: `tier-${randomUUID()}`,
      sortOrder: index,
    }));

    await transaction.query(`
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
      ) VALUES ($1, $2, $3, $4, 'recruiting', $5, $6, $7, $8, $9, $10, $11, $11)
    `, [
      activityId,
      input.storeId,
      input.createdByUserId,
      input.title,
      input.startAt,
      input.deadlineAt,
      input.pickupStartAt,
      input.pickupEndAt,
      tiers.at(-1).targetCups,
      input.withdrawalLockMinutes ?? 30,
      now,
    ]);

    for (const tier of tiers) {
      await transaction.query(`
        INSERT INTO promotion_tiers (
          id, activity_id, target_cups, discount_amount, sort_order
        ) VALUES ($1, $2, $3, $4, $5)
      `, [tier.id, activityId, tier.targetCups, tier.discountAmount, tier.sortOrder]);
    }

    if (input.notice) {
      await transaction.query(`
        INSERT INTO activity_notices (id, activity_id, content, sort_order)
        VALUES ($1, $2, $3, 0)
      `, [`notice-${randomUUID()}`, activityId, input.notice]);
    }

    await transaction.query(`
      INSERT INTO status_history (
        id,
        resource_type,
        resource_id,
        from_status,
        to_status,
        reason,
        actor_user_id,
        created_at
      ) VALUES ($1, 'activity', $2, NULL, 'recruiting', $3, $4, $5)
    `, [
      `status-history-${randomUUID()}`,
      activityId,
      "Merchant created group-buy activity.",
      input.createdByUserId,
      now,
    ]);

    await transaction.query(`
      INSERT INTO audit_logs (
        id,
        actor_user_id,
        action_type,
        resource_type,
        resource_id,
        metadata_json,
        created_at
      ) VALUES ($1, $2, 'merchant_create_group_buy_activity', 'activity', $3, $4::jsonb, $5)
    `, [
      `audit-log-${randomUUID()}`,
      input.createdByUserId,
      activityId,
      JSON.stringify({
        idempotencyKey,
        minimumSellableUnitPrice: menuPricing.minimumSellableUnitPrice,
        discountRanges: tierValidation.ranges,
      }),
      now,
    ]);

    return readPostgresGroupBuyActivityById(transaction, activityId);
  });
}

async function getLockedPostgresStoreDiscountPricingContext(transaction, storeId) {
  const menuResult = await transaction.query(`
    SELECT id, base_price, is_available
    FROM menu_items
    WHERE store_id = $1
    ORDER BY id
    FOR SHARE
  `, [storeId]);
  const activeMenuItems = menuResult.rows.filter((item) => item.is_available === true);
  if (activeMenuItems.length === 0) {
    return { menuItemCount: 0, minimumSellableUnitPrice: null };
  }

  const menuItemIds = menuResult.rows.map((item) => item.id);
  const [rulesResult, optionsResult] = await Promise.all([
    transaction.query(`
      SELECT menu_item_id, option_type, min_selections, max_selections
      FROM menu_item_customization_rules
      WHERE menu_item_id = ANY($1::text[])
      ORDER BY menu_item_id, option_type
      FOR SHARE
    `, [menuItemIds]),
    transaction.query(`
      SELECT menu_item_id, option_type, price_delta, is_available
      FROM customization_options
      WHERE menu_item_id = ANY($1::text[])
      ORDER BY menu_item_id, option_type, sort_order, id
      FOR SHARE
    `, [menuItemIds]),
  ]);

  const normalizedItems = activeMenuItems.map((item) => {
    const itemRules = rulesResult.rows.filter((rule) => rule.menu_item_id === item.id);
    const itemOptions = optionsResult.rows.filter((option) => option.menu_item_id === item.id);
    const optionTypes = new Set([
      ...itemRules.map((rule) => rule.option_type),
      ...itemOptions.map((option) => option.option_type),
    ]);
    return {
      id: item.id,
      basePrice: item.base_price,
      isAvailable: true,
      customizationGroups: [...optionTypes].map((optionType) => {
        const rule = itemRules.find((candidate) => candidate.option_type === optionType);
        return {
          optionType,
          minSelections: rule?.min_selections ?? 0,
          maxSelections: rule?.max_selections ?? 1,
          options: itemOptions
            .filter((option) => option.option_type === optionType)
            .map((option) => ({
              priceDelta: option.price_delta,
              isAvailable: option.is_available === true,
            })),
        };
      }),
    };
  });
  const invalidItem = normalizedItems.find(
    (item) => calculateMinimumSellableUnitPrice([item]) == null
  );
  if (invalidItem) {
    return {
      error: "menu_item_minimum_price_invalid",
      menuItemId: invalidItem.id,
      menuItemCount: normalizedItems.length,
      minimumSellableUnitPrice: null,
    };
  }
  return {
    menuItemCount: normalizedItems.length,
    minimumSellableUnitPrice: calculateMinimumSellableUnitPrice(normalizedItems),
  };
}

async function readPostgresGroupBuyActivityById(database, activityId) {
  const [activityResult, tiersResult, progressResult] = await Promise.all([
    database.query(`
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
        store_record.name AS store_name,
        store_record.address AS store_address,
        store_record.latitude,
        store_record.longitude
      FROM group_buy_activities activity
      JOIN stores store_record ON store_record.id = activity.store_id
      WHERE activity.id = $1
    `, [activityId]),
    database.query(`
      SELECT id, activity_id, target_cups, discount_amount, sort_order
      FROM promotion_tiers
      WHERE activity_id = $1
      ORDER BY target_cups ASC
    `, [activityId]),
    database.query(`
      SELECT
        COALESCE(SUM(total_cups), 0) AS authorized_cups,
        COUNT(*) AS participant_count
      FROM orders
      WHERE activity_id = $1
        AND payment_status IN ('authorized', 'captured')
        AND status NOT IN ('cancelled')
    `, [activityId]),
  ]);
  const row = activityResult.rows[0];
  if (!row) return null;
  const activityTiers = tiersResult.rows.map((tier) => ({
    id: tier.id,
    targetCups: tier.target_cups,
    cups: tier.target_cups,
    discountAmount: tier.discount_amount,
    sortOrder: tier.sort_order,
  }));
  const authorizedCups = Number(progressResult.rows[0]?.authorized_cups ?? 0);
  const participantCount = Number(progressResult.rows[0]?.participant_count ?? 0);
  const discountSummary = calculateGroupBuyDiscountSummary(activityTiers, authorizedCups);
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
    startAt: toIsoString(row.start_at),
    deadlineAt: toIsoString(row.deadline_at),
    pickupStartAt: toIsoString(row.pickup_start_at),
    pickupEndAt: toIsoString(row.pickup_end_at),
    maximumCups: row.maximum_cups,
    targetCups: firstTargetCups,
    currentCups: authorizedCups,
    authorizedCups,
    participantCount,
    ...discountSummary,
    withdrawalLockMinutes: row.withdrawal_lock_minutes,
    cancellationReason: row.cancellation_reason,
    store: {
      name: row.store_name,
      address: row.store_address,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    tiers: activityTiers,
  };
}

function normalizeWriteTiers(tiers) {
  const source = Array.isArray(tiers) && tiers.length > 0
    ? tiers
    : [{ targetCups: 20, discountAmount: 200 }];
  return normalizeDiscountTiers(source, { preserveInvalid: true });
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

module.exports = {
  createGroupBuyActivityWriteRepository,
  createPostgresGroupBuyActivity,
  getLockedPostgresStoreDiscountPricingContext,
  readPostgresGroupBuyActivityById,
  resolveGroupBuyActivityWriteRuntime,
};
