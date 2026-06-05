import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { getStoreById } from "../utils/calculations";

export function AdminDashboardScreen({ navigation, appState, memberAction }) {
  const authorizedOrders = appState.orders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;
  const capturedOrders = appState.orders.filter((order) => order.paymentStatus === "captured").length;

  return (
    <MobileScreen title="管理員後台" subtitle="Prototype only，不包含正式管理員權限。" onMemberPress={memberAction}>
      <View style={styles.summaryRow}>
        <SummaryCard label="團購活動" value={appState.deals.length} />
        <SummaryCard label="訂單" value={appState.orders.length} />
        <SummaryCard label="已預授權" value={authorizedOrders} />
      </View>

      <Section title="全平台團購">
        {appState.deals.map((deal) => {
          const store = getStoreById(stores, deal.storeId);
          const relatedOrders = appState.orders.filter((order) => order.dealId === deal.id);
          const relatedCapturedOrders = relatedOrders.filter((order) => order.paymentStatus === "captured").length;

          return (
            <Pressable
              accessibilityRole="button"
              key={deal.id}
              onPress={() => navigation.go("dealDetail", { dealId: deal.id })}
              style={({ pressed }) => [styles.dealCard, pressed && styles.pressed]}
            >
              <View style={styles.dealHeader}>
                <View style={styles.flex}>
                  <Text style={styles.dealTitle}>{deal.title}</Text>
                  <Text style={styles.meta}>{store?.name}</Text>
                </View>
                <StatusBadge value={deal.status} />
              </View>
              <Text style={styles.meta}>團購進度：{deal.currentCups} / {deal.targetCups} 杯</Text>
              <Text style={styles.meta}>訂單 {relatedOrders.length} 筆 · 已請款 {relatedCapturedOrders} 筆</Text>
            </Pressable>
          );
        })}
      </Section>
    </MobileScreen>
  );
}

function SummaryCard({ label, value }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 8
  },
  summaryCard: {
    flex: 1,
    gap: 3,
    borderRadius: 14,
    backgroundColor: "#eaf2ff",
    padding: 10
  },
  summaryValue: {
    color: "#1f6feb",
    fontSize: 22,
    fontWeight: "900"
  },
  summaryLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  dealCard: {
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 11
  },
  dealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  flex: {
    flex: 1
  },
  dealTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.75
  }
});
