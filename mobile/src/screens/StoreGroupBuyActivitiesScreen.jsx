import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { MobileScreen, Section } from "../components/MobileScreen";
import { isJoinableGroupBuyActivity } from "../utils/groupBuyActivityStores";
import { getGroupBuyActivityProgress } from "../utils/groupBuyActivityProgress";

export function StoreGroupBuyActivitiesScreen({ navigation, route, appState, actions }) {
  const storeId = route.params?.storeId;
  const store = (appState.stores ?? []).find((item) => item.id === storeId) ?? null;
  const activities = (appState.groupBuyActivities ?? [])
    .filter((activity) => activity.storeId === storeId && isJoinableGroupBuyActivity(activity))
    .sort((left, right) => Date.parse(left.deadlineAt || 0) - Date.parse(right.deadlineAt || 0));

  return (
    <MobileScreen
      title={store?.name ?? "店家活動"}
      subtitle="選擇要查看的進行中團購"
      onBack={() => navigation.back()}
    >
      <ActivitySyncNotice
        status={appState.groupBuyActivitySyncStatus ?? "idle"}
        onRetry={() => actions.syncGroupBuyActivities().catch(() => {})}
      />

      {appState.storeSyncStatus === "error" ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>店家資料載入失敗</Text>
        </View>
      ) : null}

      <Section title={`可加入活動（${activities.length}）`}>
        {activities.map((activity) => {
          const progress = getGroupBuyActivityProgress(activity);
          return (
            <Pressable
              accessibilityRole="button"
              key={activity.id}
              onPress={() => navigation.go("groupBuyActivityDetail", { groupBuyActivityId: activity.id })}
              style={({ pressed }) => [styles.activityCard, pressed && styles.pressed]}
            >
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityMeta}>{activity.remainingTimeText || "截止時間未提供"}</Text>
              </View>
              <View style={styles.progressGroup}>
                <Text style={styles.progressText}>{progress.currentCups} / {progress.nextTarget} 杯</Text>
                <Text style={styles.detailText}>查看詳情 →</Text>
              </View>
            </Pressable>
          );
        })}

        {activities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>目前沒有可加入活動</Text>
            <Text style={styles.emptyText}>活動可能已截止或額滿，返回地圖後可選擇其他店家。</Text>
          </View>
        ) : null}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  activityCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 13
  },
  pressed: {
    opacity: 0.78
  },
  activityContent: {
    flex: 1,
    gap: 5
  },
  activityTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  activityMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  progressGroup: {
    alignItems: "flex-end",
    gap: 5
  },
  progressText: {
    color: "#b45309",
    fontSize: 13,
    fontWeight: "900"
  },
  detailText: {
    color: "#1f6feb",
    fontSize: 11,
    fontWeight: "800"
  },
  errorCard: {
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    padding: 12
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "900"
  },
  emptyCard: {
    gap: 5,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 14
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18
  }
});
