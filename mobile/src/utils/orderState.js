import { normalizeOrderItem, summarizeOrderItems } from "./orderItems";

export function buildOrderItemsChange({ order, nextItems }) {
  const normalizedItems = nextItems.map((item) => normalizeOrderItem(item));
  const summary = summarizeOrderItems(normalizedItems);
  const wasCounted = ["authorized", "captured"].includes(order.paymentStatus);
  const itemName = summary.firstItemName
    ? normalizedItems.length > 1
      ? `${summary.firstItemName} 等 ${normalizedItems.length} 項`
      : summary.firstItemName
    : "";

  return {
    normalizedItems,
    wasCounted,
    orderPatch: {
      itemName,
      items: normalizedItems,
      quantity: summary.quantity,
      subtotal: summary.subtotal,
      originalAmount: summary.subtotal,
      authorizedAmount: 0,
      finalAmount: null,
      captureAmount: null,
      releasedAmount: null,
      paymentStatus: "pending",
      authorizationStatus: wasCounted ? "authorization_voided" : "pending",
      merchantAcceptanceStatus: "pending",
      reauthorizationReason: "order_amount_changed"
    },
    paymentPatch: {
      originalAmount: summary.subtotal,
      authorizedAmount: 0,
      finalAmount: null,
      captureAmount: null,
      releasedAmount: null,
      status: "pending",
      paymentStatus: "pending",
      authorizationStatus: wasCounted ? "authorization_voided" : "pending",
      discountStatus: "not_yet_qualified",
      note: "Order amount changed. Reauthorization required."
    }
  };
}

export function rollbackAuthorizedCups(deal, order) {
  return {
    ...deal,
    currentCups: Math.max(0, deal.currentCups - order.quantity),
    participantCount: Math.max(0, deal.participantCount - 1),
    status: "recruiting"
  };
}
