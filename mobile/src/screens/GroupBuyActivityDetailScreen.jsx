import { StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { getGroupBuyActivityById, formatCurrency, isWithdrawalLocked } from "../utils/calculations";
import { getGroupBuyActivityStore } from "../utils/groupBuyActivityStores";

export function GroupBuyActivityDetailScreen({ navigation, route, appState, actions, memberAction }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
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
          <Text style={styles.meta}>團購已清空，或目前尚未有商家建立活動。</Text>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }

  const store = getGroupBuyActivityStore(groupBuyActivity);
  const withdrawalLocked = isWithdrawalLocked(groupBuyActivity);

  return (
    <MobileScreen
      title="團購詳情"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <ActivitySyncNotice status={activitySyncStatus} onRetry={retryActivitySync} />
      <Section title="店家資訊">
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.title}>{store?.name ?? "店家資料未提供"}</Text>
            <Text style={styles.meta}>{store?.address || "地址未提供"}</Text>
            {store?.phone ? <Text style={styles.meta}>{store.phone}</Text> : null}
          </View>
          <StatusBadge value={groupBuyActivity.status} />
        </View>
      </Section>

      <Section title="目前進度">
        <Text style={styles.title}>{groupBuyActivity.title}</Text>
        <ProgressSummary
          currentCups={groupBuyActivity.currentCups}
          targetCups={groupBuyActivity.targetCups}
          participantCount={groupBuyActivity.participantCount}
          remainingTimeText={groupBuyActivity.remainingTimeText}
        />
        <DiscountSummaryCard groupBuyActivity={groupBuyActivity} />
        <Text style={styles.meta}>截止：{groupBuyActivity.endTime}</Text>
        <Text style={styles.meta}>取貨：{groupBuyActivity.pickupTime}</Text>
      </Section>

      <Section title="杯數級距">
        {groupBuyActivity.tiers.map((tier) => (
          <View key={tier.cups} style={styles.tierRow}>
            <Text style={styles.tierText}>滿 {tier.cups} 杯</Text>
            <Text style={styles.tierValue}>折 {formatCurrency(tier.discountAmount)}</Text>
          </View>
        ))}
      </Section>

      <Section title="注意事項">
        {withdrawalLocked ? <Text style={styles.lockNotice}>目前距截止時間 30 分鐘內：仍可加入，但既有訂單不可修改或退出。</Text> : null}
        {groupBuyActivity.cancellationReason ? <Text style={styles.warning}>取消原因：{groupBuyActivity.cancellationReason}</Text> : null}
        {groupBuyActivity.notices.map((notice) => <Text key={notice} style={styles.meta}>· {notice}</Text>)}
      </Section>

      <PrimaryButton
        label={groupBuyActivity.canJoin ? "選擇飲料並加入" : "目前不可加入"}
        onPress={() => groupBuyActivity.canJoin && navigation.go("drinkSelection", { groupBuyActivityId: groupBuyActivity.id })}
      />
      <PrimaryButton
        label="查看團購進度"
        variant="secondary"
        onPress={() => navigation.go("groupProgress", { groupBuyActivityId: groupBuyActivity.id })}
      />
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  flex: {
    flex: 1
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  warning: {
    color: "#b42318",
    fontSize: 14,
    fontWeight: "800"
  },
  lockNotice: {
    color: "#b45309",
    fontSize: 13,
    fontWeight: "900"
  },
  tierRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14
  },
  tierText: {
    color: "#334155",
    fontWeight: "800"
  },
  tierValue: {
    color: "#1f6feb",
    fontWeight: "900"
  }
});
