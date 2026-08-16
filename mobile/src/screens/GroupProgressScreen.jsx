import { StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { getGroupBuyActivityById, formatCurrency } from "../utils/calculations";
import { getFinalSettlementSnapshot } from "../utils/groupBuyActivityProgress";
import { formatOrderItemCustomizations } from "../utils/orderItems";

export function GroupProgressScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  const activitySyncStatus = appState.groupBuyActivitySyncStatus ?? "idle";
  const retryActivitySync = () => actions.syncGroupBuyActivities().catch(() => {});
  if (!groupBuyActivity) {
    return (
      <MobileScreen
        title="團購進度"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
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
  const finalSettlement = getFinalSettlementSnapshot(groupBuyActivity, order);
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
      <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
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
        <DiscountSummaryCard groupBuyActivity={groupBuyActivity} />
      </Section>

      {finalSettlement ? (
        <Section title="最終結算結果">
          <View style={styles.finalSettlementCard}>
            <DetailLine label="結算結果" value={finalSettlement.outcomeLabel} />
            <DetailLine label="最終有效杯數" value={`${finalSettlement.authorizedCups} 杯`} />
            <AmountLine label="最終每杯折扣" value={finalSettlement.discountPerCup} />
            {finalSettlement.hasOrder ? (
              <AmountLine label="我的訂單原價" value={finalSettlement.originalAmount} />
            ) : null}
            {finalSettlement.hasOrder ? (
              <AmountLine
                label="我的實際應付"
                value={finalSettlement.finalAmount}
                emptyLabel="待同步訂單"
              />
            ) : null}
            {finalSettlement.hasOrder ? (
              <AmountLine
                label="我的訂單折扣"
                value={finalSettlement.orderDiscountAmount}
                emptyLabel="待同步訂單"
              />
            ) : null}
            <AmountLine
              label="未分配尾差（退回商家）"
              value={finalSettlement.undistributedDiscountAmount}
            />
            <Text style={styles.finalSettlementNotice}>
              此區使用 Backend 保存的截止結算快照，與截止前的預估折扣不同，結算後不再變動。
            </Text>
          </View>
        </Section>
      ) : null}

      <Section title="我的訂單摘要">
        {order ? (
          <View style={styles.summary}>
            <Text style={styles.title}>{order.itemName} x {order.quantity}</Text>
            <Text style={styles.meta}>{formatOrderItemCustomizations(order)}</Text>
            <Text style={styles.amount}>{formatCurrency(order.subtotal)}</Text>
            <StatusBadge owner="payment" value={order.paymentStatus} />
            <Text style={styles.meta}>流團偏好：{order.fallbackPurchasePreference === "accept_original_price" ? "接受原價購買" : "不原價購買"}</Text>
          </View>
        ) : (
          <Text style={styles.meta}>尚未加入此團購。</Text>
        )}
      </Section>

      {discountStatus === "qualified" && payment ? (
        <Section title="優惠請款試算">
          <AmountLine label="預估結算金額" value={payment.finalAmount} />
          <AmountLine label="實際請款金額" value={payment.captureAmount} />
          <AmountLine label="釋放授權金額" value={payment.releasedAmount} />
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
  finalSettlementCard: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
    padding: 12
  },
  finalSettlementNotice: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
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

function AmountLine({ label, value, emptyLabel = "待計算" }) {
  return (
    <View style={styles.amountLine}>
      <Text style={styles.amountLineLabel}>{label}</Text>
      <Text style={styles.amountLineValue}>{value == null ? emptyLabel : formatCurrency(value)}</Text>
    </View>
  );
}

function DetailLine({ label, value }) {
  return (
    <View style={styles.amountLine}>
      <Text style={styles.amountLineLabel}>{label}</Text>
      <Text style={styles.amountLineValue}>{value}</Text>
    </View>
  );
}
