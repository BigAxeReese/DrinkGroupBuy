import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ActivitySyncNotice } from "../components/ActivitySyncNotice";
import { MobileScreen, Section } from "../components/MobileScreen";
import { DiscountSummaryCard } from "../components/DiscountSummaryCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressSummary } from "../components/ProgressSummary";
import { StatusBadge } from "../components/StatusBadge";
import { useOrderListSync } from "../hooks/useOrderListSync";
import { formatCurrency, getStoreById } from "../utils/calculations";

export function MerchantDashboardScreen({ navigation, appState, actions, memberAction, selectedMerchantStoreId }) {
  const [pickupCode, setPickupCode] = useState("");
  const [pickupLookup, setPickupLookup] = useState(null);
  const [pickupNotice, setPickupNotice] = useState(null);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [readyAction, setReadyAction] = useState(null);
  const [tab, setTab] = useState("active");
  const { syncStatus, refreshOrders } = useOrderListSync(
    actions.syncMerchantOrderList,
    tab,
    selectedMerchantStoreId
  );
  const activitySyncStatus = appState.groupBuyActivitySyncStatus ?? "idle";
  const merchantStore = getStoreById(appState.stores ?? [], selectedMerchantStoreId) ?? null;
  const merchantStoreId = merchantStore?.id ?? selectedMerchantStoreId;
  const merchantGroupBuyActivities = appState.groupBuyActivities.filter((groupBuyActivity) => groupBuyActivity.storeId === merchantStoreId);
  const activeGroupBuyActivities = merchantGroupBuyActivities.filter((groupBuyActivity) => (
    ["recruiting", "confirmed", "ordering", "ready_for_pickup"].includes(groupBuyActivity.status)
  ));
  const activeGroupBuyActivityIds = new Set(activeGroupBuyActivities.map((groupBuyActivity) => groupBuyActivity.id));
  const merchantGroupBuyActivityIds = new Set(merchantGroupBuyActivities.map((groupBuyActivity) => groupBuyActivity.id));
  const activeOrders = appState.orders.filter((order) => activeGroupBuyActivityIds.has(order.groupBuyActivityId)
    && (order.lifecycleBucket ? order.lifecycleBucket === "active" : order.status !== "cancelled"));
  const historyOrders = appState.orders.filter((order) => {
    const groupBuyActivity = appState.groupBuyActivities.find((item) => item.id === order.groupBuyActivityId);
    return merchantGroupBuyActivityIds.has(order.groupBuyActivityId) && (order.lifecycleBucket
      ? order.lifecycleBucket === "history"
      : ["completed", "cancelled"].includes(order.status)
        || ["picked_up", "cancelled", "expired"].includes(order.pickupStatus)
        || ["cancelled", "failed", "completed"].includes(groupBuyActivity?.status));
  });
  const pendingPaymentCount = activeOrders.filter((order) => ["pending", "failed"].includes(order.paymentStatus)).length;
  const paidOrderCount = activeOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;

  function handlePickupCodeChange(value) {
    setPickupCode(value.replace(/[^0-9]/g, "").slice(0, 6));
    setPickupLookup(null);
    setPickupNotice(null);
  }

  async function handlePickupLookup() {
    if (pickupCode.length !== 6) {
      setPickupNotice({ type: "error", text: "請輸入六位取餐碼。" });
      return;
    }

    setPickupBusy(true);
    setPickupLookup(null);
    setPickupNotice(null);
    try {
      const result = await actions.lookupPickupCredential(pickupCode);
      setPickupLookup(result.credential);
    } catch (error) {
      setPickupNotice({ type: "error", text: getPickupErrorMessage(error) });
    } finally {
      setPickupBusy(false);
    }
  }

  async function handlePickupRedeem() {
    if (!pickupLookup || pickupLookup.status !== "active" || pickupBusy) return;

    setPickupBusy(true);
    setPickupNotice(null);
    try {
      const result = await actions.redeemPickupCredential(pickupCode);
      setPickupLookup(null);
      setPickupCode("");
      setPickupNotice({
        type: "success",
        text: `${result.credential.customerDisplayName || "顧客"}的訂單已確認取餐。`
      });
    } catch (error) {
      setPickupNotice({ type: "error", text: getPickupErrorMessage(error) });
    } finally {
      setPickupBusy(false);
    }
  }

  async function handleMarkReady(groupBuyActivityId) {
    setReadyAction({ activityId: groupBuyActivityId, busy: true, text: null, type: null });
    try {
      const result = await actions.markOrdersReadyForPickupForGroupBuyActivity(groupBuyActivityId);
      setReadyAction({
        activityId: groupBuyActivityId,
        busy: false,
        type: "success",
        text: `已產生 ${result.createdCredentialCount} 筆六位取餐碼。`
      });
    } catch (error) {
      setReadyAction({
        activityId: groupBuyActivityId,
        busy: false,
        type: "error",
        text: getPickupErrorMessage(error)
      });
    }
  }

  return (
    <MobileScreen title="" compactHeader>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.storeAvatar}>
            <Text style={styles.storeAvatarText}>店</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.storeName}>{merchantStore?.name ?? "我的店家"}</Text>
            <Text style={styles.storeSubtitle}>商家首頁 · Prototype 身分：{merchantStoreId}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={memberAction} style={styles.memberPill}>
            <Text style={styles.memberPillText}>會員</Text>
          </Pressable>
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="進行中活動" value={activeGroupBuyActivities.length} />
          <MetricCard label="待付款" value={pendingPaymentCount} />
          <MetricCard label="已付款" value={paidOrderCount} />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{tab === "active" ? "進行中的團購" : "歷史訂單"}</Text>
        {tab === "active" ? (
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" onPress={() => navigation.go("merchantMenu")}>
              <Text style={styles.createLink}>管理菜單</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => navigation.go("merchantRefundRequests")}>
              <Text style={styles.createLink}>退款申請</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => navigation.go("merchantCreate")}>
              <Text style={styles.createLink}>＋ 開團</Text>
            </Pressable>
          </View>
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

      {syncStatus === "loading" ? <Text style={styles.syncText}>正在更新後端訂單…</Text> : null}
      {syncStatus === "error" ? (
        <View style={styles.syncError}>
          <Text style={styles.errorText}>訂單同步失敗，目前顯示上次成功載入的資料。</Text>
          <PrimaryButton label="重新整理" variant="secondary" onPress={refreshOrders} />
        </View>
      ) : null}
      <ActivitySyncNotice
        status={activitySyncStatus}
        onRetry={() => actions.syncGroupBuyActivities().catch(() => {})}
      />

      {tab === "active" ? (
        <>
          <Section title="取餐核銷">
            <TextInput
              accessibilityLabel="六位取餐碼"
              autoCorrect={false}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={handlePickupCodeChange}
              onSubmitEditing={handlePickupLookup}
              placeholder="六位取餐碼"
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              style={styles.pickupInput}
              value={pickupCode}
            />
            <PrimaryButton
              disabled={pickupCode.length !== 6 || pickupBusy}
              label={pickupBusy ? "查詢中" : "查詢訂單"}
              onPress={handlePickupLookup}
            />
            {pickupNotice ? (
              <Text style={pickupNotice.type === "error" ? styles.errorText : styles.successText}>
                {pickupNotice.text}
              </Text>
            ) : null}
            {pickupLookup ? (
              <View style={styles.pickupLookupCard}>
                <Text style={styles.lookupTitle}>{pickupLookup.customerDisplayName || "顧客訂單"}</Text>
                <Text style={styles.lookupMeta}>{pickupLookup.activity.title}</Text>
                <Text style={styles.lookupMeta}>
                  {pickupLookup.totalCups} 杯 · {formatCurrency(pickupLookup.finalAmount)}
                </Text>
                <PrimaryButton
                  disabled={pickupBusy || pickupLookup.status !== "active"}
                  label={pickupBusy
                    ? "處理中"
                    : pickupLookup.status === "redeemed"
                      ? "已取餐"
                      : pickupLookup.status === "expired" ? "取餐碼已過期" : "確認已取餐"}
                  onPress={handlePickupRedeem}
                />
              </View>
            ) : null}
          </Section>
          <Section title="活動清單">
        {activeGroupBuyActivities.length === 0 ? (
          <Text style={styles.emptyText}>目前沒有進行中的團購。點右上「＋ 開團」建立測試活動。</Text>
        ) : null}
        {activeGroupBuyActivities.map((groupBuyActivity) => {
          const store = getStoreById(appState.stores ?? [], groupBuyActivity.storeId);
          const relatedOrders = appState.orders.filter((order) => (
            order.groupBuyActivityId === groupBuyActivity.id
            && order.status !== "cancelled"
          ));
          const pendingPaymentOrders = relatedOrders.filter((order) => ["pending", "failed"].includes(order.paymentStatus)).length;
          const paidOrders = relatedOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;
          const capturedOrders = relatedOrders.filter((order) => order.paymentStatus === "captured").length;
          const readyPickups = relatedOrders.filter((order) => order.pickupStatus === "ready").length;
          const manufacturableOrders = relatedOrders.filter((order) => (
            order.paymentStatus === "captured"
            && !["ready", "picked_up", "cancelled"].includes(order.pickupStatus)
          )).length;

          return (
            <View key={groupBuyActivity.id} style={styles.card}>
              <View style={styles.header}>
                <View style={styles.flex}>
                  <Text style={styles.title}>{groupBuyActivity.title}</Text>
                  <Text style={styles.meta}>{store?.name}</Text>
                </View>
                <StatusBadge value={groupBuyActivity.status} />
              </View>
              <ProgressSummary
                currentCups={groupBuyActivity.currentCups}
                targetCups={groupBuyActivity.targetCups}
                participantCount={groupBuyActivity.participantCount}
                remainingTimeText={groupBuyActivity.remainingTimeText}
              />
              <DiscountSummaryCard compact groupBuyActivity={groupBuyActivity} />
              <View style={styles.summaryRow}>
                <Text style={styles.summary}>訂單 {relatedOrders.length} 筆</Text>
                <Text style={styles.summary}>已付款 {paidOrders} 筆</Text>
              </View>
              <Text style={styles.summary}>已請款 {capturedOrders} 筆 · 可取貨：{readyPickups} 筆</Text>
              {pendingPaymentOrders > 0 ? (
                <Text style={styles.warningText}>待付款 {pendingPaymentOrders} 筆，不列入製作清單。</Text>
              ) : null}
              {manufacturableOrders > 0 ? (
                <PrimaryButton
                  disabled={readyAction?.activityId === groupBuyActivity.id && readyAction.busy}
                  label={readyAction?.activityId === groupBuyActivity.id && readyAction.busy
                    ? "處理中"
                    : `標記可取餐（${manufacturableOrders} 筆）`}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    handleMarkReady(groupBuyActivity.id);
                  }}
                />
              ) : readyPickups > 0 ? (
                <Text style={styles.readyText}>已有 {readyPickups} 筆訂單完成，可顯示取貨碼</Text>
              ) : (
                <Text style={styles.settledText}>目前沒有待製作訂單</Text>
              )}
              {readyAction?.activityId === groupBuyActivity.id && readyAction.text ? (
                <Text style={readyAction.type === "error" ? styles.errorText : styles.successText}>
                  {readyAction.text}
                </Text>
              ) : null}
            </View>
          );
        })}
        </Section>
        </>
      ) : (
        <Section title={`歷史訂單 ${historyOrders.length} 筆`}>
          {historyOrders.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有歷史訂單。店家完成訂單、顧客取貨、取消或流團後會顯示在這裡。</Text>
          ) : null}
          {historyOrders.map((order) => {
            const groupBuyActivity = appState.groupBuyActivities.find((item) => item.id === order.groupBuyActivityId);
            const total = order.captureAmount ?? order.finalAmount ?? order.subtotal ?? order.originalAmount ?? 0;

            return (
              <View key={order.id} style={styles.historyCard}>
                <View style={styles.header}>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{groupBuyActivity?.title ?? "團購活動"}</Text>
                    <Text style={styles.meta}>顧客：{order.customerSurname ?? order.customerId} · {order.quantity ?? 0} 杯</Text>
                  </View>
                  <Text style={styles.historyAmount}>{formatCurrency(total)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <StatusBadge owner="merchantPayment" value={order.paymentStatus} />
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

function getPickupErrorMessage(error) {
  const errorCode = error?.payload?.error;
  const messages = {
    activity_not_found: "找不到這筆團購活動。",
    activity_access_denied: "你沒有管理這筆團購的權限。",
    activity_not_readyable: "目前活動狀態不能標記為可取餐。",
    no_captured_orders: "目前沒有已扣款且可製作的訂單。",
    pickup_window_expired: "這筆團購的取餐期限已結束。",
    pickup_code_invalid: "請輸入六位取餐碼。",
    pickup_code_rate_limited: "輸入錯誤次數過多，請稍後再試。",
    credential_not_found: "找不到有效的取餐碼。",
    credential_already_redeemed: "這組取餐碼已經使用過。",
    credential_expired: "這組取餐碼已經過期。",
    order_not_ready_for_pickup: "這筆訂單目前尚不可取餐。"
  };
  return messages[errorCode] || "取餐操作失敗，請稍後再試。";
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
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
  pickupInput: {
    width: "100%",
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
    paddingHorizontal: 12,
    textAlign: "center"
  },
  pickupLookupCard: {
    gap: 7,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    padding: 12
  },
  lookupTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  lookupMeta: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800"
  },
  successText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800"
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
  settledText: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "900"
  },
  warningText: {
    color: "#92400e",
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
  syncText: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 16
  },
  syncError: {
    gap: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    padding: 12
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
