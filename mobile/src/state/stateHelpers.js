import { formatDeadlineLabel, formatPickupTimeRangeLabel, getMinutesUntilDeadline } from "../utils/deadlineTime";
import { toLocalOrderItem } from "../utils/orderItems";

// Pure helpers used by AppStateProvider.jsx, extracted verbatim from the old AppNavigator.js.

export function toBackendOrderItems(orderItems) {
  return orderItems.map((item) => ({
    menuItemId: item.drinkId,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    customizationOptionIds: item.customizationOptionIds,
    size: item.size,
    sweetness: item.sweetness,
    ice: item.ice,
    toppings: item.toppings
  }));
}

export function isSameCartItemVariant(a, b) {
  return a.drinkId === b.drinkId
    && a.groupBuyActivityId === b.groupBuyActivityId
    && a.customerId === b.customerId
    && a.targetOrderId === b.targetOrderId
    && a.size === b.size
    && a.sweetness === b.sweetness
    && a.ice === b.ice
    // A unitPrice mismatch (e.g. the menu price changed between two adds in the same
    // session) means these aren't really "identical" any more -- stacking them onto one
    // line would silently apply whichever price happened to be on the existing line to
    // the whole combined quantity, over- or under-charging for the newer half.
    && a.unitPrice === b.unitPrice
    && sameToppingSet(a.toppings, b.toppings);
}

function sameToppingSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((label, index) => label === sortedB[index]);
}

export function normalizeBackendSettlement(settlement) {
  if (!settlement) return null;
  return {
    id: settlement.id,
    activityId: settlement.activityId,
    outcome: settlement.outcome,
    authorizedCups: Number(settlement.authorizedCups ?? 0),
    appliedTierId: settlement.appliedTierId ?? null,
    totalDiscountAmount: Number(settlement.totalDiscountAmount ?? 0),
    discountPercent: settlement.discountPercent == null ? null : Number(settlement.discountPercent),
    discountFunder: settlement.discountFunder ?? "merchant",
    calculationVersion: settlement.calculationVersion ?? null,
    settledAt: settlement.settledAt ?? null,
    reason: settlement.reason ?? null
  };
}

export function normalizeBackendGroupBuyActivity(activity, existingActivity = {}) {
  const tiers = (activity?.tiers ?? existingActivity.tiers ?? []).map((tier) => ({
    id: tier.id ?? null,
    cups: Number(tier.targetCups ?? tier.cups),
    targetCups: Number(tier.targetCups ?? tier.cups),
    discountPercent: Number(tier.discountPercent),
    sortOrder: tier.sortOrder
  }));
  const currentCups = Number(
    activity?.authorizedCups ?? activity?.currentCups ?? existingActivity.currentCups ?? 0
  );
  const deadlineAt = activity?.deadlineAt ?? existingActivity.deadlineAt;
  const minutesUntilDeadline = getMinutesUntilDeadline({ deadlineAt });
  const status = activity?.status ?? existingActivity.status ?? "recruiting";
  const pickupStartAt = activity?.pickupStartAt ?? existingActivity.pickupStartAt;
  const pickupEndAt = activity?.pickupEndAt ?? existingActivity.pickupEndAt;

  return {
    ...existingActivity,
    id: activity?.id ?? existingActivity.id,
    storeId: activity?.storeId ?? existingActivity.storeId,
    store: activity?.store ?? existingActivity.store,
    storeName: activity?.store?.name ?? existingActivity.storeName,
    title: activity?.title ?? existingActivity.title,
    status,
    rawStatus: activity?.rawStatus ?? existingActivity.rawStatus ?? status,
    startTime: activity?.startAt ?? existingActivity.startTime,
    deadlineAt,
    endTime: deadlineAt ? formatDeadlineLabel(deadlineAt) : existingActivity.endTime,
    pickupStartAt,
    pickupEndAt,
    pickupTime: pickupStartAt && pickupEndAt
      ? formatPickupTimeRangeLabel(pickupStartAt, pickupEndAt)
      : existingActivity.pickupTime,
    maximumCups: activity?.maximumCups ?? existingActivity.maximumCups ?? tiers[tiers.length - 1]?.targetCups ?? 0,
    targetCups: activity?.targetCups ?? existingActivity.targetCups ?? tiers[0]?.targetCups ?? 0,
    currentCups,
    authorizedCups: currentCups,
    participantCount: Number(activity?.participantCount ?? existingActivity.participantCount ?? 0),
    currentTierId: activity?.currentTierId ?? null,
    currentTierTargetCups: activity?.currentTierTargetCups ?? null,
    currentTierDiscountPercent: Number(activity?.currentTierDiscountPercent ?? 0),
    nextTierTargetCups: activity?.nextTierTargetCups ?? null,
    cupsToNextTier: Number(activity?.cupsToNextTier ?? 0),
    discountSummaryAuthorizedCups: currentCups,
    settlement: normalizeBackendSettlement(activity?.settlement),
    withdrawalLockMinutes: activity?.withdrawalLockMinutes ?? existingActivity.withdrawalLockMinutes ?? 30,
    cancellationReason: activity?.cancellationReason ?? existingActivity.cancellationReason ?? null,
    minutesUntilDeadline,
    remainingTimeText: minutesUntilDeadline == null
      ? existingActivity.remainingTimeText
      : minutesUntilDeadline <= 0 ? "已截止" : `剩 ${minutesUntilDeadline} 分鐘`,
    canJoin: ["recruiting", "confirmed"].includes(status)
      && (minutesUntilDeadline == null || minutesUntilDeadline > 0)
      && !activity?.cancellationReason,
    tiers,
    notices: activity?.notices ?? existingActivity.notices ?? []
  };
}

