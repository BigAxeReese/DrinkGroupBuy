import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { BottomNav } from "../components/BottomNav";
import { deals as initialDeals } from "../mock/deals";
import { orders as initialOrders } from "../mock/orders";
import { paymentReports as initialPaymentReports } from "../mock/paymentReports";
import { RoleSelectScreen } from "../screens/RoleSelectScreen";
import { NearbyDealsScreen } from "../screens/NearbyDealsScreen";
import { DealDetailScreen } from "../screens/DealDetailScreen";
import { DrinkSelectionScreen } from "../screens/DrinkSelectionScreen";
import { GroupProgressScreen } from "../screens/GroupProgressScreen";
import { PaymentReportScreen } from "../screens/PaymentReportScreen";
import { PickupInfoScreen } from "../screens/PickupInfoScreen";
import { MerchantDealCreateScreen } from "../screens/MerchantDealCreateScreen";
import { MerchantDashboardScreen } from "../screens/MerchantDashboardScreen";
import { CustomerPlaceholderScreen } from "../screens/CustomerPlaceholderScreen";
import { CustomerOrdersScreen } from "../screens/CustomerOrdersScreen";
import { AdminDashboardScreen } from "../screens/AdminDashboardScreen";
import { CartScreen } from "../screens/CartScreen";
import { LiveMapScreen } from "../screens/LiveMapScreen";
import { formatDeadlineLabel, getMinutesUntilDeadline, isDeadlineReached } from "../utils/deadlineTime";
import { normalizeOrderItem } from "../utils/orderItems";
import { buildOrderItemsChange, rollbackAuthorizedCups } from "../utils/orderState";
import { loadPrototypeState, savePrototypeState } from "../utils/prototypeStorage";

const initialRoute = { name: "roleSelect", params: {} };

