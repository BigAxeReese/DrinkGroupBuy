import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { StatusBadge } from "../components/StatusBadge";
import { deleteGroupBuyActivity } from "../utils/apiClient";
import { getStoreById } from "../utils/calculations";
import { getGroupBuyActivityProgress } from "../utils/groupBuyActivityProgress";

export function AdminDashboardScreen({ navigation, appState, actions, memberAction }) {
  const [deletingGroupBuyActivityId, setDeletingGroupBuyActivityId] = useState(null);
  const [message, setMessage] = useState("");
  const activeGroupBuyActivities = appState.groupBuyActivities.filter((groupBuyActivity) => groupBuyActivity.status !== "cancelled");
  const cancelledGroupBuyActivities = appState.groupBuyActivities.filter((groupBuyActivity) => groupBuyActivity.status === "cancelled");
  const authorizedOrders = appState.orders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;

  async function handleDeleteGroupBuyActivity(groupBuyActivity) {
    if (deletingGroupBuyActivityId) return;

    const reason = `Admin deleted activity from mobile prototype: ${groupBuyActivity.title}`;
    setDeletingGroupBuyActivityId(groupBuyActivity.id);
    setMessage("");

    try {
      const activity = await deleteGroupBuyActivity(groupBuyActivity.id, {
        reason
      });
      actions.cancelGroupBuyActivityFromApi(activity);
      setMessage("已從後端將團購狀態改為 cancelled。");
    } catch (error) {
      actions.cancelGroupBuyActivity(groupBuyActivity.id, reason);
      setMessage(`後端未完成刪除，已先在本機原型取消。原因：${error.message}`);
    } finally {
      setDeletingGroupBuyActivityId(null);
    }
  }

  return (
    <MobileScreen
      title="管理員後台"
      subtitle="Prototype only：管理全平台團購、訂單與付款狀態。"
      onMemberPress={memberAction}
    >
      <View style={styles.summaryRow}>
        <SummaryCard label="進行中團購" value={activeGroupBuyActivities.length} />
        <SummaryCard label="全部訂單" value={appState.orders.length} />
        <SummaryCard label="已授權付款" value={authorizedOrders} />
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Section title="全平台團購">
        {appState.groupBuyActivities.length === 0 ? (
          <Text style={styles.emptyText}>目前沒有團購。</Text>
        ) : (
          appState.groupBuyActivities.map((groupBuyActivity) => {
            const store = getStoreById(appState.stores ?? [], groupBuyActivity.storeId);
            const relatedOrders = appState.orders.filter((order) => order.groupBuyActivityId === groupBuyActivity.id);
            const relatedAuthorizedOrders = relatedOrders.filter((order) => ["authorized", "captured"].includes(order.paymentStatus)).length;
            const progress = getGroupBuyActivityProgress(groupBuyActivity);
            const isCancelled = groupBuyActivity.status === "cancelled";
            const isDeleting = deletingGroupBuyActivityId === groupBuyActivity.id;

            return (
              <View key={groupBuyActivity.id} style={[styles.groupBuyActivityCard, isCancelled && styles.cancelledCard]}>
                <View style={styles.groupBuyActivityHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.groupBuyActivityTitle}>{groupBuyActivity.title}</Text>
                    <Text style={styles.meta}>{store?.name ?? groupBuyActivity.storeId}</Text>
                  </View>
                  <StatusBadge value={groupBuyActivity.status} />
                </View>

                <Text style={styles.meta}>杯數：{progress.currentCups} / {progress.nextTarget} 杯</Text>
                <Text style={styles.meta}>訂單：{relatedOrders.length} 筆，已授權：{relatedAuthorizedOrders} 筆</Text>
                {groupBuyActivity.cancellationReason ? (
                  <Text style={styles.cancelReason}>取消原因：{groupBuyActivity.cancellationReason}</Text>
                ) : null}

                <View style={styles.actionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => navigation.go("groupBuyActivityDetail", { groupBuyActivityId: groupBuyActivity.id })}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryButtonText}>查看詳情</Text>
                  </Pressable>

                  {!isCancelled ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDeleting}
                      onPress={() => handleDeleteGroupBuyActivity(groupBuyActivity)}
                      style={({ pressed }) => [
                        styles.dangerButton,
                        (pressed || isDeleting) && styles.pressed
                      ]}
                    >
                      <Text style={styles.dangerButtonText}>
                        {isDeleting ? "刪除中..." : "刪除團購"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Section>

      {cancelledGroupBuyActivities.length > 0 ? (
        <Text style={styles.note}>已刪除團購目前以 cancelled 狀態保留，方便後續 audit log 與狀態紀錄。</Text>
      ) : null}
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
  message: {
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    padding: 10
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700"
  },
  groupBuyActivityCard: {
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 11
  },
  cancelledCard: {
    opacity: 0.72
  },
  groupBuyActivityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  flex: {
    flex: 1
  },
  groupBuyActivityTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  cancelReason: {
    color: "#b91c1c",
    fontSize: 11,
    fontWeight: "800"
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#dbeafe"
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900"
  },
  dangerButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#fee2e2"
  },
  dangerButtonText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.75
  },
  note: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  }
});
