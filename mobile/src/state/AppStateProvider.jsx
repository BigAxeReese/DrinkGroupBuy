import { useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Updates from "expo-updates";
import { Alert, AppState, StyleSheet, View } from "react-native";
import { orders as initialOrders } from "../mock/orders";
import { paymentAuthorizations as initialPaymentAuthorizations } from "../mock/paymentAuthorizations";
import { DevBusinessTimeBanner } from "../components/DevBusinessTimeBanner";
import { useDevBusinessTime } from "../hooks/useDevBusinessTime";
import { getMinutesUntilDeadline, isDeadlineReached } from "../utils/deadlineTime";
import { getGroupBuyActivityCapacityInfo, wouldExceedGroupBuyActivityCapacity } from "../utils/groupBuyActivityProgress";
import { normalizeOrderItem, toLocalOrderItem } from "../utils/orderItems";
import { buildOrderItemsChange, rollbackAuthorizedCups } from "../utils/orderState";
import { clearPrototypeStateOnce, loadPrototypeState, savePrototypeState } from "../utils/prototypeStorage";
import {
  cancelMerchantGroupBuyActivity as cancelMerchantGroupBuyActivityApi,
  cancelOrder as cancelOrderApi,
  createOrder,
  createOrderRevision,
  getOrder,
  getPickupCredential as fetchPickupCredential,
  listCustomerOrders as fetchCustomerOrders,
  listGroupBuyActivities,
  listStores,
  listMerchantStoreOrders as fetchMerchantStoreOrders,
  lookupPickupCredential as lookupPickupCredentialApi,
  markGroupBuyActivityReadyForPickup,
  redeemPickupCredential as redeemPickupCredentialApi,
  setAuthToken,
  updateOrder,
  verifyAuthSession
} from "../utils/apiClient";
import { clearAuthSession, loadAuthSession } from "../utils/authSession";
import { getRouteForUser } from "../utils/authRouting";
import { signOutFirebaseUser } from "../utils/firebaseAuth";
import { getBusinessNow } from "../utils/businessTime";
import { AppStateContext } from "./AppStateContext";
import { normalizeBackendGroupBuyActivity, buildLocalOrderFromBackend, buildLocalPaymentFromBackend, mergeBackendOrderList, isSameCartItemVariant, toBackendOrderItems } from "./stateHelpers";

const backendCustomerUserIds = {
  "customer-yinji": "user-customer-yinji",
  "customer-bolun": "user-customer-bolun",
  "customer-lixuan": "user-customer-lixuan",
  "customer-jingwei": "user-customer-jingwei"
};

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

// All of the app's shared business state (group-buy activities, orders, payment authorizations, cart),
// the role/session, and the actions that mutate them -- lifted out of the old AppNavigator.js verbatim
// (only the navigation-stack pieces were removed; every action's own logic is unchanged). RootNavigator
// reads currentRole/showingRoleSelect to pick which root screen to render, which replaces the old
// `navigation.selectRole`/`navigation.logout`'s direct reset of the old hand-rolled `stack` -- a plain
// `navigationRef.reset()` doesn't work here since react-navigation's root Stack.Navigator only ever
// registers ONE of the role-select/CustomerTabs/MerchantTabs branches at a time, so a reset() call can
// only ever target a route that belongs to whichever branch happens to already be mounted.
export function AppStateProvider({ children }) {
  const businessTime = useDevBusinessTime();
  const [sessionRestoreStatus, setSessionRestoreStatus] = useState("checking");
  const [currentRole, setCurrentRole] = useState(null);
  // The member-icon "back to role select" shortcut (goToRoleSelect) needs to show the role-select
  // screen WITHOUT clearing currentRole/session state (unlike logout) -- RootNavigator renders the
  // role-select branch whenever this is true, regardless of currentRole.
  const [showingRoleSelect, setShowingRoleSelect] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("customer-yinji");
  const [selectedAuthUserId, setSelectedAuthUserId] = useState(null);
  const [selectedMerchantStoreId, setSelectedMerchantStoreId] = useState("store-001");
  const [stores, setStores] = useState([]);
  const [storeSyncStatus, setStoreSyncStatus] = useState("idle");
  const [groupBuyActivities, setGroupBuyActivities] = useState([]);
  const [groupBuyActivitySyncStatus, setGroupBuyActivitySyncStatus] = useState("idle");
  const [orders, setOrders] = useState(initialOrders);
  const [paymentAuthorizations, setPaymentAuthorizations] = useState(initialPaymentAuthorizations);
  // Prototype only, not final API contract. Cart contents are saved locally when available.
  const [cartItems, setCartItems] = useState([]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    // Updates.isEnabled is false on web and in dev/Expo Go builds -- nothing to check there.
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync()
      .then((result) => {
        if (!result.isAvailable) return;
        Alert.alert(
          "有新版本可用",
          "偵測到新版本，是否要立即更新？",
          [
            { text: "稍後", style: "cancel" },
            {
              text: "立即更新",
              onPress: () => {
                Updates.fetchUpdateAsync()
                  .then(() => Updates.reloadAsync())
                  .catch((error) => {
                    Alert.alert("更新失敗", error.message || "請稍後再試一次。");
                  });
              }
            }
          ]
        );
      })
      .catch(() => {
        // No network, or the check itself failed -- the app still works fine on the bundle
        // it already has, so this stays silent rather than nagging the user about it.
      });
  }, []);

  useEffect(() => {
    clearPrototypeStateOnce("2026-07-29-clear-all-group-buys-orders-cart");
    const storedState = loadPrototypeState();
    if (storedState) {
      setGroupBuyActivities(getStoredArray(storedState, "groupBuyActivities", "deals", []));
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
      const now = getBusinessNow();
      const expiredGroupBuyActivityIds = new Set(
        groupBuyActivities
          .filter((groupBuyActivity) => isDeadlineReached(groupBuyActivity, now))
          .map((groupBuyActivity) => groupBuyActivity.id)
      );

      setGroupBuyActivities((items) => {
        let didChange = false;
        const nextItems = items.map((groupBuyActivity) => {
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

          didChange = true;
          return {
            ...groupBuyActivity,
            minutesUntilDeadline,
            remainingTimeText: nextRemainingTimeText,
            canJoin: nextCanJoin,
            status: nextStatus
          };
        });

        return didChange ? nextItems : items;
      });

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
  }, [businessTime.snapshot.version, groupBuyActivities, storageLoaded]);

  // Sets which root screen RootNavigator renders, the same way the old `setStack([{ name, params: {} }])`
  // reset the old hand-rolled stack -- the 4th positional `params` arg is NOT the new route's own
  // `route.params` (matches the old behavior: it only feeds selectedCustomerId/selectedMerchantStoreId/
  // selectedAuthUserId below, screens read those from context instead of from their own route params).
  function selectRole(role, routeName, params = {}, userProfile = null) {
    setCurrentRole(role);
    setShowingRoleSelect(false);
    setCurrentUserProfile(userProfile);
    setSelectedAuthUserId(params.authUserId || null);
    if (role === "merchant" && params.storeId) {
      setSelectedMerchantStoreId(params.storeId);
    }
    if (role === "customer" && params.userId) {
      setSelectedCustomerId(params.userId);
    }
    if (role === "customer") {
      // Fires the OS location prompt right at login instead of waiting for the customer to
      // open 即時地圖 -- a no-op if already granted/denied from a prior request (only the very
      // first call after install actually shows the system dialog). LiveMapScreen still does
      // its own permission check/position fetch on mount; this just moves the prompt earlier.
      Location.requestForegroundPermissionsAsync().catch(() => {});
    }
  }

  function logout() {
    setAuthToken(null);
    clearAuthSession().catch(() => {});
    signOutFirebaseUser().catch(() => {});
    setCurrentRole(null);
    setShowingRoleSelect(false);
    setCurrentUserProfile(null);
    setSelectedAuthUserId(null);
    setSelectedCustomerId("customer-yinji");
    setSelectedMerchantStoreId("store-001");
    // Cart/orders/payment records are cached locally under a small hardcoded customerId
    // bucket (see backendCustomerToPrototypeCustomer in ../utils/authRouting.js), so a second
    // real account logging in on the same device after this one logs out would otherwise land
    // in the same bucket and see this account's cart and order history.
    setOrders(initialOrders);
    setCartItems([]);
    setPaymentAuthorizations(initialPaymentAuthorizations);
  }

  // The member-icon shortcut every screen's header offers: back to the role-select screen, but --
  // unlike logout() -- WITHOUT clearing currentRole/session/cart state. Reproduces the old
  // `navigation.replace("roleSelect")` used for this exact purpose.
  function goToRoleSelect() {
    setShowingRoleSelect(true);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const session = await loadAuthSession();
      if (!session) {
        if (active) setSessionRestoreStatus("done");
        return;
      }
      setAuthToken(session.token);
      try {
        // Re-verify with the backend (and re-derive the route from the fresh user record)
        // instead of trusting the cached copy -- roles/store assignments could have changed
        // server-side since this session was saved, and the token itself may have expired.
        const { user } = await verifyAuthSession();
        if (!active) return;
        const route = getRouteForUser(user);
        selectRole(route.role, route.routeName, route.params, user);
      } catch (error) {
        setAuthToken(null);
        if (error?.status === 401) {
          await clearAuthSession();
        }
        // Any other error (e.g. no network) leaves the stored session in place -- worth
        // retrying next launch -- and just falls through to the normal login screen for now.
      } finally {
        if (active) setSessionRestoreStatus("done");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectRole/logout are stable (defined once per render but only read state via closures re-created every render; matches the old navigation useMemo([]) which also only ran this effect once).
  }, []);

  const actions = useMemo(() => ({
    async syncStores() {
      setStoreSyncStatus("loading");
      try {
        const backendStores = await listStores();
        setStores(backendStores);
        setStoreSyncStatus("ready");
        return backendStores;
      } catch (error) {
        setStoreSyncStatus("error");
        throw error;
      }
    },
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
      setCartItems((items) => {
        const candidate = { ...cartItem, customerId: selectedCustomerId };
        // Only stack quantity onto an existing line when every customization matches exactly --
        // a "半糖" and a "微糖" order of the same drink must stay on separate lines.
        const existingIndex = items.findIndex((item) => isSameCartItemVariant(item, candidate));
        if (existingIndex !== -1) {
          const existing = items[existingIndex];
          const quantity = existing.quantity + candidate.quantity;
          const next = [...items];
          next[existingIndex] = { ...existing, quantity, subtotal: existing.unitPrice * quantity };
          return next;
        }
        return [
          ...items,
          { ...candidate, id: `cart-item-${Date.now()}-${items.length + 1}` }
        ];
      });
    },
    updateCartItemQuantity(cartItemId, quantity) {
      setCartItems((items) => {
        if (quantity <= 0) return items.filter((item) => item.id !== cartItemId);
        return items.map((item) => (
          item.id === cartItemId ? { ...item, quantity, subtotal: item.unitPrice * quantity } : item
        ));
      });
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
      const subtotal = submittedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const firstItem = submittedItems[0];
      const orderItems = submittedItems.map((item) => normalizeOrderItem(item));
      // order_revisions and the pending-order PATCH both replace the order's entire item list
      // wholesale (the same contract a fresh order create uses) -- the cart here only ever holds
      // items freshly picked in this edit session (see DrinkSelectionScreen's editOrderId flow), so
      // the existing order's own items must be merged back in or "修改訂單" would silently drop them.
      const existingOrderItems = existingOrder ? (existingOrder.items ?? []).map((item) => normalizeOrderItem(item)) : [];
      const finalOrderItems = existingOrder ? [...existingOrderItems, ...orderItems] : orderItems;
      const finalSubtotal = existingOrder ? finalOrderItems.reduce((sum, item) => sum + item.subtotal, 0) : subtotal;
      const finalQuantity = existingOrder ? finalOrderItems.reduce((sum, item) => sum + item.quantity, 0) : quantity;
      const finalFirstItem = finalOrderItems[0] ?? firstItem;
      const backendItems = toBackendOrderItems(finalOrderItems);

      const groupBuyActivity = groupBuyActivities.find((item) => item.id === groupBuyActivityId);
      // An authorized existing order's cups are already counted in the activity's authorized-cups
      // tally, so only the newly-added cart cups (quantity) are net-new capacity; a pending order
      // (or a brand new one) hasn't been counted at all yet, so its full merged total (finalQuantity)
      // is what newly lands on the tally once it's authorized -- matches how the backend recomputes
      // capacity from the complete merged item list in both cases.
      const capacityCheckQuantity = existingOrder && existingOrder.paymentStatus !== "pending"
        ? quantity
        : finalQuantity;
      if (groupBuyActivity && wouldExceedGroupBuyActivityCapacity(groupBuyActivity, capacityCheckQuantity)) {
        return {
          error: "capacity_exceeded",
          message: `此團購最多 ${getGroupBuyActivityCapacityInfo(groupBuyActivity).maximumCups} 杯，已無法再加入 ${capacityCheckQuantity} 杯。`
        };
      }

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
                  pendingRevisionAmount: revision.originalAmount ?? finalSubtotal,
                  pendingRevisionItems: finalOrderItems,
                  pendingRevisionTotalCups: revision.totalCups ?? finalQuantity,
                  reauthorizationReason: "order_amount_changed"
                }
              : order
          )));
          setPaymentAuthorizations((items) => items.map((report) => (
            report.orderId === existingOrder.id
              ? {
                  ...report,
                  pendingRevisionId: revision.id,
                  revisionAmount: revision.originalAmount ?? finalSubtotal,
                  revisionItems: finalOrderItems,
                  status: "pending",
                  paymentStatus: "pending",
                  authorizationStatus: "pending",
                  originalAmount: revision.originalAmount ?? finalSubtotal,
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
            revisionAmount: revision.originalAmount ?? finalSubtotal,
            revisionItems: finalOrderItems
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
                itemName: finalOrderItems.length > 1 ? `${finalFirstItem.itemName} 等 ${finalOrderItems.length} 項` : finalFirstItem.itemName,
                items: finalOrderItems,
                quantity: finalQuantity,
                sweetness: finalFirstItem.sweetness,
                ice: finalFirstItem.ice,
                toppings: finalFirstItem.toppings,
                subtotal: finalSubtotal,
                originalAmount: finalSubtotal,
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
                originalAmount: finalSubtotal,
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
              pickupStatus: order.pickupStatus === "preparing" ? "not_ready" : order.pickupStatus
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
    async markOrdersReadyForPickupForGroupBuyActivity(groupBuyActivityId, orderId) {
      const result = await markGroupBuyActivityReadyForPickup(groupBuyActivityId, orderId);
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
    addMerchantGroupBuyActivityFromApi(activity) {
      const newGroupBuyActivity = normalizeBackendGroupBuyActivity(activity);
      setGroupBuyActivities((items) => [
        newGroupBuyActivity,
        ...items.filter((item) => item.id !== newGroupBuyActivity.id)
      ]);
      return newGroupBuyActivity.id;
    },
    cancelMerchantGroupBuyActivityFromApi(activity, cancelledOrderIds) {
      const cancelledOrderIdSet = new Set(cancelledOrderIds || []);
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
        cancelledOrderIdSet.has(order.id)
          ? {
              ...order,
              status: "cancelled",
              pickupStatus: "cancelled",
              merchantAcceptanceStatus: "cancelled",
              cancellationReason: activity.cancellationReason
            }
          : order
      )));
    },
    async cancelMerchantGroupBuyActivity(groupBuyActivityId, reason) {
      const result = await cancelMerchantGroupBuyActivityApi(groupBuyActivityId, { reason });
      actionsRef.current.cancelMerchantGroupBuyActivityFromApi(result.activity, result.cancelledOrderIds);
      return result;
    },
    refreshBusinessTime: businessTime.refresh
  }), [cartItems, groupBuyActivities, orders, selectedCustomerId, selectedMerchantStoreId, businessTime.refresh]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!storageLoaded || !currentRole) return undefined;

    function syncBackendState() {
      actionsRef.current.syncStores().catch(() => {});
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

  const appState = {
    groupBuyActivities,
    groupBuyActivitySyncStatus,
    orders,
    paymentAuthorizations,
    cartItems,
    stores,
    storeSyncStatus
  };

  const value = {
    sessionRestoreStatus,
    currentRole,
    showingRoleSelect,
    currentUserProfile,
    selectedCustomerId,
    selectedAuthUserId,
    selectedMerchantStoreId,
    appState,
    actions,
    selectRole,
    logout,
    goToRoleSelect
  };

  return (
    <AppStateContext.Provider value={value}>
      <View style={styles.container}>
        <DevBusinessTimeBanner businessTime={businessTime} />
        <View style={styles.content}>{children}</View>
      </View>
    </AppStateContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    flex: 1
  }
});
