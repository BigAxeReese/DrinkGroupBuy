import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { DistanceRadiusFilter } from "../components/DistanceRadiusFilter";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { PearlStrip } from "../components/PearlStrip";
import { StatusBadge } from "../components/StatusBadge";
import { TonePill } from "../components/TonePill";
import { useDevLocationConfig } from "../hooks/useDevLocationConfig";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { calculateDistanceKm, formatDistanceKm } from "../utils/distance";
import { getGroupBuyActivityStore } from "../utils/groupBuyActivityStores";
import { getGroupBuyActivityProgress } from "../utils/groupBuyActivityProgress";

export function NearbyGroupBuyActivitiesScreen({ navigation, appState, actions, currentUserProfile, selectedCustomerId, selectedAuthUserId }) {
  const { groupBuyActivities, orders } = appState;
  const activitySyncStatus = appState.groupBuyActivitySyncStatus ?? "idle";
  const [radiusKm, setRadiusKm] = useState(null);
  const { config: locationConfig } = useDevLocationConfig(selectedAuthUserId);
  const [userPosition, setUserPosition] = useState(locationConfig.fixedLocation);

  // useFocusEffect (not useEffect): tabs stay mounted, so a plain effect would keep GPS watching
  // after this tab loses focus. Watching starts on focus and is torn down on every blur.
  useFocusEffect(useCallback(() => {
    const fallbackPosition = locationConfig.fixedLocation;
    // In live mode the previous position is kept while waiting for a new fix (this effect re-runs on
    // every re-focus of the tab); only the cases that will never produce a fix fall back to the fixed
    // location, so returning to this screen doesn't briefly jump to the default position.
    if (locationConfig.locationMode !== "live") {
      setUserPosition(fallbackPosition);
      return undefined;
    }

    if (Platform.OS === "web") {
      if (!navigator.geolocation) {
        setUserPosition(fallbackPosition);
        return undefined;
      }
      const watchId = navigator.geolocation.watchPosition(
        (position) => setUserPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => setUserPosition(fallbackPosition),
        { enableHighAccuracy: false }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }

    let active = true;
    let locationSubscription = null;
    (async () => {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (permission.status !== "granted") {
        setUserPosition(fallbackPosition);
        return;
      }
      const currentPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!active) return;
      setUserPosition({ latitude: currentPosition.coords.latitude, longitude: currentPosition.coords.longitude });
      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 3000 },
        (nextPosition) => {
          if (!active) return;
          setUserPosition({ latitude: nextPosition.coords.latitude, longitude: nextPosition.coords.longitude });
        }
      );
      if (!active) locationSubscription.remove();
    })().catch(() => setUserPosition(fallbackPosition));
    return () => {
      active = false;
      locationSubscription?.remove();
    };
  }, [locationConfig.locationMode, locationConfig.fixedLocation.latitude, locationConfig.fixedLocation.longitude]));

  const referencePosition = userPosition;
  const recruitingGroupBuyActivitiesWithDistance = useMemo(() => {
    const withDistance = groupBuyActivities
      .filter(isVisibleRecruitingGroupBuyActivity)
      .map((groupBuyActivity) => {
        const store = getGroupBuyActivityStore(groupBuyActivity);
        return { groupBuyActivity, distanceKm: calculateDistanceKm(referencePosition, store) };
      });
    withDistance.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
    return radiusKm == null
      ? withDistance
      : withDistance.filter((item) => item.distanceKm != null && item.distanceKm <= radiusKm);
  }, [groupBuyActivities, radiusKm, referencePosition.latitude, referencePosition.longitude]);
  const joinedGroupBuyActivityIds = new Set(
    (orders ?? [])
      .filter((order) => order.customerId === selectedCustomerId && isActiveJoinedOrder(order))
      .map((order) => order.groupBuyActivityId)
  );
  const activeGroupBuyActivity = groupBuyActivities.find((groupBuyActivity) => joinedGroupBuyActivityIds.has(groupBuyActivity.id) && isOngoingJoinedGroupBuyActivity(groupBuyActivity)) ?? null;
  const activeStore = getGroupBuyActivityStore(activeGroupBuyActivity);
  const activeProgress = activeGroupBuyActivity ? getGroupBuyActivityProgress(activeGroupBuyActivity) : null;

  return (
    <MobileScreen>
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(currentUserProfile?.displayName || "會").slice(0, 1)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text numberOfLines={1} style={styles.memberName}>{currentUserProfile?.displayName || "顧客"}</Text>
          {currentUserProfile?.email ? (
            <Text numberOfLines={1} style={styles.memberSubtitle}>{currentUserProfile.email}</Text>
          ) : null}
        </View>
      </View>

      <ActivitySyncNotice
        status={activitySyncStatus}
        onRetry={() => actions.syncGroupBuyActivities().catch(() => {})}
      />

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>進行中的團購</Text>
          {activeGroupBuyActivity ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.push("groupProgress", { groupBuyActivityId: activeGroupBuyActivity.id })}
              style={styles.manageLink}
            >
              <Text style={styles.manageLinkText}>管理 &gt;</Text>
            </Pressable>
          ) : null}
        </View>

        {activeGroupBuyActivity && activeProgress ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.push("groupBuyActivityDetail", { groupBuyActivityId: activeGroupBuyActivity.id })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.pillRow}>
              <StatusBadge owner="groupBuyActivity" value={activeGroupBuyActivity.status} />
              {activeGroupBuyActivity.remainingTimeText ? (
                <TonePill tone="warning" label={activeGroupBuyActivity.remainingTimeText} />
              ) : null}
            </View>
            <Text style={styles.activityTitle}>{activeGroupBuyActivity.title}</Text>
            <View style={styles.cupsRow}>
              <PearlStrip capsule current={activeProgress.currentCups} target={activeProgress.nextTarget} />
              <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.cupCount}>{activeProgress.currentCups} / {activeProgress.nextTarget} 杯</Text>
            </View>
            <Text style={styles.meta}>
              {getTargetSummary(activeGroupBuyActivity, activeProgress.nextTarget)}・剩餘 {activeProgress.remainingCups} 杯
            </Text>
            <DiscountSummaryCard compact groupBuyActivity={activeGroupBuyActivity} />
            <Text style={styles.storeLine}>
              {activeStore?.name ?? "店家資料未提供"} · {activeStore?.address || "地址未提供"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>目前沒有進行中的團購</Text>
            <Text style={styles.meta}>加入團購後，進行中的訂單會顯示在這裡。</Text>
          </View>
        )}
      </View>

      <Section title="附近熱門活動推薦">
        <DistanceRadiusFilter onChange={setRadiusKm} value={radiusKm} />
        <View style={styles.recommendList}>
          {recruitingGroupBuyActivitiesWithDistance.map(({ groupBuyActivity, distanceKm }) => {
            const store = getGroupBuyActivityStore(groupBuyActivity);
            const progress = getGroupBuyActivityProgress(groupBuyActivity);
            const distanceText = formatDistanceKm(distanceKm);
            return (
              <Pressable
                accessibilityRole="button"
                key={groupBuyActivity.id}
                onPress={() => navigation.push("groupBuyActivityDetail", { groupBuyActivityId: groupBuyActivity.id })}
                style={({ pressed }) => [styles.recommendRow, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.recommendStore}>{store?.name ?? "店家資料未提供"}</Text>
                  <Text style={styles.recommendTitle}>
                    {groupBuyActivity.title}
                    {distanceText ? ` · ${distanceText}` : ""}
                  </Text>
                </View>
                <View style={styles.recommendProgress}>
                  <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.recommendCups}>{progress.currentCups} / {progress.nextTarget} 杯</Text>
                  <PearlStrip current={progress.currentCups} target={progress.nextTarget} />
                </View>
              </Pressable>
            );
          })}
          {recruitingGroupBuyActivitiesWithDistance.length === 0 ? (
            <View style={styles.emptyRecommend}>
              <Text style={styles.meta}>目前沒有招募中的團購。</Text>
            </View>
          ) : null}
        </View>
      </Section>
    </MobileScreen>
  );
}

