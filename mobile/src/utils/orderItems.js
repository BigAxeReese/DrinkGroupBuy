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