export function buildLocalOrderFromBackend({
  backendOrder,
  existingOrder,
  selectedCustomerId,
  authorizedAmount,
  pendingRevision,
  pendingRevisionItems
}) {
  const localItems = backendOrder.items?.map(toLocalOrderItem) ?? existingOrder?.items ?? [];
  const firstItem = localItems[0] ?? {};

  return {
    ...existingOrder,
    id: backendOrder.id,
    customerId: existingOrder?.customerId ?? selectedCustomerId,
    customerDisplayName: backendOrder.customerDisplayName ?? existingOrder?.customerDisplayName,
    submittedAt: backendOrder.submittedAt ?? existingOrder?.submittedAt,
    groupBuyActivityId: backendOrder.activityId,
    status: backendOrder.status,
    itemName: localItems.length > 1 ? `${firstItem.itemName || "飲料"} 等 ${localItems.length} 項` : firstItem.itemName || existingOrder?.itemName || "飲料訂單",
    items: localItems,
    quantity: backendOrder.totalCups,
    sweetness: firstItem.sweetness ?? existingOrder?.sweetness ?? "",
    ice: firstItem.ice ?? existingOrder?.ice ?? "",
    toppings: firstItem.toppings ?? existingOrder?.toppings ?? [],
    subtotal: backendOrder.originalAmount,
    originalAmount: backendOrder.originalAmount,
    authorizedAmount,
    finalAmount: backendOrder.finalAmount,
    manualRepayment: backendOrder.manualRepayment,
    paymentStatus: backendOrder.paymentStatus,
    authorizationStatus: backendOrder.authorizationStatus,
    merchantAcceptanceStatus: backendOrder.merchantAcceptanceStatus,
    pickupStatus: backendOrder.pickupStatus,
    fallbackPurchasePreference: backendOrder.fallbackPurchasePreference ?? existingOrder?.fallbackPurchasePreference,
    pendingRevisionId: pendingRevision?.id ?? null,
    pendingRevisionAmount: pendingRevision?.originalAmount ?? null,
    pendingRevisionItems,
    pendingRevisionTotalCups: pendingRevision?.totalCups ?? null,
    reauthorizationReason: pendingRevision ? "order_amount_changed" : null
  };
}

