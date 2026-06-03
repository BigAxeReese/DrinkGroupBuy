import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { customerOrderDemo } from "../mock/customerOrderDemo";
import { deals } from "../mock/deals";
import { stores } from "../mock/stores";
import { formatCurrency } from "../utils/calculations";

export function CustomerOrdersScreen({ navigation, appState, memberAction }) {
  const [tab, setTab] = useState("active");
  const order = appState.orders.find((item) => item.id === customerOrderDemo.activeOrderId) ?? appState.orders[0];
  const deal = appState.deals.find((item) => item.id === order?.dealId) ?? deals[0];
  const payment = appState.paymentReports.find((item) => item.orderId === order?.id);
  const store = stores.find((item) => item.id === deal.storeId);
  const progressText = deal.currentCups >= deal.targetCups ? "100% 達標" : `${Math.round((deal.currentCups / deal.targetCups) * 100)}%`;

  if (!order) {
    return (
      <MobileScreen title="我的訂單" onMemberPress={memberAction}>
        <Section title="目前沒有訂單">
          <Text style={styles.meta}>加入團購後，訂單明細與取貨憑證會顯示在這裡。</Text>
          <PrimaryButton label="去逛逛" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen title="我的訂單" onMemberPress={memberAction}>
      <View style={styles.tabRow}>
        <Text
          onPress={() => setTab("active")}
          style={[styles.tabItem, tab === "active" && styles.activeTabItem]}
        >
          訂單列表
        </Text>
        <Text
          onPress={() => setTab("history")}
          style={[styles.tabItem, tab === "history" && styles.activeTabItem]}
        >
          歷史訂單
        </Text>
      </View>

      {tab === "history" ? (
        <Section title="歷史訂單">
          <Text style={styles.meta}>目前沒有歷史訂單。</Text>
          <PrimaryButton label="返回訂單列表" variant="secondary" onPress={() => setTab("active")} />
        </Section>
      ) : (
      <View style={styles.orderCard}>
        <View style={styles.statusBar}>
          <View style={styles.statusGroup}>
            <StatusBadge owner="payment" value={order.paymentStatus} />
            <Text style={styles.statusText}>團購進度：{progressText}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.flex}>
            <Text style={styles.storeName}>{store?.name}</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.go("dealDetail", { dealId: order.dealId })} style={styles.smallDetailButton}>
              <Text style={styles.smallDetailText}>團購詳情</Text>
            </Pressable>
          </View>
        </View>

        <Section title="訂單明細">
          <View style={styles.detailCard}>
            <View style={styles.detailTop}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{order.itemName}（L）</Text>
                <View style={styles.chips}>
                  <Text style={styles.chip}>{order.sweetness}</Text>
                  <Text style={styles.chip}>{order.ice}</Text>
                  {order.toppings.map((item) => <Text key={item} style={styles.chip}>{item}</Text>)}
                </View>
                <Text style={styles.itemPrice}>{formatCurrency(order.subtotal)}</Text>
              </View>
              <PrimaryButton label="修改" variant="secondary" onPress={() => navigation.go("drinkSelection", { dealId: order.dealId })} />
            </View>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>訂單金額</Text>
            <View style={styles.priceGroup}>
              <Text style={styles.price}>{formatCurrency(payment?.captureAmount ?? Math.max(customerOrderDemo.minimumPayableAmount, order.subtotal - customerOrderDemo.discountAmount))}</Text>
              <Text style={styles.originalPrice}>{formatCurrency(payment?.authorizedAmount ?? order.subtotal)}</Text>
            </View>
          </View>
        </Section>

        <View style={styles.pickupPass}>
          <View>
            <Text style={styles.passLabel}>{customerOrderDemo.pickupPass.label}</Text>
            <Text style={styles.passCode}>{customerOrderDemo.pickupPass.code}</Text>
          </View>
          <View style={styles.qrBox}>
            <Text style={styles.qrText}>{customerOrderDemo.pickupPass.qrLabel}</Text>
          </View>
        </View>
      </View>
      )}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  orderCard: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  tabRow: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#e9eef6",
    padding: 6
  },
  tabItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    color: "#64748b",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center"
  },
  activeTabItem: {
    color: "#1f6feb",
    backgroundColor: "#ffffff"
  },
  statusBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ecfdf5",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0"
  },
  statusGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  statusText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "900"
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    padding: 16
  },
  flex: {
    flex: 1
  },
  drinkName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  storeName: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6
  },
  smallDetailButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: "#eaf2ff",
    marginTop: 8,
    paddingHorizontal: 12
  },
  smallDetailText: {
    color: "#1f6feb",
    fontSize: 12,
    fontWeight: "900"
  },
  priceGroup: {
    alignItems: "flex-end"
  },
  price: {
    color: "#2563eb",
    fontSize: 24,
    fontWeight: "900"
  },
  originalPrice: {
    color: "#94a3b8",
    fontSize: 12,
    textDecorationLine: "line-through"
  },
  detailCard: {
    minHeight: 76,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 12
  },
  detailTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  itemTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  itemPrice: {
    color: "#1f6feb",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 10
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8
  },
  chip: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  pickupPass: {
    margin: 14,
    marginTop: 4,
    minHeight: 90,
    borderRadius: 16,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16
  },
  totalRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    marginTop: 4,
    paddingTop: 12
  },
  totalLabel: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  passLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800"
  },
  passCode: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8
  },
  qrBox: {
    width: 58,
    height: 58,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  qrText: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  }
});
