import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { customerUsers } from "../mock/customerUsers";
import { stores } from "../mock/stores";
import { getStoreById } from "../utils/calculations";
import { getDealProgress } from "../utils/dealProgress";

export function NearbyDealsScreen({ navigation, appState, memberAction, selectedCustomerId }) {
  const { deals, orders } = appState;
  const currentCustomer = customerUsers.find((user) => user.id === selectedCustomerId) ?? customerUsers[0];
  const recruitingDeals = deals.filter(isVisibleRecruitingDeal);
  const joinedDealIds = new Set(
    (orders ?? [])
      .filter((order) => order.customerId === selectedCustomerId && isActiveJoinedOrder(order))
      .map((order) => order.dealId)
  );
  const activeDeal = deals.find((deal) => joinedDealIds.has(deal.id) && isOngoingJoinedDeal(deal)) ?? null;
  const activeStore = activeDeal ? getStoreById(stores, activeDeal.storeId) : null;
  const activeProgress = activeDeal ? getDealProgress(activeDeal) : null;

  return (
    <MobileScreen title="" compactHeader>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{currentCustomer.avatarText}</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{currentCustomer.name}</Text>
            <Text style={styles.memberSubtitle}>{currentCustomer.subtitle}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={memberAction} style={styles.memberPill}>
            <Text style={styles.memberPillText}>會員</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>進行中的團購</Text>
        {activeDeal ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.go("groupProgress", { dealId: activeDeal.id })}>
            <Text style={styles.manageLink}>管理 &gt;</Text>
          </Pressable>
        ) : null}
      </View>

      {activeDeal && activeProgress ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.go("dealDetail", { dealId: activeDeal.id })}
          style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}
        >
          <View style={styles.orangeRail} />
          <View style={styles.activeContent}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleGroup}>
                <Text style={styles.dealTitle}>{activeDeal.title}</Text>
                <Text style={styles.deadline}>剩餘 {activeDeal.remainingTimeText}</Text>
              </View>
              <Text style={styles.cupCount}>
                {activeProgress.currentCups} / {activeProgress.nextTarget}
                <Text style={styles.cupUnit}> 杯</Text>
              </Text>
            </View>
            <View style={styles.dealMetaRow}>
              <Text style={styles.meta}>{getTargetSummary(activeDeal, activeProgress.nextTarget)}</Text>
              <Text style={styles.meta}>剩餘 {activeProgress.remainingCups} 杯</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${activeProgress.progressPercent}%` }]} />
            </View>
            <Text style={styles.storeLine}>{activeStore?.name} · {activeStore?.distanceText}</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>目前沒有進行中的團購</Text>
          <Text style={styles.emptyText}>加入團購後，進行中的訂單會顯示在這裡。</Text>
        </View>
      )}

      <Section title="附近熱門活動推薦">
        <View style={styles.recommendList}>
          {recruitingDeals.map((deal) => {
            const store = getStoreById(stores, deal.storeId);
            const progress = getDealProgress(deal);
            return (
              <Pressable
                accessibilityRole="button"
                key={deal.id}
                onPress={() => navigation.go("dealDetail", { dealId: deal.id })}
                style={({ pressed }) => [styles.recommendRow, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.recommendStore}>{store?.name}</Text>
                  <Text style={styles.recommendTitle}>{deal.title}</Text>
                </View>
                <Text style={styles.recommendCups}>{progress.currentCups} / {progress.nextTarget} 杯</Text>
              </Pressable>
            );
          })}
          {recruitingDeals.length === 0 ? (
            <View style={styles.emptyRecommendCard}>
              <Text style={styles.emptyRecommendText}>目前沒有招募中的團購。</Text>
            </View>
          ) : null}
        </View>
      </Section>
    </MobileScreen>
  );
}

function getTargetSummary(deal, targetCups) {
  const tier = (deal.tiers ?? []).find((item) => Number(item.cups ?? item.targetCups) === Number(targetCups));
  const discountAmount = tier?.discountAmount ?? deal.tiers?.[0]?.discountAmount ?? 0;
  return `目標：滿 ${targetCups} 杯折 ${discountAmount}`;
}

function isVisibleRecruitingDeal(deal) {
  return deal.status === "recruiting"
    && deal.canJoin !== false
    && !deal.cancellationReason;
}

function isActiveJoinedOrder(order) {
  return !["cancelled", "completed"].includes(order.status);
}

function isOngoingJoinedDeal(deal) {
  return !["cancelled", "completed", "failed"].includes(deal.status)
    && !deal.cancellationReason;
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: -14,
    marginTop: -70,
    paddingTop: 82,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: "#2f6df6",
    gap: 18
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#facc15",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.72)"
  },
  avatarText: {
    color: "#1e3a8a",
    fontSize: 22,
    fontWeight: "900"
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
  },
  memberSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  memberPill: {
    minHeight: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12
  },
  memberPillText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900"
  },
  manageLink: {
    color: "#1f6feb",
    fontSize: 12,
    fontWeight: "900"
  },
  activeCard: {
    flexDirection: "row",
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eef2f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: "hidden"
  },
  orangeRail: {
    width: 5,
    backgroundColor: "#f97316"
  },
  activeContent: {
    flex: 1,
    gap: 10,
    padding: 13
  },
  pressed: {
    opacity: 0.8
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  cardTitleGroup: {
    flex: 1
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  dealTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  deadline: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5
  },
  cupCount: {
    color: "#3b64d8",
    fontSize: 23,
    fontWeight: "900"
  },
  cupUnit: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800"
  },
  dealMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#fb923c"
  },
  storeLine: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  emptyCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 16
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19
  },
  recommendList: {
    gap: 8
  },
  recommendRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  flex: {
    flex: 1
  },
  emptyRecommendCard: {
    minHeight: 70,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14
  },
  emptyRecommendText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  recommendStore: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  recommendTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3
  },
  recommendCups: {
    color: "#1f6feb",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right"
  }
});
