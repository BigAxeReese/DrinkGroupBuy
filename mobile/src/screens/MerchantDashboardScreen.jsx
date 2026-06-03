import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { getStoreById } from "../utils/calculations";

export function MerchantDashboardScreen({ navigation, appState, memberAction }) {
  return (
    <MobileScreen title="商家儀表板" onMemberPress={memberAction}>
      <PrimaryButton label="建立新的優惠活動" onPress={() => navigation.go("merchantCreate")} />

      <Section title="活動清單">
        {appState.deals.map((deal) => {
          const store = getStoreById(stores, deal.storeId);
          const relatedOrders = appState.orders.filter((order) => order.dealId === deal.id);
          const authorizedOrders = relatedOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;
          const capturedOrders = relatedOrders.filter((order) => order.paymentStatus === "captured").length;
          const readyPickups = relatedOrders.filter((order) => order.pickupStatus === "ready").length;

          return (
            <Pressable
              accessibilityRole="button"
              key={deal.id}
              onPress={() => navigation.go("dealDetail", { dealId: deal.id })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.header}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{deal.title}</Text>
                  <Text style={styles.meta}>{store?.name}</Text>
                </View>
                <StatusBadge value={deal.status} />
              </View>
              <ProgressSummary
                currentCups={deal.currentCups}
                targetCups={deal.targetCups}
                participantCount={deal.participantCount}
                remainingTimeText={deal.remainingTimeText}
              />
              <View style={styles.summaryRow}>
                <Text style={styles.summary}>訂單 {relatedOrders.length} 筆</Text>
                <Text style={styles.summary}>預授權 {authorizedOrders} 筆</Text>
              </View>
              <Text style={styles.summary}>已請款 {capturedOrders} 筆 · 取貨 ready：{readyPickups} 筆</Text>
            </Pressable>
          );
        })}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 14
  },
  pressed: {
    opacity: 0.8
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  flex: {
    flex: 1
  },
  title: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 3
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  summary: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800"
  }
});
