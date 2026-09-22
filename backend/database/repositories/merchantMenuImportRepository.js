"use strict";

const { randomUUID } = require("node:crypto");
const { createRuntimeDatabaseAdapter } = require("..");
const { validatePostgresActiveStoreDiscountPricing } = require("./merchantMenuRepository");

// Postgres-only, same reasoning as merchantApplicationRepository.js: this is a brand-new admin
// tool with no legacy SQLite path to preserve, and the project's runtime has already permanently
// switched to PostgreSQL (see AGENTS.md).
//
// Replacing an existing menu never hard-deletes the old rows: order_items, cart_draft_items, and
// order_revision_items all reference menu_items(id) with no ON DELETE clause (see
// database/schema.sql), so a real DELETE would throw a foreign-key violation for any store that
// has ever taken an order -- and even for a store that hasn't, deleting would erase provenance for
// no benefit. Instead, every currently-available item is retired (is_available = false) and the
// submitted list is inserted fresh; from a customer's or merchant's point of view the menu looks
// fully replaced, while historical order rows keep a valid, undisturbed reference.
function createMerchantMenuImportRepository(input = {}) {
  const ownsDatabase = !input.database;
  const database = input.database || createRuntimeDatabaseAdapter({ ...input, runtime: "postgres" });
  return {
    kind: "postgres",
    importMenuItems: (value) => importMenuItemsPostgres(database, value),
    close: async () => {
      if (ownsDatabase) await database.close();
    },
  };
}

class MenuImportRejected extends Error {
  constructor(result) {
    super(result.error || "menu_import_rejected");
    this.result = result;
  }
}

async function importMenuItemsPostgres(database, input = {}) {
  const now = input.now || new Date().toISOString();

  try {
    return await database.transaction(async (transaction) => {
      const storeResult = await transaction.query(
        "SELECT id FROM stores WHERE id = $1 FOR UPDATE", [input.storeId]
      );
      if (!storeResult.rows[0]) return { error: "store_not_found" };

      const retiredResult = await transaction.query(`
        UPDATE menu_items SET is_available = false, updated_at = $2
        WHERE store_id = $1 AND is_available = true
        RETURNING id
      `, [input.storeId, now]);
      const retiredMenuItemIds = retiredResult.rows.map((row) => row.id);

      const createdMenuItemIds = [];
      for (const item of input.items) {
        const menuItemId = `menu-item-${randomUUID()}`;
        await transaction.query(`
          INSERT INTO menu_items (
            id, store_id, name, category, description, base_price,
            is_available, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        `, [
          menuItemId, input.storeId, item.name, item.category,
          item.description || null, Number(item.basePrice), Boolean(item.isAvailable), now,
        ]);

        for (const group of item.customizationGroups) {
          await transaction.query(`
            INSERT INTO menu_item_customization_rules (
              menu_item_id, option_type, min_selections, max_selections, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $5)
          `, [menuItemId, group.optionType, Number(group.minSelections), Number(group.maxSelections), now]);

          for (const [index, option] of group.options.entries()) {
            await transaction.query(`
              INSERT INTO customization_options (
                id, menu_item_id, option_type, label, price_delta, sort_order, is_available
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              `customization-option-${randomUUID()}`, menuItemId, group.optionType,
              option.label, Number(option.priceDelta), index, Boolean(option.isAvailable),
            ]);
          }
        }

        createdMenuItemIds.push(menuItemId);
      }

      // Same guard the merchant's own single-item self-service edit already runs
      // (merchantMenuRepository.js) -- a store can have an active group-buy activity whose
      // promotion tiers assumed the OLD menu's prices; replacing the menu must not silently
      // leave that activity's discount configuration inconsistent with the new pricing.
      const discountValidation = await validatePostgresActiveStoreDiscountPricing(transaction, input.storeId);
      if (!discountValidation.valid) {
        throw new MenuImportRejected({ error: "menu_discount_conflict", ...discountValidation });
      }

      await transaction.query(`
        INSERT INTO audit_logs (
          id, actor_user_id, action_type, resource_type, resource_id, metadata_json, created_at
        ) VALUES ($1, $2, 'admin_import_menu_items', 'store', $3, $4::jsonb, $5)
      `, [
        `audit-log-${randomUUID()}`, input.actorUserId || null, input.storeId,
        JSON.stringify({
          menuItemIds: createdMenuItemIds,
          importedCount: createdMenuItemIds.length,
          retiredMenuItemIds,
          retiredCount: retiredMenuItemIds.length,
        }), now,
      ]);

      return { menuItemIds: createdMenuItemIds, retiredCount: retiredMenuItemIds.length };
    });
  } catch (error) {
    if (error instanceof MenuImportRejected) return error.result;
    throw error;
  }
}

module.exports = {
  createMerchantMenuImportRepository,
};
