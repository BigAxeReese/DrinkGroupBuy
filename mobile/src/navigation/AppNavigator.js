import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
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
import { createOrder, createOrderRevision, getOrder, listGroupBuyActivities, updateOrder } from "../utils/apiClient";

const initialRoute = { name: "roleSelect", params: {} };
const backendCustomerUserIds = {
  "customer-yinji": "user-customer-yinji",
  "customer-bolun": "user-customer-bolun",
  "customer-lixuan": "user-customer-lixuan",
  "customer-jingwei": "user-customer-jingwei"
};

function toBackendOrderItems(orderItems) {
  return orderItems.map((item) => ({
    menuItemId: item.drinkId,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
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
      .map((customization) => customization.label)
  };
}

function getStoredArray(storedState, key, legacyKey, fallback) {
  if (Array.isArray(storedState[key])) return storedState[key];
  if (legacyKey && Array.isArray(storedState[legacyKey])) return storedState[legacyKey];
  return fallback;
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

export function AppNavigator() {
  const [stack, setStack] = useState([initialRoute]);
  const [currentRole, setCurrentRole] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("customer-yinji");
  const [selectedMerchantStoreId, setSelectedMerchantStoreId] = useState("store-001");
  const [groupBuyActivities, setGroupBuyActivities] = useState(initialGroupBuyActivities);
  const [orders, setOrders] = useState(initialOrders);
  const [paymentAuthorizations, setPaymentAuthorizations] = useState(initialPaymentAuthorizations);
  // Prototype only, not final API contract. Cart contents are saved locally when available.
  const [cartItems, setCartItems] = useState([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const current = stack[stack.length - 1];

  useEffect(() => {
    clearPrototypeStateOnce("2026-07-08-clear-group-buys-orders-cart");
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
              lockedReason: "activity_deadline_reached",
              merchantAcceptanceStatus: order.merchantAcceptanceStatus === "pending"
                ? "accepted"
                : order.merchantAcceptanceStatus,
              pickupStatus: order.pickupStatus === "not_ready"
                ? "preparing"
                : order.pickupStatus
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
              releasedAmount: Math.max(0, order.authorizedAmount - captureAmount)
            }
          : order
      )));
    },
    async syncOrderFromBackend(orderId) {
      const backendOrder = await getOrder(orderId);
      const authorization = backendOrder.latestLinePayAuthorization;
      const authorizedAmount = authorization?.authorizedAmount ?? backendOrder.originalAmount;
      const backendActivities = await listGroupBuyActivities();
      const backendActivity = backendActivities.find((activity) => activity.id === backendOrder.activityId);
      const pendingRevision = backendOrder.pendingRevision ?? null;
      const pendingRevisionItems = pendingRevision?.items?.map(toLocalOrderItem) ?? null;

      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              status: backendOrder.status,
              paymentStatus: backendOrder.paymentStatus,
              authorizationStatus: backendOrder.authorizationStatus,
              originalAmount: backendOrder.originalAmount,
              authorizedAmount,
              finalAmount: backendOrder.finalAmount,
              quantity: backendOrder.totalCups,
              subtotal: backendOrder.originalAmount,
              items: backendOrder.items?.map(toLocalOrderItem) ?? order.items,
              pendingRevisionId: pendingRevision?.id ?? null,
              pendingRevisionAmount: pendingRevision?.originalAmount ?? null,
              pendingRevisionItems,
              pendingRevisionTotalCups: pendingRevision?.totalCups ?? null,
              reauthorizationReason: pendingRevision ? "order_amount_changed" : null
            }
          : order
      )));
      setPaymentAuthorizations((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              status: pendingRevision ? "pending" : backendOrder.paymentStatus,
              paymentStatus: pendingRevision ? "pending" : backendOrder.paymentStatus,
              authorizationStatus: pendingRevision ? "pending" : backendOrder.authorizationStatus,
              originalAmount: pendingRevision?.originalAmount ?? backendOrder.originalAmount,
              authorizedAmount: pendingRevision ? 0 : authorizedAmount,
              provider: authorization?.provider ?? report.provider,
              providerReference: authorization?.providerAuthorizationId ?? report.providerReference,
              pendingRevisionId: pendingRevision?.id ?? null,
              revisionAmount: pendingRevision?.originalAmount ?? null,
              revisionItems: pendingRevisionItems,
              note: "Synced from backend order state."
            }
          : report
      )));
      if (backendActivity) {
        setGroupBuyActivities((items) => items.map((groupBuyActivity) => (
          groupBuyActivity.id === backendActivity.id
            ? {
                ...groupBuyActivity,
                status: backendActivity.status,
                currentCups: backendActivity.authorizedCups ?? backendActivity.currentCups ?? groupBuyActivity.currentCups,
                participantCount: backendActivity.participantCount ?? groupBuyActivity.participantCount,
                targetCups: backendActivity.targetCups ?? groupBuyActivity.targetCups,
                maximumCups: backendActivity.maximumCups ?? groupBuyActivity.maximumCups,
                tiers: backendActivity.tiers?.map((tier) => ({
                  id: tier.id,
                  cups: tier.targetCups ?? tier.cups,
                  targetCups: tier.targetCups ?? tier.cups,
                  discountAmount: tier.discountAmount,
                  sortOrder: tier.sortOrder
                })) ?? groupBuyActivity.tiers
              }
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
    acceptMerchantOrdersForGroupBuyActivity(groupBuyActivityId) {
      setOrders((items) => items.map((order) => (
        order.groupBuyActivityId === groupBuyActivityId
          && order.status !== "cancelled"
          && order.merchantAcceptanceStatus === "pending"
          ? {
              ...order,
              merchantAcceptanceStatus: "accepted",
              pickupStatus: order.pickupStatus === "not_ready" ? "preparing" : order.pickupStatus
            }
          : order
      )));
    },
    completeMerchantOrdersForGroupBuyActivity(groupBuyActivityId) {
      setOrders((items) => items.map((order) => (
        order.groupBuyActivityId === groupBuyActivityId
          && order.status !== "cancelled"
          && order.merchantAcceptanceStatus === "accepted"
          && !["ready", "picked_up", "cancelled"].includes(order.pickupStatus)
          ? {
              ...order,
              status: order.status === "locked" ? "readyForPickup" : order.status,
              pickupStatus: "ready"
            }
          : order
      )));
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
      const tiers = activity.tiers.map((tier) => ({
        cups: tier.targetCups,
        discountAmount: tier.discountAmount
      }));
      const newGroupBuyActivity = {
        id: activity.id,
        storeId: activity.storeId,
        title: activity.title,
        status: activity.status,
        currentCups: 0,
        targetCups: tiers[0]?.cups ?? 20,
        maximumCups: activity.maximumCups ?? tiers[tiers.length - 1]?.cups ?? 20,
        participantCount: 0,
        remainingTimeText: "剛建立",
        minutesUntilDeadline: getMinutesUntilDeadline({ deadlineAt: activity.deadlineAt }) ?? 120,
        withdrawalLockMinutes: activity.withdrawalLockMinutes ?? 30,
        startTime: activity.startAt,
        deadlineAt: activity.deadlineAt,
        endTime: formatDeadlineLabel(activity.deadlineAt),
        pickupTime: `${activity.pickupStartAt} - ${activity.pickupEndAt}`,
        canJoin: true,
        tiers,
        notices: ["由 backend API 建立，並同步到 mobile prototype state。"]
      };
      setGroupBuyActivities((items) => [newGroupBuyActivity, ...items.filter((item) => item.id !== newGroupBuyActivity.id)]);
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
  }), [cartItems, groupBuyActivities, orders, selectedCustomerId]);

  const appState = { groupBuyActivities, orders, paymentAuthorizations, cartItems };
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
