import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { getStoreById } from "../utils/calculations";

export function NearbyDealsScreen({ navigation, appState, memberAction }) {
  const { deals } = appState;
  const activeDeal = deals.find((deal) => deal.status === "recruiting") ?? deals[0];
  const activeStore = getStoreById(stores, activeDeal.storeId);
  const recommendedDeals = deals.filter((deal) => deal.id !== activeDeal.id).slice(0, 3);
  const cupsLeft = Math.max(0, activeDeal.targetCups - activeDeal.currentCups);

  return (
    <MobileScreen title="" compactHeader>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>Alice Wang</Text>
            <Text style={styles.memberSubtitle}>珍奶控 · 今天要喝一杯</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={memberAction} style={styles.memberPill}>
            <Text style={styles.memberPillText}>會員</Text>
          </Pressable>
        </View>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>個人信用評分</Text>
          <Text style={styles.scoreValue}>98<Text style={styles.scoreUnit}> / 100</Text></Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>進行中的團購</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.go("groupProgress", { dealId: activeDeal.id, orderId: "order-001" })}>
          <Text style={styles.manageLink}>管理 ›</Text>
        </Pressable>
      </View>

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
              <Text style={styles.deadline}>⏰ 倒數 {activeDeal.remainingTimeText.replace("剩 ", "")}</Text>
            </View>
            <Text style={styles.cupCount}>{activeDeal.currentCups}<Text style={styles.cupUnit}>/{activeDeal.targetCups}杯</Text></Text>
          </View>
          <View style={styles.dealMetaRow}>
            <Text style={styles.meta}>優惠：滿 {activeDeal.targetCups} 杯折 {activeDeal.tiers[0]?.discountAmount}</Text>
            <Text style={styles.meta}>剩餘 {cupsLeft} 杯</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((activeDeal.currentCups / activeDeal.targetCups) * 100))}%` }]} />
          </View>
          <Text style={styles.storeLine}>{activeStore?.name} · {activeStore?.distanceText}</Text>
        </View>
      </Pressable>

      <Section title="🔥 附近熱門活動推薦">
        <View style={styles.recommendRow}>
          {recommendedDeals.map((deal) => {
            const store = getStoreById(stores, deal.storeId);
            return (
              <Pressable
                accessibilityRole="button"
                key={deal.id}
                onPress={() => navigation.go("dealDetail", { dealId: deal.id })}
                style={({ pressed }) => [styles.recommendCard, pressed && styles.pressed]}
              >
                <StatusBadge value={deal.status} />
                <Text style={styles.recommendTitle}>{deal.title}</Text>
                <Text style={styles.meta}>{store?.name}</Text>
                <Text style={styles.joinNow}>立即跟團</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: -16,
    marginTop: -78,
    paddingTop: 92,
    paddingHorizontal: 22,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: "#2f6df6",
    gap: 18
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#facc15",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.72)"
  },
  avatarText: {
    color: "#1e3a8a",
    fontSize: 26,
    fontWeight: "900"
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900"
  },
  memberSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3
  },
  memberPill: {
    minHeight: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14
  },
  memberPillText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  scoreCard: {
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16
  },
  scoreLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  scoreValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900"
  },
  scoreUnit: {
    fontSize: 13,
    fontWeight: "700"
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900"
  },
  manageLink: {
    color: "#1f6feb",
    fontSize: 14,
    fontWeight: "900"
  },
  activeCard: {
    flexDirection: "row",
    borderRadius: 22,
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
    gap: 12,
    padding: 16
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
    fontSize: 13,
    fontWeight: "700"
  },
  dealTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900"
  },
  deadline: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5
  },
  cupCount: {
    color: "#3b64d8",
    fontSize: 28,
    fontWeight: "900"
  },
  cupUnit: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "800"
  },
  dealMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  progressTrack: {
    height: 8,
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
    fontSize: 13,
    fontWeight: "800"
  },
  recommendRow: {
    flexDirection: "row",
    gap: 12
  },
  recommendCard: {
    flex: 1,
    minHeight: 154,
    borderRadius: 18,
    backgroundColor: "#eef5ff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    gap: 10,
    padding: 14
  },
  recommendTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  joinNow: {
    marginTop: "auto",
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    color: "#1f6feb",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center"
  }
});
