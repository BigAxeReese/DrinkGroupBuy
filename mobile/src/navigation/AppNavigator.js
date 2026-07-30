import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, View, StyleSheet } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { groupBuyActivities as initialGroupBuyActivities } from "../mock/groupBuyActivities";
import { orders as initialOrders } from "../mock/orders";
import { paymentAuthorizations as initialPaymentAuthorizations } from "../mock/paymentAuthorizations";
import { RoleSelectScreen } from "../screens/RoleSelectScreen";
import { NearbyGroupBuyActivitiesScreen } from "../screens/NearbyGroupBuyActivitiesScreen";
import { GroupBuyActivityDetailScreen } from "../screens/GroupBuyActivityDetailScreen";
import { DrinkSelectionScreen } from "../screens/DrinkSelectionScreen";
import { GroupProgressScreen } from "../screens/GroupProgressScreen";
import { PaymentAuthorizationScreen } from "../screens/PaymentAuthorizationScreen";
import { PickupInfoScreen } from "../screens/PickupInfoScreen";
import { MerchantGroupBuyActivityCreateScreen } from "../screens/MerchantGroupBuyActivityCreateScreen";
import { MerchantDashboardScreen } from "../screens/MerchantDashboardScreen";
import { MerchantMenuManagementScreen } from "../screens/MerchantMenuManagementScreen";
import { CustomerPlaceholderScreen } from "../screens/CustomerPlaceholderScreen";
import { CustomerOrdersScreen } from "../screens/CustomerOrdersScreen";
import { AdminDashboardScreen } from "../screens/AdminDashboardScreen";
import { CartScreen } from "../screens/CartScreen";
import { LiveMapScreen } from "../screens/LiveMapScreen";
import { StoreMenuScreen } from "../screens/StoreMenuScreen";
import { formatDeadlineLabel, getMinutesUntilDeadline, isDeadlineReached } from "../utils/deadlineTime";
import { getGroupBuyActivityCapacityInfo, wouldExceedGroupBuyActivityCapacity } from "../utils/groupBuyActivityProgress";
import { normalizeOrderItem } from "../utils/orderItems";
import { buildOrderItemsChange, rollbackAuthorizedCups } from "../utils/orderState";
import { clearPrototypeStateOnce, loadPrototypeState, savePrototypeState } from "../utils/prototypeStorage";
import {
  cancelOrder as cancelOrderApi,
  createOrder,
  createOrderRevision,
  getOrder,
  getPickupCredential as fetchPickupCredential,
  listCustomerOrders as fetchCustomerOrders,
  listGroupBuyActivities,
  listMerchantStoreOrders as fetchMerchantStoreOrders,
  lookupPickupCredential as lookupPickupCredentialApi,
  markGroupBuyActivityReadyForPickup,
  redeemPickupCredential as redeemPickupCredentialApi,
  updateOrder
} from "../utils/apiClient";

const initialRoute = { name: "roleSelect", params: {} };
const backendCustomerUserIds = {
  "customer-yinji": "user-customer-yinji",
  "customer-bolun": "user-customer-bolun",
  "customer-lixuan": "user-customer-lixuan",
  "customer-jingwei": "user-customer-jingwei"
};
const localCustomerIdsByBackendId = Object.fromEntries(
  Object.entries(backendCustomerUserIds).map(([localId, backendId]) => [backendId, localId])
);

