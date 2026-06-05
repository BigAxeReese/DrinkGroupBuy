import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { groupOrders } from "../mock/groupOrders";
import { getDealById, formatCurrency } from "../utils/calculations";

export function GroupProgressScreen({ navigation, route, appState, memberAction, selectedCustomerId }) {
  const deal = getDealById(appState.deals, route.params?.dealId);
  if (!deal) {
    return (
      <MobileScreen
        title="團購進度"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有團購資料">
          <Text style={styles.meta}>團購已清空，或目前尚未有商家建立活動。</Text>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }

  const groupOrder = groupOrders.find((item) => item.dealId === deal.id);
  const order = appState.orders.find((item) => item.id === route.params?.orderId && item.customerId === selectedCustomerId)
    ?? appState.orders.find((item) => item.dealId === deal.id && item.customerId === selectedCustomerId);
  const payment = appState.paymentReports.find((item) => item.orderId === order?.id);
  const authorizedCups = deal.currentCups;
  const targetCups = groupOrder?.targetCups ?? deal.targetCups;
  const remainingAuthorizedCups = Math.max(0, targetCups - authorizedCups);
  const discountStatus = authorizedCups >= targetCups ? "qualified" : "not_yet_qualified";

  return (
    <MobileScreen
      title="團購進度"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="狀態">
        <StatusBadge value={deal.status} />
        <ProgressSummary
          currentCups={authorizedCups}
          targetCups={targetCups}
          participantCount={deal.participantCount}
          remainingTimeText={deal.remainingTimeText}
        />
        <Text style={styles.meta}>targetCups：{targetCups} 杯</Text>
        <Text style={styles.meta}>authorizedCups：{authorizedCups} 杯</Text>
        <Text style={styles.meta}>remainingAuthorizedCups：{remainingAuthorizedCups} 杯</Text>
        <Text style={styles.meta}>discountStatus：{discountStatus === "qualified" ? "優惠成立" : "尚未達標"}</Text>
        <Text style={styles.explain}>只有預授權成功的杯數才計入優惠門檻。</Text>
        <Text style={styles.meta}>{groupOrder?.nextTierText ?? "目前沒有下一級距資料"}</Text>
        <Text style={styles.meta}>最高優惠上限：{deal.maximumCups} 杯</Text>
      </Section>

      <Section title="我的訂單摘要">
        {order ? (
          <View style={styles.summary}>
            <Text style={styles.title}>{order.itemName} x {order.quantity}</Text>
            <Text style={styles.meta}>{order.sweetness} · {order.ice} · {order.toppings.join("、")}</Text>
            <Text style={styles.amount}>{formatCurrency(order.subtotal)}</Text>
            <Text style={styles.meta}>paymentStatus：{order.paymentStatus}</Text>
            <Text style={styles.meta}>流團偏好：{order.fallbackPurchasePreference === "accept_original_price" ? "接受原價購買" : "不原價購買"}</Text>
          </View>
        ) : (
          <Text style={styles.meta}>尚未加入此團購。</Text>
        )}
      </Section>

      {discountStatus === "qualified" && payment ? (
        <Section title="優惠請款試算">
          <AmountLine label="finalAmount" value={payment.finalAmount} />
          <AmountLine label="captureAmount" value={payment.captureAmount} />
          <AmountLine label="releasedAmount" value={payment.releasedAmount} />
        </Section>
      ) : null}

      <View style={styles.actions}>
        {order ? (
          <>
            <PrimaryButton label="Line Pay 預授權" onPress={() => navigation.go("paymentReport", { dealId: deal.id, orderId: order.id })} />
            <PrimaryButton label="取貨資訊" variant="secondary" onPress={() => navigation.go("pickupInfo", { dealId: deal.id, orderId: order.id })} />
          </>
        ) : (
          <PrimaryButton label="先選擇飲料" variant="secondary" onPress={() => navigation.go("drinkSelection", { dealId: deal.id })} />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  meta: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  summary: {
    gap: 6
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  amount: {
    color: "#1f6feb",
    fontSize: 24,
    fontWeight: "900"
  },
  actions: {
    gap: 10
  },
  explain: {
    color: "#1f6feb",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  amountLine: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12
  },
  amountLineLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  amountLineValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  }
});

function AmountLine({ label, value }) {
  return (
    <View style={styles.amountLine}>
      <Text style={styles.amountLineLabel}>{label}</Text>
      <Text style={styles.amountLineValue}>{value == null ? "待計算" : formatCurrency(value)}</Text>
    </View>
  );
}
