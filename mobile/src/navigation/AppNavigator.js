import { useMemo, useState } from "react";
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

const initialRoute = { name: "roleSelect", params: {} };

export function AppNavigator() {
  const [stack, setStack] = useState([initialRoute]);
  const [currentRole, setCurrentRole] = useState(null);
  const [deals, setDeals] = useState(initialDeals);
  const [orders, setOrders] = useState(initialOrders);
  const [paymentReports, setPaymentReports] = useState(initialPaymentReports);
  const current = stack[stack.length - 1];

  const navigation = useMemo(() => ({
    selectRole(role, routeName) {
      setCurrentRole(role);
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
    joinGroupOrder(orderDraft) {
      const orderId = `order-mock-${Date.now()}`;
      const newOrder = {
        id: orderId,
        dealId: orderDraft.dealId,
        customerSurname: "測",
        itemName: orderDraft.itemName,
        quantity: orderDraft.quantity,
        sweetness: orderDraft.sweetness,
        ice: orderDraft.ice,
        toppings: orderDraft.toppings,
        subtotal: orderDraft.subtotal,
        originalAmount: orderDraft.subtotal,
        authorizedAmount: 0,
        finalAmount: null,
        captureAmount: null,
        releasedAmount: null,
        fallbackPurchasePreference: orderDraft.fallbackPurchasePreference,
        paymentStatus: "pending",
        authorizationStatus: "pending",
        pickupStatus: "not_ready"
      };

      setOrders((items) => [...items, newOrder]);
      setPaymentReports((items) => [
        ...items,
        {
          orderId,
          originalAmount: orderDraft.subtotal,
          authorizedAmount: 0,
          finalAmount: null,
          captureAmount: null,
          releasedAmount: null,
          recipientName: orderDraft.storeName,
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
              authorizedAmount: order.originalAmount ?? order.subtotal
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
    createMerchantDeal(form) {
      const dealId = `deal-merchant-${Date.now()}`;
      const newDeal = {
        id: dealId,
        storeId: form.storeId,
        title: form.title || "商家優惠活動",
        status: "recruiting",
        currentCups: 0,
        targetCups: Number(form.targetCups) || 20,
        maximumCups: Number(form.maximumCups) || 50,
        participantCount: 0,
        remainingTimeText: "剛建立",
        endTime: form.endTime || "今日 15:30",
        pickupTime: form.pickupTime || "今日 16:30 - 17:00",
        canJoin: true,
        tiers: [
          {
            cups: Number(form.targetCups) || 20,
            discountAmount: Number(form.discountAmount) || 400
          }
        ],
        notices: [form.notices || "Prototype 建立活動，不會寫入後端。"]
      };
      setDeals((items) => [newDeal, ...items]);
      return dealId;
    }
  }), [deals, orders]);

  const appState = { deals, orders, paymentReports };
  const screenProps = {
    navigation,
    route: current,
    appState,
    actions,
    currentRole,
    memberAction: current.name !== "roleSelect" ? () => navigation.replace("roleSelect") : undefined
  };

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {current.name === "roleSelect" && <RoleSelectScreen {...screenProps} />}
        {current.name === "nearby" && <NearbyDealsScreen {...screenProps} />}
        {current.name === "dealDetail" && <DealDetailScreen {...screenProps} />}
        {current.name === "drinkSelection" && <DrinkSelectionScreen {...screenProps} />}
        {current.name === "groupProgress" && <GroupProgressScreen {...screenProps} />}
        {current.name === "paymentReport" && <PaymentReportScreen {...screenProps} />}
        {current.name === "pickupInfo" && <PickupInfoScreen {...screenProps} />}
        {current.name === "merchantCreate" && <MerchantDealCreateScreen {...screenProps} />}
        {current.name === "merchantDashboard" && <MerchantDashboardScreen {...screenProps} />}
        {current.name === "customerPlaceholder" && <CustomerPlaceholderScreen {...screenProps} />}
        {current.name === "customerOrders" && <CustomerOrdersScreen {...screenProps} />}
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
