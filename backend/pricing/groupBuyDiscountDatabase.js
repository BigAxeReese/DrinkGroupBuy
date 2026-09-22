"use strict";

const { calculateMinimumSellableUnitPrice } = require("./groupBuyDiscount");

// Still used by the activity-creation path (db.js) to reject activities on stores with no
// priced/valid menu -- an orthogonal concern to tier math, unaffected by the amount->percent
// change (a percentage discount doesn't depend on menu prices at all, see groupBuyDiscount.js).
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

module.exports = {
  getStoreDiscountPricingContext
};