export function buildLocalPaymentFromBackend({
  backendOrder,
  existingPayment,
  backendActivity,
  authorization,
  capture,
  authorizedAmount,
  pendingRevision,
  pendingRevisionItems
}) {
  return {
    ...existingPayment,
    id: existingPayment?.id ?? `payment-${backendOrder.id}`,
    orderId: backendOrder.id,
    status: pendingRevision ? "pending" : backendOrder.paymentStatus,
    paymentStatus: pendingRevision ? "pending" : backendOrder.paymentStatus,
    authorizationStatus: pendingRevision ? "pending" : backendOrder.authorizationStatus,
    originalAmount: pendingRevision?.originalAmount ?? backendOrder.originalAmount,
    authorizedAmount: pendingRevision ? 0 : authorizedAmount,
    finalAmount: backendOrder.finalAmount,
    captureAmount: capture?.captureAmount ?? existingPayment?.captureAmount ?? null,
    releasedAmount: capture?.releasedAmount ?? existingPayment?.releasedAmount ?? null,
    provider: authorization?.provider ?? existingPayment?.provider ?? "line_pay",
    providerReference: authorization?.providerAuthorizationId ?? existingPayment?.providerReference ?? null,
    recipientName: existingPayment?.recipientName ?? backendActivity?.storeName ?? "LINE Pay",
    pendingRevisionId: pendingRevision?.id ?? null,
    revisionAmount: pendingRevision?.originalAmount ?? null,
    revisionItems: pendingRevisionItems,
    note: "Synced from backend order state."
  };
}

export function mergeBackendOrderList(
  backendOrders,
  customerId,
  setOrders,
  setPayments,
  setActivities,
  replaceOrderIds = new Set()
) {
  const mappedOrders = backendOrders.map((order) => ({
    ...buildLocalOrderFromBackend({
      backendOrder: order,
      selectedCustomerId: customerId
        || localCustomerIdsByBackendId[order.customerUserId]
        || order.customerUserId,
      authorizedAmount: order.latestLinePayAuthorization?.authorizedAmount ?? order.originalAmount,
      pendingRevision: order.pendingRevision,
      pendingRevisionItems: order.pendingRevision?.items?.map(toLocalOrderItem) ?? null
    }),
    lifecycleBucket: order.lifecycleBucket,
    availableActions: order.availableActions,
    backendStore: order.store,
    pickupCredential: order.pickupCredential
  }));
  const orderIds = new Set(mappedOrders.map((order) => order.id));
  setOrders((current) => [...current.filter((order) => (
    !orderIds.has(order.id) && !replaceOrderIds.has(order.id)
  )), ...mappedOrders]);
  const mappedPayments = backendOrders.map((order) => buildLocalPaymentFromBackend({
    backendOrder: order,
    backendActivity: order.activity,
    authorization: order.latestLinePayAuthorization,
    capture: order.latestPaymentCapture,
    authorizedAmount: order.latestLinePayAuthorization?.authorizedAmount ?? order.originalAmount,
    pendingRevision: order.pendingRevision,
    pendingRevisionItems: order.pendingRevision?.items?.map(toLocalOrderItem) ?? null
  }));
  const paymentOrderIds = new Set(mappedPayments.map((payment) => payment.orderId));
  setPayments((current) => [...current.filter((payment) => (
    !paymentOrderIds.has(payment.orderId) && !replaceOrderIds.has(payment.orderId)
  )), ...mappedPayments]);
  setActivities((current) => {
    const next = [...current];
    for (const order of backendOrders) {
      const activity = { ...order.activity, storeId: order.store.id };
      const index = next.findIndex((item) => item.id === activity.id);
      if (index >= 0) next[index] = { ...next[index], ...activity };
      else next.push(activity);
    }
    return next;
  });
}

const backendCustomerUserIds = {
  "customer-yinji": "user-customer-yinji",
  "customer-bolun": "user-customer-bolun",
  "customer-lixuan": "user-customer-lixuan",
  "customer-jingwei": "user-customer-jingwei"
};
const localCustomerIdsByBackendId = Object.fromEntries(
  Object.entries(backendCustomerUserIds).map(([localId, backendId]) => [backendId, localId])
);