function getTargetSummary(groupBuyActivity, targetCups) {
  const tier = (groupBuyActivity.tiers ?? []).find((item) => Number(item.cups ?? item.targetCups) === Number(targetCups));
  const discountPercent = tier?.discountPercent ?? groupBuyActivity.tiers?.[0]?.discountPercent ?? 0;
  return `目標：滿 ${targetCups} 杯打 ${formatDealFactorLabel(discountPercent) || "—"}`;
}

function isVisibleRecruitingGroupBuyActivity(groupBuyActivity) {
  return ["recruiting", "confirmed"].includes(groupBuyActivity.status)
    && groupBuyActivity.canJoin !== false
    && !groupBuyActivity.cancellationReason;
}

function isActiveJoinedOrder(order) {
  return !["cancelled", "completed"].includes(order.status);
}

function isOngoingJoinedGroupBuyActivity(groupBuyActivity) {
  return !["cancelled", "completed", "failed"].includes(groupBuyActivity.status)
    && !groupBuyActivity.cancellationReason;
}

const styles = StyleSheet.create({
  // This screen has no title row, so without the extra top padding the avatar sat 8px from the top
  // edge (MobileScreen's own top padding); the merchant home has a header row above its store row.
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    paddingTop: spacing.s32
  },
  avatar: {
    width: sizes.tap,
    height: sizes.tap,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.recess
  },
  avatarText: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    ...typeScale.screenTitle,
    color: colors.text
  },
  memberSubtitle: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  sectionBlock: {
    gap: spacing.s12
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  manageLink: {
    minHeight: sizes.tap,
    justifyContent: "center",
    paddingLeft: spacing.s12
  },
  manageLinkText: {
    ...typeScale.label,
    color: colors.accentInk
  },
  card: {
    gap: spacing.s12,
    padding: spacing.s20,
    borderRadius: radii.lg,
    borderWidth: sizes.stroke,
    borderColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  cardTitle: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  pressed: {
    opacity: 0.8
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s8
  },
  activityTitle: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  cupsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12
  },
  cupCount: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  meta: {
    ...typeScale.bodyDense,
    color: colors.textSecondary
  },
  storeLine: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  recommendList: {
    gap: spacing.s12
  },
  recommendRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
    padding: spacing.s16,
    borderRadius: radii.md,
    borderWidth: sizes.stroke,
    borderColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  flex: {
    flex: 1
  },
  recommendStore: {
    ...typeScale.button,
    color: colors.text
  },
  recommendTitle: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  recommendProgress: {
    alignItems: "flex-end",
    gap: spacing.s4
  },
  recommendCups: {
    ...typeScale.label,
    color: colors.text
  },
  emptyRecommend: {
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.s16,
    borderRadius: radii.md,
    backgroundColor: colors.recess
  }
});
