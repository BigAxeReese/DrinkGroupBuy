"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const {
  validateDiscountTierConfiguration,
} = require("../../pricing/groupBuyDiscount");
const {
  getLockedPostgresStoreDiscountPricingContext,
} = require("./groupBuyActivityWriteRepository");
const { getPostgresStoreMenu } = require("./storeMenuReadRepository");

function resolveMerchantMenuRuntime(input = {}) {
  const env = input.env || process.env;
  const runtime = String(input.runtime || env.MERCHANT_MENU_RUNTIME || "sqlite")
    .trim()
    .toLowerCase();
  if (runtime === "sqlite") return "sqlite";
  if (runtime === "postgres" || runtime === "postgresql") return "postgres";
  throw new Error(`Unsupported MERCHANT_MENU_RUNTIME: ${runtime}`);
}

function createMerchantMenuRepository(input = {}) {
  const runtime = resolveMerchantMenuRuntime(input);
  if (runtime === "sqlite") {
    if (typeof input.sqliteReader !== "function") {
      throw new Error("sqliteReader is required when MERCHANT_MENU_RUNTIME=sqlite");
    }
    if (typeof input.sqliteWriter !== "function") {
      throw new Error("sqliteWriter is required when MERCHANT_MENU_RUNTIME=sqlite");
    }
    return {
      kind: "sqlite",
      getStoreMenu: async (storeId) => (
        input.sqliteReader(storeId, { includeUnavailable: true })
      ),
      saveMenuItem: async (menuItemInput) => input.sqliteWriter(menuItemInput),
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
    getStoreMenu: (storeId) => (
      getPostgresStoreMenu(database, storeId, { includeUnavailable: true })
    ),
    saveMenuItem: (menuItemInput) => savePostgresMerchantMenuItem(database, menuItemInput),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

async function savePostgresMerchantMenuItem(database, input) {
  const now = input.now || new Date().toISOString();
  const menuItemId = input.menuItemId || `menu-item-${randomUUID()}`;
  const creating = !input.menuItemId;

  try {
    return await database.transaction(async (transaction) => {
      const storeResult = await transaction.query(`
        SELECT id
        FROM stores
        WHERE id = $1
        FOR UPDATE
      `, [input.storeId]);
      if (!storeResult.rows[0]) return { error: "store_not_found" };

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
        FOR SHARE OF merchant_user, user_account, user_role
      `, [input.actorUserId, input.storeId]);
      if (!accessResult.rows[0]) {
        return { error: "store_access_denied", storeId: input.storeId };
      }

      const existingItemResult = await transaction.query(`
        SELECT id, store_id
        FROM menu_items
        WHERE id = $1
        FOR UPDATE
      `, [menuItemId]);
      const existingItem = existingItemResult.rows[0];
      if (!creating && !existingItem) return { error: "menu_item_not_found" };
      if (existingItem && existingItem.store_id !== input.storeId) {
        return { error: "menu_item_store_mismatch" };
      }

      if (creating) {
        await transaction.query(`
          INSERT INTO menu_items (
            id, store_id, name, category, description, base_price,
            is_available, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        `, [
          menuItemId,
          input.storeId,
          input.name,
          input.category,
          input.description || null,
          Number(input.basePrice),
          Boolean(input.isAvailable),
          now,
        ]);
      } else {
        await transaction.query(`
          UPDATE menu_items
          SET name = $1,
              category = $2,
              description = $3,
              base_price = $4,
              is_available = $5,
              updated_at = $6
          WHERE id = $7
            AND store_id = $8
        `, [
          input.name,
          input.category,
          input.description || null,
          Number(input.basePrice),
          Boolean(input.isAvailable),
          now,
          menuItemId,
          input.storeId,
        ]);
      }

      const existingOptionsResult = await transaction.query(`
        SELECT id, option_type
        FROM customization_options
        WHERE menu_item_id = $1
        ORDER BY id
        FOR UPDATE
      `, [menuItemId]);
      const existingOptions = existingOptionsResult.rows;

      for (const group of input.customizationGroups) {
        await transaction.query(`
          INSERT INTO menu_item_customization_rules (
            menu_item_id, option_type, min_selections, max_selections,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT(menu_item_id, option_type) DO UPDATE SET
            min_selections = excluded.min_selections,
            max_selections = excluded.max_selections,
            updated_at = excluded.updated_at
        `, [
          menuItemId,
          group.optionType,
          Number(group.minSelections),
          Number(group.maxSelections),
          now,
        ]);

        const submittedOptionIds = new Set();
        for (const [index, option] of group.options.entries()) {
          const optionId = option.id || `customization-option-${randomUUID()}`;
          const existingOption = existingOptions.find((item) => item.id === optionId);
          if (option.id) {
            const optionWithSameIdResult = await transaction.query(`
              SELECT id, menu_item_id
              FROM customization_options
              WHERE id = $1
              FOR UPDATE
            `, [optionId]);
            const optionWithSameId = optionWithSameIdResult.rows[0];
            if (optionWithSameId && optionWithSameId.menu_item_id !== menuItemId) {
              rejectWrite({ error: "customization_option_item_mismatch", optionId });
            }
          }
          if (existingOption && existingOption.option_type !== group.optionType) {
            rejectWrite({ error: "customization_option_type_mismatch", optionId });
          }

          submittedOptionIds.add(optionId);
          if (existingOption) {
            await transaction.query(`
              UPDATE customization_options
              SET option_type = $1,
                  label = $2,
                  price_delta = $3,
                  sort_order = $4,
                  is_available = $5
              WHERE id = $6
                AND menu_item_id = $7
            `, [
              group.optionType,
              option.label,
              Number(option.priceDelta),
              index,
              Boolean(option.isAvailable),
              optionId,
              menuItemId,
            ]);
          } else {
            await transaction.query(`
              INSERT INTO customization_options (
                id, menu_item_id, option_type, label,
                price_delta, sort_order, is_available
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              optionId,
              menuItemId,
              group.optionType,
              option.label,
              Number(option.priceDelta),
              index,
              Boolean(option.isAvailable),
            ]);
            existingOptions.push({ id: optionId, option_type: group.optionType });
          }
        }

        const omittedOptionIds = existingOptions
          .filter((option) => option.option_type === group.optionType)
          .filter((option) => !submittedOptionIds.has(option.id))
          .map((option) => option.id);
        if (omittedOptionIds.length > 0) {
          await transaction.query(`
            UPDATE customization_options
            SET is_available = false
            WHERE menu_item_id = $1
              AND id = ANY($2::text[])
          `, [menuItemId, omittedOptionIds]);
        }
      }

      const discountValidation = await validatePostgresActiveStoreDiscountPricing(
        transaction,
        input.storeId
      );
      if (!discountValidation.valid) rejectWrite(discountValidation);

      await transaction.query(`
        INSERT INTO audit_logs (
          id, actor_user_id, action_type, resource_type,
          resource_id, metadata_json, created_at
        ) VALUES ($1, $2, $3, 'menu_item', $4, $5::jsonb, $6)
      `, [
        `audit-log-${randomUUID()}`,
        input.actorUserId,
        creating ? "merchant_create_menu_item" : "merchant_update_menu_item",
        menuItemId,
        JSON.stringify({
          storeId: input.storeId,
          isAvailable: Boolean(input.isAvailable),
        }),
        now,
      ]);

      const menu = await getPostgresStoreMenu(transaction, input.storeId, {
        includeUnavailable: true,
      });
      return {
        menuItem: menu.menuItems.find((item) => item.id === menuItemId),
      };
    });
  } catch (error) {
    if (error instanceof MerchantMenuWriteRejected) return error.result;
    throw error;
  }
}

class MerchantMenuWriteRejected extends Error {
  constructor(result) {
    super(result.error || "merchant_menu_write_rejected");
    this.result = result;
  }
}

function rejectWrite(result) {
  throw new MerchantMenuWriteRejected(result);
}

async function validatePostgresActiveStoreDiscountPricing(database, storeId) {
  const menuPricing = await getLockedPostgresStoreDiscountPricingContext(
    database,
    storeId
  );
  if (menuPricing.menuItemCount === 0) {
    return { valid: true, skipped: "store_menu_empty" };
  }
  if (menuPricing.error) {
    return {
      valid: false,
      error: "menu_discount_conflict",
      reason: menuPricing.error,
      menuItemId: menuPricing.menuItemId,
    };
  }
  const { minimumSellableUnitPrice } = menuPricing;
  const activitiesResult = await database.query(`
    SELECT id, maximum_cups
    FROM group_buy_activities
    WHERE store_id = $1
      AND status IN ('recruiting', 'confirmed')
    ORDER BY created_at ASC
  `, [storeId]);

  for (const activity of activitiesResult.rows) {
    const tiersResult = await database.query(`
      SELECT id, target_cups, discount_amount, sort_order
      FROM promotion_tiers
      WHERE activity_id = $1
      ORDER BY target_cups ASC, sort_order ASC
    `, [activity.id]);
    const validation = validateDiscountTierConfiguration({
      tiers: tiersResult.rows,
      maximumCups: activity.maximum_cups,
      minimumSellableUnitPrice,
    });
    if (!validation.valid) {
      return {
        ...validation,
        error: "menu_discount_conflict",
        activityId: activity.id,
        minimumSellableUnitPrice,
      };
    }
  }

  return {
    valid: true,
    minimumSellableUnitPrice,
    activityCount: activitiesResult.rows.length,
  };
}

module.exports = {
  createMerchantMenuRepository,
  resolveMerchantMenuRuntime,
  savePostgresMerchantMenuItem,
  validatePostgresActiveStoreDiscountPricing,
};
