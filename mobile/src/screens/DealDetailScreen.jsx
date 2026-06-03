import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { getDealById, getStoreById, formatCurrency } from "../utils/calculations";

export function DealDetailScreen({ navigation, route, appState, memberAction }) {
  const deal = getDealById(appState.deals, route.params?.dealId);
  const store = getStoreById(stores, deal.storeId);

  return (
    <MobileScreen
      title="團購詳情"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="店家資訊">
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.title}>{store?.name}</Text>
            <Text style={styles.meta}>{store?.address}</Text>
            <Text style={styles.meta}>{store?.phone} · {store?.distanceText}</Text>
          </View>
          <StatusBadge value={deal.status} />
        </View>
      </Section>

      <Section title="目前進度">
        <Text style={styles.title}>{deal.title}</Text>
        <ProgressSummary
          currentCups={deal.currentCups}
          targetCups={deal.targetCups}
          participantCount={deal.participantCount}
          remainingTimeText={deal.remainingTimeText}
        />
        <Text style={styles.meta}>截止：{deal.endTime}</Text>
        <Text style={styles.meta}>取貨：{deal.pickupTime}</Text>
      </Section>

      <Section title="杯數級距">
        {deal.tiers.map((tier) => (
          <View key={tier.cups} style={styles.tierRow}>
            <Text style={styles.tierText}>滿 {tier.cups} 杯</Text>
            <Text style={styles.tierValue}>折 {formatCurrency(tier.discountAmount)}</Text>
          </View>
        ))}
      </Section>

      <Section title="注意事項">
        {deal.cancellationReason ? <Text style={styles.warning}>取消原因：{deal.cancellationReason}</Text> : null}
        {deal.notices.map((notice) => <Text key={notice} style={styles.meta}>· {notice}</Text>)}
      </Section>

      <PrimaryButton
        label={deal.canJoin ? "選擇飲料並加入" : "目前不可加入"}
        onPress={() => deal.canJoin && navigation.go("drinkSelection", { dealId: deal.id })}
      />
      <PrimaryButton
        label="查看團購進度"
        variant="secondary"
        onPress={() => navigation.go("groupProgress", { dealId: deal.id, orderId: deal.id === "deal-002" ? "order-002" : "order-001" })}
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
