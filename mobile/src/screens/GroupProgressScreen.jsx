import { StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { Card } from "../components/Card";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { EmptyPanel } from "../components/EmptyPanel";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { ValueRow } from "../components/ValueRow";
import { colors, maxFontSizeMultiplier, spacing, typeScale } from "../theme/tokens";
import { getGroupBuyActivityById, formatCurrency } from "../utils/calculations";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getFinalSettlementSnapshot, getGroupBuyActivityProgress } from "../utils/groupBuyActivityProgress";
import { formatOrderItemCustomizations } from "../utils/orderItems";
import { goToCustomerHome } from "../navigation/goToCustomerHome";

export function GroupProgressScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  const activitySyncStatus = appState.groupBuyActivitySyncStatus ?? "idle";
  const retryActivitySync = () => actions.syncGroupBuyActivities().catch(() => {});
  if (!groupBuyActivity) {
    return (
      <MobileScreen
        title="團購進度"
        onBack={() => navigation.goBack()}
        onMemberPress={memberAction}
      >
        <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
        <Section title="目前沒有團購資料">
          <EmptyPanel>團購已清空，或目前尚未有商家建立活動。</EmptyPanel>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => goToCustomerHome(navigation)} />
        </Section>
      </MobileScreen>
    );
  }

  const order = appState.orders.find((item) => item.id === route.params?.orderId && item.customerId === selectedCustomerId)
    ?? appState.orders.find((item) => item.groupBuyActivityId === groupBuyActivity.id && item.customerId === selectedCustomerId);
  const payment = appState.paymentAuthorizations.find((item) => item.orderId === order?.id);
  const finalSettlement = getFinalSettlementSnapshot(groupBuyActivity, order);
  // groupBuyActivity.targetCups is always the first tier's threshold, not a ceiling -- once
  // authorizedCups passes it, treating it as the progress denominator reads as an impossible
  // overshoot (see GroupBuyActivityDetailScreen for the same fix). Reuse the same shared
  // derivation the nearby-activities list already uses instead of re-deriving it here.
  const progress = getGroupBuyActivityProgress(groupBuyActivity);
  const authorizedCups = progress.currentCups;
  const targetCups = progress.nextTarget;
  const reachedTier = progress.reachedTier;
  const nextTierText = targetCups > 0 && authorizedCups < targetCups
    ? `下一級距：還差 ${progress.remainingCups} 杯達到 ${targetCups} 杯`
    : reachedTier
      ? `已達目前最高級距：${reachedTier} 杯`
      : "目前沒有下一級距資料";
  const discountStatus = reachedTier ? "qualified" : "not_yet_qualified";

  return (
    <MobileScreen
      title="團購進度"
      onBack={() => navigation.goBack()}
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
        <View style={styles.notes}>
          <Text style={styles.meta}>只有預授權成功的杯數才計入優惠門檻。</Text>
          <Text style={styles.meta}>{nextTierText}</Text>
        </View>
        <DiscountSummaryCard groupBuyActivity={groupBuyActivity} />
      </Section>

      {finalSettlement ? (
        <Section title="最終結算結果">
          <View style={styles.rows}>
            <ValueRow label="結算結果" value={finalSettlement.outcomeLabel} />
            <ValueRow label="最終有效杯數" value={`${finalSettlement.authorizedCups} 杯`} />
            <ValueRow
              label="最終折數"
              value={finalSettlement.discountPercent ? formatDealFactorLabel(finalSettlement.discountPercent) : "未達優惠門檻"}
            />
            {finalSettlement.hasOrder ? (
              <AmountLine label="我的訂單原價" value={finalSettlement.originalAmount} />
            ) : null}
            {finalSettlement.hasOrder ? (
              <AmountLine
                label="我的實際應付"
                value={finalSettlement.finalAmount}
                emptyLabel="待同步訂單"
                emphasis
              />
            ) : null}
            {finalSettlement.hasOrder ? (
              <AmountLine
                label="我的訂單折扣"
                value={finalSettlement.orderDiscountAmount}
                emptyLabel="待同步訂單"
              />
            ) : null}
          </View>
          {/* Same text for every outcome, so a fixed neutral tone: it must not read as a success or failure signal. */}
          <Notice
            tone="neutral"
            message="此區使用 Backend 保存的截止結算快照，與截止前的預估折扣不同，結算後不再變動。"
          />
        </Section>
      ) : null}

      <Section title="我的訂單摘要">
        {order ? (
          <Card>
            <Text style={styles.title}>{order.itemName} x {order.quantity}</Text>
            <Text style={styles.meta}>{formatOrderItemCustomizations(order)}</Text>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.amount}>{formatCurrency(order.subtotal)}</Text>
            <StatusBadge owner="payment" value={order.paymentStatus} />
            <Text style={styles.meta}>流團偏好：{order.fallbackPurchasePreference === "accept_original_price" ? "接受原價購買" : "不原價購買"}</Text>
          </Card>
        ) : (
          <EmptyPanel>尚未加入此團購。</EmptyPanel>
        )}
      </Section>

      {discountStatus === "qualified" && payment ? (
        <Section title="優惠請款試算">
          <View style={styles.rows}>
            <AmountLine label="預估結算金額" value={payment.finalAmount} />
            <AmountLine label="實際請款金額" value={payment.captureAmount} />
            <AmountLine label="釋放授權金額" value={payment.releasedAmount} />
          </View>
        </Section>
      ) : null}

      <View style={styles.actions}>
        {order ? (
          <>
            <PrimaryButton label="Line Pay 預授權" onPress={() => navigation.push("paymentAuthorization", { groupBuyActivityId: groupBuyActivity.id, orderId: order.id })} />
            <PrimaryButton label="取貨資訊" variant="secondary" onPress={() => navigation.push("pickupInfo", { groupBuyActivityId: groupBuyActivity.id, orderId: order.id })} />
          </>
        ) : (
          <PrimaryButton label="先選擇飲料" variant="secondary" onPress={() => navigation.push("drinkSelection", { groupBuyActivityId: groupBuyActivity.id })} />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  meta: {
    ...typeScale.bodyDense,
    color: colors.textSecondary
  },
  notes: {
    gap: spacing.s4
  },
  title: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  amount: {
    ...typeScale.amount,
    color: colors.text
  },
  rows: {
    gap: spacing.s8
  },
  actions: {
    gap: spacing.s12
  }
});

function AmountLine({ label, value, emptyLabel = "待計算", emphasis }) {
  return <ValueRow label={label} value={value == null ? emptyLabel : formatCurrency(value)} emphasis={emphasis} />;
}
