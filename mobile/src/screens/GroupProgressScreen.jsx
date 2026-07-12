import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { getGroupBuyActivityById, formatCurrency } from "../utils/calculations";

export function GroupProgressScreen({ navigation, route, appState, memberAction, selectedCustomerId }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  if (!groupBuyActivity) {
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

  const order = appState.orders.find((item) => item.id === route.params?.orderId && item.customerId === selectedCustomerId)
    ?? appState.orders.find((item) => item.groupBuyActivityId === groupBuyActivity.id && item.customerId === selectedCustomerId);
  const payment = appState.paymentAuthorizations.find((item) => item.orderId === order?.id);
  const authorizedCups = groupBuyActivity.currentCups;
  const tierTargets = (groupBuyActivity.tiers ?? [])
    .map((tier) => Number(tier.cups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const targetCups = tierTargets.find((cups) => authorizedCups < cups)
    ?? groupBuyActivity.targetCups
    ?? tierTargets[tierTargets.length - 1]
    ?? 0;
  const reachedTiers = tierTargets.filter((cups) => authorizedCups >= cups);
  const reachedTier = reachedTiers[reachedTiers.length - 1];
  const nextTierText = targetCups > 0 && authorizedCups < targetCups
    ? `下一級距：還差 ${targetCups - authorizedCups} 杯達到 ${targetCups} 杯`
    : reachedTier
      ? `已達目前最高級距：${reachedTier} 杯`
      : "目前沒有下一級距資料";
  const discountStatus = reachedTier ? "qualified" : "not_yet_qualified";

  return (
    <MobileScreen
      title="團購進度"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="狀態">
        <StatusBadge value={groupBuyActivity.status} />
        <ProgressSummary
          currentCups={authorizedCups}
          targetCups={targetCups}
          participantCount={groupBuyActivity.participantCount}
          remainingTimeText={groupBuyActivity.remainingTimeText}
        />
        <Text style={styles.explain}>只有預授權成功的杯數才計入優惠門檻。</Text>
        <Text style={styles.meta}>{nextTierText}</Text>
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
            <PrimaryButton label="Line Pay 預授權" onPress={() => navigation.go("paymentAuthorization", { groupBuyActivityId: groupBuyActivity.id, orderId: order.id })} />
            <PrimaryButton label="取貨資訊" variant="secondary" onPress={() => navigation.go("pickupInfo", { groupBuyActivityId: groupBuyActivity.id, orderId: order.id })} />
          </>
        ) : (
          <PrimaryButton label="先選擇飲料" variant="secondary" onPress={() => navigation.go("drinkSelection", { groupBuyActivityId: groupBuyActivity.id })} />
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
