import { StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PearlStrip } from "../components/PearlStrip";
import { colors, maxFontSizeMultiplier, spacing, typeScale } from "../theme/tokens";
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
      onBack={() => navigation.goBack()}
    >
      <ActivitySyncNotice
        status={appState.groupBuyActivitySyncStatus ?? "idle"}
        onRetry={() => actions.syncGroupBuyActivities().catch(() => {})}
      />

      {appState.storeSyncStatus === "error" ? (
        <Notice accessibilityRole="alert" title="店家資料載入失敗" tone="danger" />
      ) : null}

      <Section title={`可加入活動（${activities.length}）`}>
        {activities.map((activity) => {
          const progress = getGroupBuyActivityProgress(activity);
          return (
            <Card
              compact
              key={activity.id}
              onPress={() => navigation.push("groupBuyActivityDetail", { groupBuyActivityId: activity.id })}
              style={styles.activityRow}
            >
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityMeta}>{activity.remainingTimeText || "截止時間未提供"}</Text>
              </View>
              <View style={styles.progressGroup}>
                <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.progressText}>{progress.currentCups} / {progress.nextTarget} 杯</Text>
                <PearlStrip current={progress.currentCups} target={progress.nextTarget} />
                <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.detailText}>查看詳情 →</Text>
              </View>
            </Card>
          );
        })}

        {activities.length === 0 ? (
          <EmptyPanel title="目前沒有可加入活動">活動可能已截止或額滿，返回地圖後可選擇其他店家。</EmptyPanel>
        ) : null}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  // Card is a column by default; this puts the title block and the progress block side by side.
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12
  },
  activityContent: {
    flex: 1,
    gap: spacing.s4
  },
  activityTitle: {
    ...typeScale.button,
    color: colors.text
  },
  activityMeta: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  progressGroup: {
    alignItems: "flex-end",
    gap: spacing.s4
  },
  progressText: {
    ...typeScale.label,
    color: colors.text
  },
  detailText: {
    ...typeScale.label,
    color: colors.accentInk
  }
});
