import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { formatCurrency, getStoreById } from "../utils/calculations";

export function MerchantDashboardScreen({ navigation, appState, actions, memberAction, selectedMerchantStoreId }) {
  const [tab, setTab] = useState("active");
  const merchantStore = stores.find((store) => store.id === selectedMerchantStoreId) ?? stores[0];
  const merchantDeals = appState.deals.filter((deal) => deal.storeId === merchantStore.id);
  const activeDeals = merchantDeals.filter((deal) => ["recruiting", "confirmed", "ordering"].includes(deal.status));
  const activeDealIds = new Set(activeDeals.map((deal) => deal.id));
  const merchantDealIds = new Set(merchantDeals.map((deal) => deal.id));
  const activeOrders = appState.orders.filter((order) => (
    activeDealIds.has(order.dealId)
    && order.status !== "cancelled"
    && order.merchantAcceptanceStatus !== "cancelled"
  ));
  const historyOrders = appState.orders.filter((order) => {
    const deal = appState.deals.find((item) => item.id === order.dealId);
    return merchantDealIds.has(order.dealId) && (
      ["readyForPickup", "completed", "cancelled"].includes(order.status)
      || ["ready", "picked_up", "cancelled"].includes(order.pickupStatus)
      || ["cancelled", "failed", "completed"].includes(deal?.status)
    );
  });
  const pendingAcceptanceCount = activeOrders.filter((order) => order.merchantAcceptanceStatus === "pending").length;
  const authorizedOrderCount = activeOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;

  return (
    <MobileScreen title="" compactHeader>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.storeAvatar}>
            <Text style={styles.storeAvatarText}>店</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.storeName}>{merchantStore.name}</Text>
            <Text style={styles.storeSubtitle}>商家首頁 · Prototype 身分：{merchantStore.id}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={memberAction} style={styles.memberPill}>
            <Text style={styles.memberPillText}>會員</Text>
          </Pressable>
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="進行中活動" value={activeDeals.length} />
          <MetricCard label="待確認接單" value={pendingAcceptanceCount} />
          <MetricCard label="已預授權" value={authorizedOrderCount} />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{tab === "active" ? "進行中的團購" : "歷史訂單"}</Text>
        {tab === "active" ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.go("merchantCreate")}>
            <Text style={styles.createLink}>＋ 開團</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("active")}
          style={[styles.tabItem, tab === "active" && styles.activeTabItem]}
        >
          <Text style={[styles.tabText, tab === "active" && styles.activeTabText]}>進行中</Text>
        </Pressable>
        <View style={styles.tabDivider} />
        <Pressable
          accessibilityRole="button"
          onPress={() => setTab("history")}
          style={[styles.tabItem, tab === "history" && styles.activeTabItem]}
        >
          <Text style={[styles.tabText, tab === "history" && styles.activeTabText]}>歷史訂單</Text>
        </Pressable>
      </View>

      {tab === "active" ? (
        <Section title="活動清單">
        {activeDeals.length === 0 ? (
          <Text style={styles.emptyText}>目前沒有進行中的團購。點右上「＋ 開團」建立測試活動。</Text>
        ) : null}
        {activeDeals.map((deal) => {
          const store = getStoreById(stores, deal.storeId);
          const relatedOrders = appState.orders.filter((order) => (
            order.dealId === deal.id
            && order.status !== "cancelled"
            && order.merchantAcceptanceStatus !== "cancelled"
          ));
          const authorizedOrders = relatedOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;
          const capturedOrders = relatedOrders.filter((order) => order.paymentStatus === "captured").length;
          const readyPickups = relatedOrders.filter((order) => order.pickupStatus === "ready").length;
          const pendingAcceptanceOrders = relatedOrders.filter((order) => order.merchantAcceptanceStatus === "pending").length;
          const preparingOrders = relatedOrders.filter((order) => (
            order.merchantAcceptanceStatus === "accepted"
            && !["ready", "picked_up", "cancelled"].includes(order.pickupStatus)
          )).length;

          return (
            <View key={deal.id} style={styles.card}>
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
              <Text style={styles.summary}>已請款 {capturedOrders} 筆 · 可取貨：{readyPickups} 筆</Text>
              {pendingAcceptanceOrders > 0 ? (
                <PrimaryButton
                  label={`確認接單（${pendingAcceptanceOrders} 筆）`}
                  variant="secondary"
                  onPress={(event) => {
                    event.stopPropagation?.();
                    actions.acceptMerchantOrdersForDeal(deal.id);
                  }}
                />
              ) : (
                <Text style={styles.acceptedText}>店家已確認目前訂單</Text>
              )}
              {preparingOrders > 0 ? (
                <PrimaryButton
                  label={`完成訂單（${preparingOrders} 筆）`}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    actions.completeMerchantOrdersForDeal(deal.id);
                  }}
                />
              ) : readyPickups > 0 ? (
                <Text style={styles.readyText}>已有 {readyPickups} 筆訂單完成，可顯示取貨碼</Text>
              ) : null}
            </View>
          );
        })}
        </Section>
      ) : (
        <Section title={`歷史訂單 ${historyOrders.length} 筆`}>
          {historyOrders.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有歷史訂單。店家完成訂單、顧客取貨、取消或流團後會顯示在這裡。</Text>
          ) : null}
          {historyOrders.map((order) => {
            const deal = appState.deals.find((item) => item.id === order.dealId);
            const total = order.captureAmount ?? order.finalAmount ?? order.subtotal ?? order.originalAmount ?? 0;

            return (
              <View key={order.id} style={styles.historyCard}>
                <View style={styles.header}>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{deal?.title ?? "團購活動"}</Text>
                    <Text style={styles.meta}>顧客：{order.customerSurname ?? order.customerId} · {order.quantity ?? 0} 杯</Text>
                  </View>
                  <Text style={styles.historyAmount}>{formatCurrency(total)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <StatusBadge owner="payment" value={order.paymentStatus} />
                  <StatusBadge owner="pickup" value={order.pickupStatus} />
                </View>
                <Text style={styles.summary}>訂單狀態：{getOrderStatusLabel(order.status)}</Text>
              </View>
            );
          })}
        </Section>
      )}
    </MobileScreen>
  );
}