export function AppNavigator() {
  const [stack, setStack] = useState([initialRoute]);
  const [currentRole, setCurrentRole] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("customer-yinji");
  const [selectedMerchantStoreId, setSelectedMerchantStoreId] = useState("store-001");
  const [deals, setDeals] = useState(initialDeals);
  const [orders, setOrders] = useState(initialOrders);
  const [paymentReports, setPaymentReports] = useState(initialPaymentReports);
  // Prototype only, not final API contract. Cart contents are saved locally when available.
  const [cartItems, setCartItems] = useState([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const current = stack[stack.length - 1];

  useEffect(() => {
    const storedState = loadPrototypeState();
    if (storedState) {
      setDeals(Array.isArray(storedState.deals) ? storedState.deals : initialDeals);
      setOrders(Array.isArray(storedState.orders) ? storedState.orders : initialOrders);
      setPaymentReports(Array.isArray(storedState.paymentReports) ? storedState.paymentReports : initialPaymentReports);
      setCartItems(Array.isArray(storedState.cartItems) ? storedState.cartItems : []);
    }
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    savePrototypeState({
      deals,
      orders,
      paymentReports,
      cartItems
    });
  }, [cartItems, deals, orders, paymentReports, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return undefined;

    function lockExpiredOrders() {
      const now = new Date();
      const expiredDealIds = new Set(
        deals
          .filter((deal) => isDeadlineReached(deal, now))
          .map((deal) => deal.id)
      );

      setDeals((items) => items.map((deal) => {
        const minutesUntilDeadline = getMinutesUntilDeadline(deal, now);
        if (minutesUntilDeadline == null) return deal;

        const expired = minutesUntilDeadline <= 0;
        const nextStatus = expired && ["recruiting", "confirmed"].includes(deal.status)
          ? "ordering"
          : deal.status;
        const nextCanJoin = expired ? false : deal.canJoin;
        const nextRemainingTimeText = expired ? "已截止" : `剩 ${minutesUntilDeadline} 分鐘`;

        if (
          deal.minutesUntilDeadline === minutesUntilDeadline
          && deal.status === nextStatus
          && deal.canJoin === nextCanJoin
          && deal.remainingTimeText === nextRemainingTimeText
        ) {
          return deal;
        }

        return {
          ...deal,
          minutesUntilDeadline,
          remainingTimeText: nextRemainingTimeText,
          canJoin: nextCanJoin,
          status: nextStatus
        };
      }));

      if (expiredDealIds.size === 0) return;
      setOrders((items) => items.map((order) => (
        expiredDealIds.has(order.dealId)
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
  }, [deals, storageLoaded]);

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
    submitCart(dealId, fallbackPurchasePreference = "decline_original_price") {
      const submittedItems = cartItems.filter((item) => item.dealId === dealId && item.customerId === selectedCustomerId);
      if (submittedItems.length === 0) return null;

      const existingOrder = orders.find((order) => (
        order.customerId === selectedCustomerId
        && order.dealId === dealId
        && !["cancelled", "completed"].includes(order.status)
      ));
      const quantity = submittedItems.reduce((sum, item) => sum + item.quantity, 0);
      const subtotal = submittedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const firstItem = submittedItems[0];
      const orderItems = submittedItems.map((item) => normalizeOrderItem(item));

      if (existingOrder) {
        const change = buildOrderItemsChange({
          order: existingOrder,
          nextItems: [...(existingOrder.items ?? []), ...orderItems]
        });
        setOrders((items) => items.map((order) => (
          order.id === existingOrder.id
            ? {
                ...order,
                ...change.orderPatch,
                fallbackPurchasePreference
              }
            : order
        )));
        setPaymentReports((items) => items.map((report) => (
          report.orderId === existingOrder.id
            ? {
                ...report,
                ...change.paymentPatch,
                note: "Original authorization remains until customer confirms reauthorization."
              }
            : report
        )));
        if (change.wasCounted) {
          setDeals((items) => items.map((deal) => (
            deal.id === existingOrder.dealId
              ? rollbackAuthorizedCups(deal, existingOrder)
              : deal
          )));
        }
        setCartItems((items) => items.filter((item) => item.dealId !== dealId || item.customerId !== selectedCustomerId));
        return existingOrder.id;
      }

      const orderId = `order-mock-${Date.now()}`;
      const newOrder = {
        id: orderId,
        customerId: selectedCustomerId,
        dealId,
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
      setPaymentReports((items) => [
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
      setCartItems((items) => items.filter((item) => item.dealId !== dealId || item.customerId !== selectedCustomerId));
      return orderId;
    },
    updateOrderItems(orderId, nextItems) {
      const orderToUpdate = orders.find((order) => order.id === orderId);
      if (!orderToUpdate) return;

      const change = buildOrderItemsChange({ order: orderToUpdate, nextItems });

      setOrders((items) => items.map((order) => (
        order.id === orderId
          ? {
              ...order,
              ...change.orderPatch
            }
          : order
      )));
      setPaymentReports((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              ...change.paymentPatch
            }
          : report
      )));
      if (change.wasCounted) {
        setDeals((items) => items.map((deal) => (
          deal.id === orderToUpdate.dealId
            ? rollbackAuthorizedCups(deal, orderToUpdate)
            : deal
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
      setPaymentReports((items) => items.map((report) => (
        report.orderId === orderId
          ? {
              ...report,
              ...change.paymentPatch
            }
          : report
      )));
      if (change.wasCounted) {
        setDeals((items) => items.map((deal) => (
          deal.id === orderToUpdate.dealId
            ? rollbackAuthorizedCups(deal, orderToUpdate)
            : deal
        )));
      }
    },
    authorizeLinePayPayment(orderId, providerReference = "linepay-auth") {
      const orderToAuthorize = orders.find((order) => order.id === orderId);
      const dealToAuthorize = orderToAuthorize ? deals.find((deal) => deal.id === orderToAuthorize.dealId) : null;
      const willQualify = Boolean(
        orderToAuthorize &&
        dealToAuthorize &&
        dealToAuthorize.currentCups + orderToAuthorize.quantity >= dealToAuthorize.targetCups
      );
      setPaymentReports((items) => items.map((report) => (
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
        setDeals((items) => items.map((deal) => {
          if (deal.id !== orderToAuthorize.dealId) return deal;
          const nextCups = deal.currentCups + orderToAuthorize.quantity;
          return {
            ...deal,
            currentCups: nextCups,
            participantCount: deal.participantCount + 1,
            status: nextCups >= deal.targetCups ? "confirmed" : deal.status
          };
        }));
      }
    },
    captureQualifiedPayment(orderId, captureAmount, providerReference = "linepay-capture") {
      setPaymentReports((items) => items.map((report) => (
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
    acceptMerchantOrdersForDeal(dealId) {
      setOrders((items) => items.map((order) => (
        order.dealId === dealId
          && order.status !== "cancelled"
          && order.merchantAcceptanceStatus === "pending"
          ? { ...order, merchantAcceptanceStatus: "accepted" }
          : order
      )));
    },
    createMerchantDeal(form) {
      const dealId = `deal-merchant-${Date.now()}`;
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
      const newDeal = {
        id: dealId,
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
      setDeals((items) => [newDeal, ...items]);
      return dealId;
    },
    addMerchantDealFromApi(activity) {
      const tiers = activity.tiers.map((tier) => ({
        cups: tier.targetCups,
        discountAmount: tier.discountAmount
      }));
      const newDeal = {
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
      setDeals((items) => [newDeal, ...items.filter((item) => item.id !== newDeal.id)]);
      return newDeal.id;
    },
    cancelGroupBuyActivity(dealId, cancellationReason = "管理員刪除團購") {
      setDeals((items) => items.map((deal) => (
        deal.id === dealId
          ? {
              ...deal,
              status: "cancelled",
              canJoin: false,
              cancellationReason
            }
            : deal
      )));
      setOrders((items) => items.map((order) => (
        order.dealId === dealId
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
      setDeals((items) => items.map((deal) => (
        deal.id === activity.id
          ? {
              ...deal,
              status: activity.status,
              canJoin: activity.status === "recruiting",
              cancellationReason: activity.cancellationReason
            }
            : deal
      )));
      setOrders((items) => items.map((order) => (
        order.dealId === activity.id
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
  }), [cartItems, deals, orders, selectedCustomerId]);

  const appState = { deals, orders, paymentReports, cartItems };
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
        {current.name === "nearby" && <NearbyDealsScreen {...screenProps} />}
        {current.name === "liveMap" && <LiveMapScreen {...screenProps} />}
        {current.name === "dealDetail" && <DealDetailScreen {...screenProps} />}
        {current.name === "drinkSelection" && <DrinkSelectionScreen {...screenProps} />}
        {current.name === "cart" && <CartScreen {...screenProps} />}
        {current.name === "groupProgress" && <GroupProgressScreen {...screenProps} />}
        {current.name === "paymentReport" && <PaymentReportScreen {...screenProps} />}
        {current.name === "pickupInfo" && <PickupInfoScreen {...screenProps} />}
        {current.name === "merchantCreate" && <MerchantDealCreateScreen {...screenProps} />}
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