function toBackendOrderItems(orderItems) {
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

function toLocalOrderItem(item) {
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

function getStoredArray(storedState, key, legacyKey, fallback) {
  if (Array.isArray(storedState[key])) return storedState[key];
  if (legacyKey && Array.isArray(storedState[legacyKey])) return storedState[legacyKey];
  return fallback;
}

function normalizeBackendGroupBuyActivity(activity, existingActivity = {}) {
  const tiers = (activity?.tiers ?? existingActivity.tiers ?? []).map((tier) => ({
    id: tier.id ?? null,
    cups: Number(tier.targetCups ?? tier.cups),
    targetCups: Number(tier.targetCups ?? tier.cups),
    discountAmount: Number(tier.discountAmount),
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
      ? `${pickupStartAt} - ${pickupEndAt}`
      : existingActivity.pickupTime,
    maximumCups: activity?.maximumCups ?? existingActivity.maximumCups ?? tiers[tiers.length - 1]?.targetCups ?? 0,
    targetCups: activity?.targetCups ?? existingActivity.targetCups ?? tiers[0]?.targetCups ?? 0,
    currentCups,
    authorizedCups: currentCups,
    participantCount: Number(activity?.participantCount ?? existingActivity.participantCount ?? 0),
    currentTierId: activity?.currentTierId ?? null,
    currentTierTargetCups: activity?.currentTierTargetCups ?? null,
    currentTierDiscountAmount: Number(activity?.currentTierDiscountAmount ?? 0),
    estimatedDiscountPerCup: Number(activity?.estimatedDiscountPerCup ?? 0),
    estimatedAllocatedDiscountAmount: Number(activity?.estimatedAllocatedDiscountAmount ?? 0),
    estimatedUndistributedDiscountAmount: Number(activity?.estimatedUndistributedDiscountAmount ?? 0),
    nextTierTargetCups: activity?.nextTierTargetCups ?? null,
    cupsToNextTier: Number(activity?.cupsToNextTier ?? 0),
    discountSummaryAuthorizedCups: currentCups,
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
function normalizeStoredOrder(order) {
  if (!order || typeof order !== "object") return order;
  return {
    ...order,
    groupBuyActivityId: order.groupBuyActivityId ?? order.dealId ?? order.activityId
  };
}

function normalizeStoredCartItem(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    groupBuyActivityId: item.groupBuyActivityId ?? item.dealId ?? item.activityId
  };
}

function buildLocalOrderFromBackend({
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

function buildLocalPaymentFromBackend({
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

function mergeBackendOrderList(
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

function parseLinePayResultDeepLink(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = parsedUrl.protocol.replace(":", "");
  const host = parsedUrl.hostname;
  const path = parsedUrl.pathname.replace(/^\/+/, "");
  const isPaymentResult = scheme === "drinkgroupbuy"
    && (
      (host === "payment" && path === "result")
      || path === "payment/result"
    );
  if (!isPaymentResult) return null;

  const orderId = parsedUrl.searchParams.get("orderId");
  if (!orderId) return null;

  return {
    orderId,
    status: parsedUrl.searchParams.get("status"),
    paymentFlow: parsedUrl.searchParams.get("paymentFlow"),
    transactionId: parsedUrl.searchParams.get("transactionId"),
    error: parsedUrl.searchParams.get("error")
  };
}

export function AppNavigator() {
  const [stack, setStack] = useState([initialRoute]);
  const [currentRole, setCurrentRole] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("customer-yinji");
  const [selectedMerchantStoreId, setSelectedMerchantStoreId] = useState("store-001");
  const [groupBuyActivities, setGroupBuyActivities] = useState(initialGroupBuyActivities);
  const [groupBuyActivitySyncStatus, setGroupBuyActivitySyncStatus] = useState("idle");
  const [orders, setOrders] = useState(initialOrders);
  const [paymentAuthorizations, setPaymentAuthorizations] = useState(initialPaymentAuthorizations);
  // Prototype only, not final API contract. Cart contents are saved locally when available.
  const [cartItems, setCartItems] = useState([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const handledDeepLinkRef = useRef(null);
  const current = stack[stack.length - 1];

  useEffect(() => {
    clearPrototypeStateOnce("2026-07-29-clear-all-group-buys-orders-cart");
    const storedState = loadPrototypeState();
    if (storedState) {
      setGroupBuyActivities(getStoredArray(storedState, "groupBuyActivities", "deals", initialGroupBuyActivities));
      setOrders(getStoredArray(storedState, "orders", null, initialOrders).map(normalizeStoredOrder));
      setPaymentAuthorizations(getStoredArray(storedState, "paymentAuthorizations", "paymentReports", initialPaymentAuthorizations));
      setCartItems(getStoredArray(storedState, "cartItems", null, []).map(normalizeStoredCartItem));
    }
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    savePrototypeState({
      groupBuyActivities,
      orders,
      paymentAuthorizations,
      cartItems
    });
  }, [cartItems, groupBuyActivities, orders, paymentAuthorizations, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return undefined;

    function lockExpiredOrders() {
      const now = new Date();
      const expiredGroupBuyActivityIds = new Set(
        groupBuyActivities
          .filter((groupBuyActivity) => isDeadlineReached(groupBuyActivity, now))
          .map((groupBuyActivity) => groupBuyActivity.id)
      );

      setGroupBuyActivities((items) => items.map((groupBuyActivity) => {
        const minutesUntilDeadline = getMinutesUntilDeadline(groupBuyActivity, now);
        if (minutesUntilDeadline == null) return groupBuyActivity;

        const expired = minutesUntilDeadline <= 0;
        const nextStatus = expired && ["recruiting", "confirmed"].includes(groupBuyActivity.status)
          ? "ordering"
          : groupBuyActivity.status;
        const nextCanJoin = expired ? false : groupBuyActivity.canJoin;
        const nextRemainingTimeText = expired ? "已截止" : `剩 ${minutesUntilDeadline} 分鐘`;

        if (
          groupBuyActivity.minutesUntilDeadline === minutesUntilDeadline
          && groupBuyActivity.status === nextStatus
          && groupBuyActivity.canJoin === nextCanJoin
          && groupBuyActivity.remainingTimeText === nextRemainingTimeText
        ) {
          return groupBuyActivity;
        }

        return {
          ...groupBuyActivity,
          minutesUntilDeadline,
          remainingTimeText: nextRemainingTimeText,
          canJoin: nextCanJoin,
          status: nextStatus
        };
      }));

      if (expiredGroupBuyActivityIds.size === 0) return;
      setOrders((items) => items.map((order) => (
        expiredGroupBuyActivityIds.has(order.groupBuyActivityId)
          && !["cancelled", "completed", "locked"].includes(order.status)
          ? {
              ...order,
              status: "locked",
              lockedReason: "activity_deadline_reached"
            }
          : order
      )));
    }

    lockExpiredOrders();
    const intervalId = setInterval(lockExpiredOrders, 30000);
    return () => clearInterval(intervalId);
  }, [groupBuyActivities, storageLoaded]);

  const navigation = useMemo(() => ({
    selectRole(role, routeName, params = {}) {
      setCurrentRole(role);
      if (role === "merchant" && params.storeId) {
        setSelectedMerchantStoreId(params.storeId);
      }
      if (role === "customer" && params.userId) {
        setSelectedCustomerId(params.userId);
      }
      setStack([{ name: routeName, params: {} }]);
    },
    go(name, params = {}) {
      setStack((items) => [...items, { name, params }]);
    },
    replace(name, params = {}) {
      setStack([{ name, params }]);
    },
    back() {
      setStack((items) => (items.length > 1 ? items.slice(0, -1) : items));
    }
  }), []);

  const actions = useMemo(() => ({
    async syncGroupBuyActivities() {
      setGroupBuyActivitySyncStatus("loading");
      try {
        const backendActivities = await listGroupBuyActivities();
        setGroupBuyActivities((current) => backendActivities.map((activity) => (
          normalizeBackendGroupBuyActivity(
            activity,
            current.find((candidate) => candidate.id === activity.id)
          )
        )));
        setGroupBuyActivitySyncStatus("ready");
        return backendActivities;
      } catch (error) {
        setGroupBuyActivitySyncStatus("error");
        throw error;
      }
    },
    addToCart(cartItem) {
      setCartItems((items) => [
        ...items,
        {
          ...cartItem,
          customerId: selectedCustomerId,
          id: `cart-item-${Date.now()}-${items.length + 1}`
        }
      ]);
    },
    removeCartItem(cartItemId) {
      setCartItems((items) => items.filter((item) => item.id !== cartItemId));
    },
    async submitCart(groupBuyActivityId, fallbackPurchasePreference = "decline_original_price") {
      const submittedItems = cartItems.filter((item) => item.groupBuyActivityId === groupBuyActivityId && item.customerId === selectedCustomerId);
      if (submittedItems.length === 0) return null;

      const existingOrder = orders.find((order) => (
        order.customerId === selectedCustomerId
        && order.groupBuyActivityId === groupBuyActivityId
        && !["cancelled", "completed"].includes(order.status)
      ));
      const quantity = submittedItems.reduce((sum, item) => sum + item.quantity, 0);
      const groupBuyActivity = groupBuyActivities.find((item) => item.id === groupBuyActivityId);
      const capacityCheckQuantity = existingOrder && existingOrder.paymentStatus !== "pending"
        ? Math.max(0, quantity - (existingOrder.quantity ?? 0))
        : quantity;
      if (groupBuyActivity && wouldExceedGroupBuyActivityCapacity(groupBuyActivity, capacityCheckQuantity)) {
        return {
          error: "capacity_exceeded",
          message: `此團購最多 ${getGroupBuyActivityCapacityInfo(groupBuyActivity).maximumCups} 杯，已無法再加入 ${capacityCheckQuantity} 杯。`
        };
      }
      const subtotal = submittedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const firstItem = submittedItems[0];
      const orderItems = submittedItems.map((item) => normalizeOrderItem(item));
      const backendItems = toBackendOrderItems(orderItems);

      if (existingOrder) {
        if (existingOrder.paymentStatus !== "pending") {
          let revision;
          try {
            revision = await createOrderRevision(existingOrder.id, {
              fallbackPurchasePreference,
              items: backendItems
            });
          } catch (error) {
            return {
              error: "backend_order_revision_failed",
              message: error.message,
              orderId: existingOrder.id
            };
          }

          setOrders((items) => items.map((order) => (
            order.id === existingOrder.id
              ? {
                  ...order,
                  pendingRevisionId: revision.id,
                  pendingRevisionAmount: revision.originalAmount ?? subtotal,
                  pendingRevisionItems: orderItems,
                  pendingRevisionTotalCups: revision.totalCups ?? quantity,
                  reauthorizationReason: "order_amount_changed"
                }
              : order
          )));
          setPaymentAuthorizations((items) => items.map((report) => (
            report.orderId === existingOrder.id
              ? {
                  ...report,
                  pendingRevisionId: revision.id,
                  revisionAmount: revision.originalAmount ?? subtotal,
                  revisionItems: orderItems,
                  status: "pending",
                  paymentStatus: "pending",
                  authorizationStatus: "pending",
                  originalAmount: revision.originalAmount ?? subtotal,
                  authorizedAmount: 0,
                  finalAmount: null,
                  captureAmount: null,
                  releasedAmount: null,
                  discountStatus: "not_yet_qualified",
                  note: "Order revision requires replacement LINE Pay authorization."
                }
              : report
          )));
          return {
            orderId: existingOrder.id,
            orderRevisionId: revision.id,
            revisionAmount: revision.originalAmount ?? subtotal,
            revisionItems: orderItems
          };
        }

        if (existingOrder.paymentStatus !== "pending") {
          return {
            error: "existing_order_requires_payment",
            message: "此團購已有一筆已授權或已鎖定的訂單，目前尚未支援合併新飲料。請先查看既有訂單。",
            orderId: existingOrder.id
          };
        }

        let backendOrder;
        try {
          backendOrder = await updateOrder(existingOrder.id, {
            fallbackPurchasePreference,
            items: backendItems
          });
        } catch (error) {
          return {
            error: "backend_order_update_failed",
            message: error.message
          };
        }

        setOrders((items) => items.map((order) => (
          order.id === existingOrder.id
            ? {
                ...order,
                status: backendOrder.status,
                itemName: submittedItems.length > 1 ? `${firstItem.itemName} 等 ${submittedItems.length} 項` : firstItem.itemName,
                items: orderItems,
                quantity,
                sweetness: firstItem.sweetness,
                ice: firstItem.ice,
                toppings: firstItem.toppings,
                subtotal,
                originalAmount: subtotal,
                authorizedAmount: 0,
                finalAmount: null,
                captureAmount: null,
                releasedAmount: null,
                fallbackPurchasePreference,
                paymentStatus: backendOrder.paymentStatus,
                authorizationStatus: backendOrder.authorizationStatus,
                merchantAcceptanceStatus: backendOrder.merchantAcceptanceStatus,
                pickupStatus: backendOrder.pickupStatus,
                pendingRevisionId: null,
                pendingRevisionAmount: null,
                pendingRevisionItems: null,
                pendingRevisionTotalCups: null,
                reauthorizationReason: null
              }
            : order
        )));
        setPaymentAuthorizations((items) => items.map((report) => (
          report.orderId === existingOrder.id
            ? {
                ...report,
                originalAmount: subtotal,
                authorizedAmount: 0,
                finalAmount: null,
                captureAmount: null,
                releasedAmount: null,
                status: "pending",
                paymentStatus: backendOrder.paymentStatus,
                authorizationStatus: backendOrder.authorizationStatus,
                discountStatus: "not_yet_qualified",
                pendingRevisionId: null,
                revisionAmount: null,
                revisionItems: null,
                note: "Pending order updated from cart. Reauthorization required."
              }
            : report
        )));
        return existingOrder.id;
      }

      let backendOrder;
      try {
        backendOrder = await createOrder({
          activityId: groupBuyActivityId,
          customerUserId: backendCustomerUserIds[selectedCustomerId] ?? selectedCustomerId,
          fallbackPurchasePreference,
          items: backendItems
        });
      } catch (error) {
        return {
          error: "backend_order_create_failed",
          message: error.message
        };
      }

      const orderId = backendOrder.id;
      const newOrder = {
        id: orderId,
        customerId: selectedCustomerId,
        groupBuyActivityId,
        customerSurname: "測",
        itemName: submittedItems.length > 1 ? `${firstItem.itemName} 等 ${submittedItems.length} 項` : firstItem.itemName,
        items: orderItems,
        quantity,
        sweetness: firstItem.sweetness,
        ice: firstItem.ice,
        toppings: firstItem.toppings,
        subtotal,
        originalAmount: subtotal,
        authorizedAmount: 0,
        finalAmount: null,
        captureAmount: null,
        releasedAmount: null,
        fallbackPurchasePreference,
        status: "submitted",
        paymentStatus: "pending",
        authorizationStatus: "pending",
        merchantAcceptanceStatus: "pending",
        pickupStatus: "not_ready"
      };

      setOrders((items) => [...items, newOrder]);
      setPaymentAuthorizations((items) => [
        ...items,
        {
          orderId,
          originalAmount: subtotal,
          authorizedAmount: 0,
          finalAmount: null,
          captureAmount: null,
          releasedAmount: null,
          recipientName: firstItem.storeName,
          qrCodeLabel: "Line Pay QR code",
          status: "pending",
          paymentStatus: "pending",
          authorizationStatus: "pending",
          discountStatus: "not_yet_qualified",
          note: "Line Pay authorization prototype."
        }
      ]);
      return orderId;
    },
    async updateOrderItems(orderId, nextItems) {
      const orderToUpdate = orders.find((order) => order.id === orderId);
      if (!orderToUpdate) return;

      const nextOrderItems = nextItems.map((item) => normalizeOrderItem(item));
      if (orderToUpdate.paymentStatus !== "pending") {
        if (nextOrderItems.length === 0) return;

        const revisionAmount = nextOrderItems.reduce((sum, item) => sum + item.subtotal, 0);
        const revisionCups = nextOrderItems.reduce((sum, item) => sum + item.quantity, 0);
        let revision;
        try {
          revision = await createOrderRevision(orderId, {
            fallbackPurchasePreference: orderToUpdate.fallbackPurchasePreference ?? "decline_original_price",
            items: toBackendOrderItems(nextOrderItems)
          });
        } catch (error) {
          setOrders((items) => items.map((order) => (
            order.id === orderId
              ? {
                  ...order,
                  revisionError: error.message
                }
              : order
          )));
          return;
        }

        setOrders((items) => items.map((order) => (
          order.id === orderId
            ? {
                ...order,
                pendingRevisionId: revision.id,
                pendingRevisionAmount: revision.originalAmount ?? revisionAmount,
                pendingRevisionItems: nextOrderItems,
                pendingRevisionTotalCups: revision.totalCups ?? revisionCups,
                reauthorizationReason: "order_amount_changed",
                revisionError: null
              }
            : order
        )));
        setPaymentAuthorizations((items) => items.map((report) => (
          report.orderId === orderId
            ? {
                ...report,
                pendingRevisionId: revision.id,
                revisionAmount: revision.originalAmount ?? revisionAmount,
                revisionItems: nextOrderItems,
                originalAmount: revision.originalAmount ?? revisionAmount,
                authorizedAmount: 0,
                finalAmount: null,
                captureAmount: null,
                releasedAmount: null,
                status: "pending",
                paymentStatus: "pending",
                authorizationStatus: "pending",
                discountStatus: "not_yet_qualified",
                note: "Order revision requires replacement LINE Pay authorization."
              }
            : report
        )));
        return revision;
      }

      const change = buildOrderItemsChange({ order: orderToUpdate, nextItems });

      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              ...change.orderPatch
            }
          : order
      )));
      setPaymentAuthorizations((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              ...change.paymentPatch
            }
          : report
      )));
      if (change.wasCounted) {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
          groupBuyActivity.id === orderToUpdate.groupBuyActivityId
            ? rollbackAuthorizedCups(groupBuyActivity, orderToUpdate)
            : groupBuyActivity
        )));
      }
    },
    addItemToOrder(orderId, orderItem) {
      const orderToUpdate = orders.find((order) => order.id === orderId);
      if (!orderToUpdate) return;
      const change = buildOrderItemsChange({
        order: orderToUpdate,
        nextItems: [...(orderToUpdate.items ?? []), normalizeOrderItem(orderItem)]
      });

      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              ...change.orderPatch
            }
          : order
      )));
      setPaymentAuthorizations((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              ...change.paymentPatch
            }
          : report
      )));
      if (change.wasCounted) {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
          groupBuyActivity.id === orderToUpdate.groupBuyActivityId
            ? rollbackAuthorizedCups(groupBuyActivity, orderToUpdate)
            : groupBuyActivity
        )));
      }
    },
    authorizeLinePayPayment(orderId, providerReference = "linepay-auth") {
      const orderToAuthorize = orders.find((order) => order.id === orderId);
      const groupBuyActivityToAuthorize = orderToAuthorize ? groupBuyActivities.find((groupBuyActivity) => groupBuyActivity.id === orderToAuthorize.groupBuyActivityId) : null;
      const willQualify = Boolean(
        orderToAuthorize &&
        groupBuyActivityToAuthorize &&
        groupBuyActivityToAuthorize.currentCups + orderToAuthorize.quantity >= groupBuyActivityToAuthorize.targetCups
      );
      setPaymentAuthorizations((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              status: "authorized",
              paymentStatus: "authorized",
              authorizationStatus: "authorized",
              authorizedAmount: report.originalAmount,
              discountStatus: willQualify ? "qualified" : "not_yet_qualified",
              provider: "line_pay",
              providerReference
            }
          : report
      )));
      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              paymentStatus: "authorized",
              authorizationStatus: "authorized",
              authorizedAmount: order.originalAmount ?? order.subtotal,
              merchantAcceptanceStatus: "accepted",
              reauthorizationReason: null
            }
          : order
      )));
      if (orderToAuthorize && orderToAuthorize.paymentStatus === "pending") {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => {
          if (groupBuyActivity.id !== orderToAuthorize.groupBuyActivityId) return groupBuyActivity;
          const maximumCups = getGroupBuyActivityCapacityInfo(groupBuyActivity).maximumCups;
          const nextCups = Math.min(maximumCups, groupBuyActivity.currentCups + orderToAuthorize.quantity);
          return {
            ...groupBuyActivity,
            currentCups: nextCups,
            participantCount: groupBuyActivity.participantCount + 1,
            status: nextCups >= groupBuyActivity.targetCups ? "confirmed" : groupBuyActivity.status,
            canJoin: nextCups < maximumCups
          };
        }));
        setCartItems((items) => items.filter((item) => (
          item.groupBuyActivityId !== orderToAuthorize.groupBuyActivityId || item.customerId !== selectedCustomerId
        )));
      }
    },
    captureQualifiedPayment(orderId, captureAmount, providerReference = "linepay-capture") {
      setPaymentAuthorizations((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              status: "captured",
              paymentStatus: "captured",
              authorizationStatus: "captured",
              finalAmount: captureAmount,
              captureAmount,
              releasedAmount: Math.max(0, report.authorizedAmount - captureAmount),
              provider: "line_pay",
              providerReference
            }
          : report
      )));
      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              paymentStatus: "captured",
              authorizationStatus: "captured",
              finalAmount: captureAmount,
              captureAmount,
              releasedAmount: Math.max(0, order.authorizedAmount - captureAmount),
              merchantAcceptanceStatus: "accepted",
              pickupStatus: order.pickupStatus === "not_ready" ? "preparing" : order.pickupStatus
            }
          : order
      )));
    },
    async syncOrderFromBackend(orderId) {
      const backendOrder = await getOrder(orderId);
      let pickupCredential = null;
      if (["ready", "picked_up"].includes(backendOrder.pickupStatus)) {
        try {
          pickupCredential = await fetchPickupCredential(orderId);
        } catch {
          pickupCredential = undefined;
        }
      }

      const authorization = backendOrder.latestLinePayAuthorization;
      const capture = backendOrder.latestPaymentCapture;
      const authorizedAmount = authorization?.authorizedAmount ?? backendOrder.originalAmount;
      const backendActivities = await listGroupBuyActivities();
      const backendActivity = backendActivities.find((activity) => activity.id === backendOrder.activityId);
      const pendingRevision = backendOrder.pendingRevision ?? null;
      const pendingRevisionItems = pendingRevision?.items?.map(toLocalOrderItem) ?? null;

      setOrders((items) => {
        const existingOrder = items.find((order) => order.id === orderId);
        const syncedOrderBase = buildLocalOrderFromBackend({
          backendOrder,
          existingOrder,
          selectedCustomerId,
          authorizedAmount,
          pendingRevision,
          pendingRevisionItems
        });
        const syncedOrder = pickupCredential === undefined
          ? syncedOrderBase
          : { ...syncedOrderBase, pickupCredential };
        return existingOrder
          ? items.map((order) => (order.id === orderId ? syncedOrder : order))
          : [...items, syncedOrder];
      });
      setPaymentAuthorizations((items) => {
        const existingPayment = items.find((report) => report.orderId === orderId);
        const syncedPayment = buildLocalPaymentFromBackend({
          backendOrder,
          existingPayment,
          backendActivity,
          authorization,
          capture,
          authorizedAmount,
          pendingRevision,
          pendingRevisionItems
        });
        return existingPayment
          ? items.map((report) => (report.orderId === orderId ? syncedPayment : report))
          : [...items, syncedPayment];
      });
      if (backendActivity) {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
          groupBuyActivity.id === backendActivity.id
            ? normalizeBackendGroupBuyActivity(backendActivity, groupBuyActivity)
            : groupBuyActivity
        )));
      }
      if (["authorized", "captured"].includes(backendOrder.paymentStatus)) {
        setCartItems((items) => items.filter((item) => (
          item.groupBuyActivityId !== backendOrder.activityId || item.customerId !== selectedCustomerId
        )));
      }

      return { order: backendOrder, activity: backendActivity };
    },
    async syncCustomerOrderList(scope = "active") {
      const result = await fetchCustomerOrders({ scope, limit: 100 });
      const replacedOrderIds = new Set(orders
        .filter((order) => order.customerId === selectedCustomerId
          && (!order.lifecycleBucket || order.lifecycleBucket === scope))
        .map((order) => order.id));
      mergeBackendOrderList(
        result.orders,
        selectedCustomerId,
        setOrders,
        setPaymentAuthorizations,
        setGroupBuyActivities,
        replacedOrderIds
      );
      return result;
    },
    async syncMerchantOrderList(scope = "active") {
      const result = await fetchMerchantStoreOrders(selectedMerchantStoreId, { scope, limit: 100 });
      const storeActivityIds = new Set(groupBuyActivities
        .filter((activity) => activity.storeId === selectedMerchantStoreId)
        .map((activity) => activity.id));
      const replacedOrderIds = new Set(orders
        .filter((order) => storeActivityIds.has(order.groupBuyActivityId)
          && (!order.lifecycleBucket || order.lifecycleBucket === scope))
        .map((order) => order.id));
      mergeBackendOrderList(
        result.orders,
        null,
        setOrders,
        setPaymentAuthorizations,
        setGroupBuyActivities,
        replacedOrderIds
      );
      return result;
    },
    async cancelOrder(orderId) {
      const order = await cancelOrderApi(orderId, {
        reason: "customer_withdrawal",
        idempotencyKey: `customer-cancel-${orderId}`
      });
      setOrders((current) => current.map((item) => item.id === orderId
        ? { ...item, status: "cancelled", pickupStatus: "cancelled", lifecycleBucket: "history", availableActions: [] }
        : item));
      return order;
    },
    async markOrdersReadyForPickupForGroupBuyActivity(groupBuyActivityId) {
      const result = await markGroupBuyActivityReadyForPickup(groupBuyActivityId);
      const credentialByOrderId = new Map(
        (result.credentials || []).map((credential) => [credential.orderId, credential])
      );

      setOrders((items) => items.map((order) => {
        const pickupCredential = credentialByOrderId.get(order.id);
        return pickupCredential
          ? {
              ...order,
              pickupStatus: "ready",
              pickupCredential
            }
          : order;
      }));
      setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
        groupBuyActivity.id === groupBuyActivityId
          ? { ...groupBuyActivity, status: result.status }
          : groupBuyActivity
      )));
      return result;
    },
    lookupPickupCredential(pickupCode) {
      return lookupPickupCredentialApi(pickupCode);
    },
    async redeemPickupCredential(pickupCode) {
      const result = await redeemPickupCredentialApi(pickupCode);
      const credential = result.credential;

      setOrders((items) => items.map((order) => (
        order.id === credential.orderId
          ? {
              ...order,
              status: credential.orderStatus,
              pickupStatus: credential.pickupStatus,
              pickupCredential: credential
            }
          : order
      )));
      if (result.activityCompleted) {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
          groupBuyActivity.id === credential.activity.id
            ? { ...groupBuyActivity, status: "completed" }
            : groupBuyActivity
        )));
      }
      return result;
    },
    createMerchantGroupBuyActivity(form) {
      const groupBuyActivityId = `groupBuyActivity-merchant-${Date.now()}`;
      const normalizedTiers = (form.tiers || [])
        .map((tier) => ({
          cups: Number(tier.cups),
          discountAmount: Number(tier.discountAmount)
        }))
        .filter((tier) => tier.cups > 0 && tier.discountAmount > 0)
        .sort((left, right) => left.cups - right.cups);
      const promotionTiers = normalizedTiers.length > 0
        ? normalizedTiers
        : [{ cups: 20, discountAmount: 200 }];
      const newGroupBuyActivity = {
        id: groupBuyActivityId,
        storeId: form.storeId,
        title: form.title || "商家優惠活動",
        status: "recruiting",
        currentCups: 0,
        targetCups: promotionTiers[0].cups,
        maximumCups: promotionTiers[promotionTiers.length - 1].cups,
        participantCount: 0,
        remainingTimeText: "剛建立",
        minutesUntilDeadline: getMinutesUntilDeadline({ deadlineAt: form.deadlineAt }) ?? 120,
        withdrawalLockMinutes: 30,
        startTime: form.startTime || new Date().toISOString(),
        deadlineAt: form.deadlineAt,
        endTime: form.endTime || formatDeadlineLabel(form.deadlineAt),
        pickupTime: form.pickupTime || "今日 16:30 - 17:00",
        canJoin: true,
        tiers: promotionTiers,
        notices: [form.notices || "Prototype 建立活動，不會寫入後端。"]
      };
      setGroupBuyActivities((items) => [newGroupBuyActivity, ...items]);
      return groupBuyActivityId;
    },
    addMerchantGroupBuyActivityFromApi(activity) {
      const newGroupBuyActivity = normalizeBackendGroupBuyActivity(activity);
      setGroupBuyActivities((items) => [
        newGroupBuyActivity,
        ...items.filter((item) => item.id !== newGroupBuyActivity.id)
      ]);
      return newGroupBuyActivity.id;
    },
    cancelGroupBuyActivity(groupBuyActivityId, cancellationReason = "管理員刪除團購") {
      setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
        groupBuyActivity.id === groupBuyActivityId
          ? {
              ...groupBuyActivity,
              status: "cancelled",
              canJoin: false,
              cancellationReason
            }
            : groupBuyActivity
      )));
      setOrders((items) => items.map((order) => (
        order.groupBuyActivityId === groupBuyActivityId
          ? {
              ...order,
              status: "cancelled",
              pickupStatus: "cancelled",
              merchantAcceptanceStatus: "cancelled",
              cancellationReason
            }
          : order
      )));
    },
    cancelGroupBuyActivityFromApi(activity) {
      setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
        groupBuyActivity.id === activity.id
          ? {
              ...groupBuyActivity,
              status: activity.status,
              canJoin: activity.status === "recruiting",
              cancellationReason: activity.cancellationReason
            }
            : groupBuyActivity
      )));
      setOrders((items) => items.map((order) => (
        order.groupBuyActivityId === activity.id
          ? {
              ...order,
              status: "cancelled",
              pickupStatus: "cancelled",
              merchantAcceptanceStatus: "cancelled",
              cancellationReason: activity.cancellationReason
            }
          : order
      )));
    }
  }), [cartItems, groupBuyActivities, orders, selectedCustomerId, selectedMerchantStoreId]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!storageLoaded || !currentRole) return undefined;

    function syncBackendState() {
      actionsRef.current.syncGroupBuyActivities().catch(() => {});
      if (currentRole === "customer") actionsRef.current.syncCustomerOrderList("active").catch(() => {});
      if (currentRole === "merchant") actionsRef.current.syncMerchantOrderList("active").catch(() => {});
    }

    syncBackendState();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncBackendState();
    });
    return () => subscription.remove();
  }, [currentRole, selectedCustomerId, selectedMerchantStoreId, storageLoaded]);

  useEffect(() => {
    function handleIncomingUrl(rawUrl) {
      const deepLink = parseLinePayResultDeepLink(rawUrl);
      if (!deepLink) return;
      if (handledDeepLinkRef.current === rawUrl) return;
      handledDeepLinkRef.current = rawUrl;

      const mode = deepLink.paymentFlow === "direct_repayment" ? "manualRepayment" : undefined;
      navigation.replace("paymentAuthorization", {
        orderId: deepLink.orderId,
        mode,
        linePayResultStatus: deepLink.status,
        linePayPaymentFlow: deepLink.paymentFlow,
        linePayTransactionId: deepLink.transactionId,
        linePayError: deepLink.error
      });
      actions.syncOrderFromBackend(deepLink.orderId).catch(() => {
        // PaymentAuthorizationScreen still allows manual refresh when auth/session state is not ready.
      });
    }

    Linking.getInitialURL()
      .then(handleIncomingUrl)
      .catch(() => {});

    const subscription = Linking.addEventListener("url", (event) => {
      handleIncomingUrl(event.url);
    });

    return () => subscription?.remove?.();
  }, [actions, navigation]);

  const appState = {
    groupBuyActivities,
    groupBuyActivitySyncStatus,
    orders,
    paymentAuthorizations,
    cartItems
  };
  const screenProps = {
    navigation,
    route: current,
    appState,
    actions,
    currentRole,
    selectedCustomerId,
    selectedMerchantStoreId,
    memberAction: current.name !== "roleSelect" ? () => navigation.replace("roleSelect") : undefined
  };

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {current.name === "roleSelect" && <RoleSelectScreen {...screenProps} />}
        {current.name === "nearby" && <NearbyGroupBuyActivitiesScreen {...screenProps} />}
        {current.name === "liveMap" && <LiveMapScreen {...screenProps} />}
        {current.name === "storeMenu" && <StoreMenuScreen {...screenProps} />}
        {current.name === "groupBuyActivityDetail" && <GroupBuyActivityDetailScreen {...screenProps} />}
        {current.name === "drinkSelection" && <DrinkSelectionScreen {...screenProps} />}
        {current.name === "cart" && <CartScreen {...screenProps} />}
        {current.name === "groupProgress" && <GroupProgressScreen {...screenProps} />}
        {current.name === "paymentAuthorization" && <PaymentAuthorizationScreen {...screenProps} />}
        {current.name === "pickupInfo" && <PickupInfoScreen {...screenProps} />}
        {current.name === "merchantCreate" && <MerchantGroupBuyActivityCreateScreen {...screenProps} />}
        {current.name === "merchantDashboard" && <MerchantDashboardScreen {...screenProps} />}
        {current.name === "merchantMenu" && <MerchantMenuManagementScreen {...screenProps} />}
        {current.name === "customerPlaceholder" && <CustomerPlaceholderScreen {...screenProps} />}
        {current.name === "customerOrders" && <CustomerOrdersScreen {...screenProps} />}
        {current.name === "adminDashboard" && <AdminDashboardScreen {...screenProps} />}
      </View>
      {current.name !== "roleSelect" ? (
        <BottomNav
          current={current.name}
          currentParams={current.params}
          currentRole={currentRole}
          navigation={navigation}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  screen: {
    flex: 1
  }
});