function getOrderStatusLabel(status) {
  const labels = {
    draft: "草稿",
    submitted: "已送出",
    locked: "已鎖定",
    readyForPickup: "可取貨",
    completed: "已完成",
    cancelled: "已取消"
  };
  return labels[status] ?? status;
}

const styles = StyleSheet.create({
  hero: {
    gap: 14,
    marginHorizontal: -14,
    marginTop: -70,
    paddingTop: 82,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: "#2f6df6"
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  storeAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "#ffffff"
  },
  storeAvatarText: {
    color: "#1f6feb",
    fontSize: 20,
    fontWeight: "900"
  },
  storeName: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900"
  },
  storeSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
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
  metricRow: {
    flexDirection: "row",
    gap: 8
  },
  metricCard: {
    flex: 1,
    gap: 3,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    padding: 9
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
  },
  metricLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    fontWeight: "800"
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900"
  },
  createLink: {
    color: "#1f6feb",
    fontSize: 12,
    fontWeight: "900"
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    backgroundColor: "transparent"
  },
  tabItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  tabText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  tabDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#cbd5e1"
  },
  activeTabItem: {
    backgroundColor: "#ffffff"
  },
  activeTabText: {
    color: "#1f6feb"
  },
  card: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 12
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
    fontSize: 15,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  summary: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  acceptedText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "900"
  },
  readyText: {
    color: "#1f6feb",
    fontSize: 12,
    fontWeight: "900"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19
  },
  historyCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12
  },
  historyAmount: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "900"
  }
});

function MetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
