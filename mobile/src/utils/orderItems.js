// Converts one raw backend order item (customizations as a flat array of
// {optionType, label, ...} rows) into the flattened {size, sweetness, ice, toppings} shape the
// rest of the mobile UI expects. Distinct from normalizeOrderItem below, which normalizes the
// mobile app's own cart-item shape (already flat) and does not read a customizations array.
export function toLocalOrderItem(item) {
  return {
    id: item.id,
    drinkId: item.menuItemId,
    itemName: item.itemName,
    name: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    size: item.customizations?.find((customization) => customization.optionType === "size")?.label ?? "L",
    sweetness: item.customizations?.find((customization) => customization.optionType === "sweetness")?.label ?? "",
    ice: item.customizations?.find((customization) => customization.optionType === "ice")?.label ?? "",
    toppings: (item.customizations || [])
      .filter((customization) => customization.optionType === "topping")
      .map((customization) => customization.label),
    customizationOptionIds: (item.customizations || [])
      .map((customization) => customization.customizationOptionId)
      .filter(Boolean)
  };
}

export function normalizeOrderItem(item) {
  const itemName = item.itemName ?? item.name ?? "";
  return {
    ...item,
    drinkId: item.drinkId ?? item.menuItemId ?? item.id,
    name: item.name ?? itemName,
    itemName,
    size: item.size ?? "L",
    unitPrice: item.unitPrice ?? (item.quantity > 0 ? Math.round(item.subtotal / item.quantity) : item.subtotal),
    toppings: item.toppings ?? []
  };
}

export function summarizeOrderItems(items) {
  return {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.subtotal, 0),
    firstItemName: items[0]?.itemName ?? items[0]?.name ?? ""
  };
}

export function formatOrderItemCustomizations(item, options = {}) {
  const { separator = " · ", noToppingsLabel = "" } = options;
  const toppings = item.toppings?.length ? item.toppings.join("、") : noToppingsLabel;
  return [item.size, item.sweetness, item.ice, toppings].filter(Boolean).join(separator);
}
