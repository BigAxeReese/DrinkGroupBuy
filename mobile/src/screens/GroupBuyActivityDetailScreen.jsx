import { StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { getGroupBuyActivityById, isWithdrawalLocked } from "../utils/calculations";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getGroupBuyActivityStore } from "../utils/groupBuyActivityStores";
import { getGroupBuyActivityJoinAction } from "../utils/groupBuyActivityJoinState";
import { getGroupBuyActivityProgress } from "../utils/groupBuyActivityProgress";

export function GroupBuyActivityDetailScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  const existingOrder = groupBuyActivity
    ? appState.orders.find((order) => (
      order.groupBuyActivityId === groupBuyActivity.id
        && order.customerId === selectedCustomerId
        && order.status !== "cancelled"
    ))
    : null;
  const activitySyncStatus = appState.groupBuyActivitySyncStatus ?? "idle";
  const retryActivitySync = () => actions.syncGroupBuyActivities().catch(() => {});
  if (!groupBuyActivity) {
    return (
      <MobileScreen
        title="團購詳情"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
        <Section title="目前沒有團購資料">
          <EmptyPanel>團購已清空，或目前尚未有商家建立活動。</EmptyPanel>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }

  const store = getGroupBuyActivityStore(groupBuyActivity);
  const withdrawalLocked = isWithdrawalLocked(groupBuyActivity);
  const joinAction = getGroupBuyActivityJoinAction(groupBuyActivity, Boolean(existingOrder));
  // groupBuyActivity.targetCups is always the FIRST tier's threshold (see
  // groupBuyActivityReadRepository.js), not a ceiling -- once currentCups passes it, showing
  // "current / targetCups" reads as an impossible overshoot. getGroupBuyActivityProgress (already
  // used the same way on the nearby-activities list) swaps in the next unreached tier, or the
  // highest tier once all are reached.
  const progress = getGroupBuyActivityProgress(groupBuyActivity);

  return (
    <MobileScreen
      title="團購詳情"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
      <Section title="店家資訊">
        <Card>
          <View style={styles.rowBetween}>
            <Text style={[styles.title, styles.flex]}>{store?.name ?? "店家資料未提供"}</Text>
            <StatusBadge value={groupBuyActivity.status} />
          </View>
          <Text style={styles.meta}>{store?.address || "地址未提供"}</Text>
          {store?.phone ? <Text style={styles.meta}>{store.phone}</Text> : null}
        </Card>
      </Section>

      <Section title="目前進度">
        <Text style={styles.title}>{groupBuyActivity.title}</Text>
        <ProgressSummary
          currentCups={progress.currentCups}
          targetCups={progress.nextTarget}
          participantCount={groupBuyActivity.participantCount}
          remainingTimeText={groupBuyActivity.remainingTimeText}
        />
        <DiscountSummaryCard groupBuyActivity={groupBuyActivity} />
        <View style={styles.schedule}>
          <Text style={styles.meta}>截止：{groupBuyActivity.endTime}</Text>
          <Text style={styles.meta}>取貨：{groupBuyActivity.pickupTime}</Text>
        </View>
      </Section>

      <Section title="杯數級距">
        {groupBuyActivity.tiers.map((tier) => (
          <View key={tier.cups} style={styles.tierRow}>
            <Text style={styles.tierText}>滿 {tier.cups} 杯</Text>
            <Text style={styles.tierValue}>打 {formatDealFactorLabel(tier.discountPercent) || "—"}</Text>
          </View>
        ))}
      </Section>

      <Section title="注意事項">
        {withdrawalLocked ? <Notice tone="warning" message="目前距截止時間 30 分鐘內：仍可加入，既有訂單只能增加飲料，不能減少或退出。" /> : null}
        {groupBuyActivity.cancellationReason ? <Notice tone="danger" message={`取消原因：${groupBuyActivity.cancellationReason}`} /> : null}
        {groupBuyActivity.notices.length > 0 ? (
          <View style={styles.notes}>
            {groupBuyActivity.notices.map((notice) => <Text key={notice} style={styles.meta}>· {notice}</Text>)}
          </View>
        ) : null}
      </Section>

      <View style={styles.actions}>
        <PrimaryButton
          label={joinAction.label}
          onPress={() => {
            if (joinAction.target === "customerOrders") {
              navigation.go("customerOrders");
            } else if (joinAction.target === "drinkSelection") {
              navigation.go("drinkSelection", { groupBuyActivityId: groupBuyActivity.id });
            }
          }}
        />
        <PrimaryButton
          label="查看團購進度"
          variant="secondary"
          onPress={() => navigation.go("groupProgress", { groupBuyActivityId: groupBuyActivity.id })}
        />
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.s12
  },
  flex: {
    flex: 1
  },
  title: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  meta: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  schedule: {
    gap: spacing.s4
  },
  tierRow: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.sm,
    backgroundColor: colors.recess,
    paddingHorizontal: spacing.s16
  },
  tierText: {
    ...typeScale.body,
    color: colors.text
  },
  tierValue: {
    ...typeScale.body,
    fontWeight: typeScale.label.fontWeight,
    color: colors.accentInk
  },
  notes: {
    gap: spacing.s8
  },
  // MobileScreen leaves 24 between its direct children; the two buttons belong together.
  actions: {
    gap: spacing.s12
  }
});
