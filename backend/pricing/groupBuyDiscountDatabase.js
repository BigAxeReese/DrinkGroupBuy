"use strict";

const {
  calculateDiscountPerCup,
  calculateMinimumSellableUnitPrice,
  findOrderDiscountConflicts,
  validateDiscountTierConfiguration
} = require("./groupBuyDiscount");

function getStoreDiscountPricingContext(database, storeId) {
  const menuItems = database.prepare(`
    SELECT id, base_price, is_available
    FROM menu_items
    WHERE store_id = ?
      AND is_available = 1
    ORDER BY id
  `).all(storeId);
  if (menuItems.length === 0) {
    return { menuItemCount: 0, minimumSellableUnitPrice: null };
  }

  const rules = database.prepare(`
    SELECT rule.menu_item_id, rule.option_type, rule.min_selections, rule.max_selections
    FROM menu_item_customization_rules rule
    JOIN menu_items item ON item.id = rule.menu_item_id
    WHERE item.store_id = ?
  `).all(storeId);
  const options = database.prepare(`
    SELECT option.menu_item_id, option.option_type, option.price_delta, option.is_available
    FROM customization_options option
    JOIN menu_items item ON item.id = option.menu_item_id
    WHERE item.store_id = ?
  `).all(storeId);

  const normalizedItems = menuItems.map((item) => {
    const itemRules = rules.filter((rule) => rule.menu_item_id === item.id);
    const itemOptions = options.filter((option) => option.menu_item_id === item.id);
    const optionTypes = new Set([
      ...itemRules.map((rule) => rule.option_type),
      ...itemOptions.map((option) => option.option_type)
    ]);
    return {
      id: item.id,
      basePrice: item.base_price,
      isAvailable: item.is_available === 1,
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
              isAvailable: option.is_available === 1
            }))
        };
      })
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
      minimumSellableUnitPrice: null
    };
  }

  return {
    menuItemCount: normalizedItems.length,
    minimumSellableUnitPrice: calculateMinimumSellableUnitPrice(normalizedItems)
  };
}

function getActivityDiscountTiers(database, activityId) {
  return database.prepare(`
    SELECT id, target_cups, discount_amount, sort_order
    FROM promotion_tiers
    WHERE activity_id = ?
    ORDER BY target_cups ASC, sort_order ASC
  `).all(activityId);
}

function getActivityMaximumDiscountPerCup(database, activityId) {
  return getActivityDiscountTiers(database, activityId).reduce(
    (maximum, tier) => Math.max(
      maximum,
      calculateDiscountPerCup(tier.discount_amount, tier.target_cups)
    ),
    0
  );
}

function validateOrderItemsForActivityDiscount(database, activityId, items) {
  const maximumDiscountPerCup = getActivityMaximumDiscountPerCup(database, activityId);
  const issues = findOrderDiscountConflicts(items, maximumDiscountPerCup);
  if (issues.length === 0) {
    return { valid: true, maximumDiscountPerCup };
  }
  return {
    valid: false,
    error: "order_discount_conflict",
    reason: "order_unit_price_below_maximum_discount_per_cup",
    activityId,
    maximumDiscountPerCup,
    issues
  };
}

function validateActiveStoreDiscountPricing(database, storeId) {
  const menuPricing = getStoreDiscountPricingContext(database, storeId);
  if (menuPricing.menuItemCount === 0) return { valid: true, skipped: "store_menu_empty" };
  if (menuPricing.error) {
    return {
      valid: false,
      error: "menu_discount_conflict",
      reason: menuPricing.error,
      menuItemId: menuPricing.menuItemId
    };
  }

  const activities = database.prepare(`
    SELECT id, maximum_cups
    FROM group_buy_activities
    WHERE store_id = ?
      AND status IN ('recruiting', 'confirmed')
    ORDER BY created_at ASC
  `).all(storeId);

  for (const activity of activities) {
    const validation = validateDiscountTierConfiguration({
      tiers: getActivityDiscountTiers(database, activity.id),
      maximumCups: activity.maximum_cups,
      minimumSellableUnitPrice: menuPricing.minimumSellableUnitPrice
    });
    if (!validation.valid) {
      return {
        ...validation,
        error: "menu_discount_conflict",
        activityId: activity.id,
        minimumSellableUnitPrice: menuPricing.minimumSellableUnitPrice
      };
    }
  }

  return {
    valid: true,
    minimumSellableUnitPrice: menuPricing.minimumSellableUnitPrice,
    activityCount: activities.length
  };
}

module.exports = {
  getActivityDiscountTiers,
  getActivityMaximumDiscountPerCup,
  getStoreDiscountPricingContext,
  validateActiveStoreDiscountPricing,
  validateOrderItemsForActivityDiscount
};
