import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatCurrency, getGroupBuyActivityById, isWithdrawalLocked } from "../utils/calculations";
import { isDeadlineReached } from "../utils/deadlineTime";
import { getGroupBuyActivityCapacityInfo } from "../utils/groupBuyActivityProgress";
import { formatOrderItemCustomizations } from "../utils/orderItems";

export function CartScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const [acceptOriginalPrice, setAcceptOriginalPrice] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  if (!groupBuyActivity) {
    return (
      <MobileScreen
        title="購物車"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有團購資料">
          <Text style={styles.emptyText}>團購已清空，購物車暫時不能送出。</Text>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }

  const cartItems = appState.cartItems.filter((item) => (
    item.groupBuyActivityId === groupBuyActivity.id && (!item.customerId || item.customerId === selectedCustomerId)
  ));
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const groupBuyActivityClosed = groupBuyActivity.canJoin === false || isDeadlineReached(groupBuyActivity);
  const existingOrder = appState.orders.find((order) => (
    order.customerId === selectedCustomerId
    && order.groupBuyActivityId === groupBuyActivity.id
    && !["cancelled", "completed"].includes(order.status)
  ));
  const withdrawalLocked = Boolean(existingOrder && isWithdrawalLocked(groupBuyActivity));
  const canUpdatePendingOrder = Boolean(existingOrder && existingOrder.paymentStatus === "pending" && !withdrawalLocked);
  const canCreateRevision = Boolean(existingOrder && existingOrder.paymentStatus === "authorized" && !withdrawalLocked);
  const blocksOrderUpdate = Boolean(existingOrder && !canUpdatePendingOrder && !canCreateRevision);
  const capacityInfo = getGroupBuyActivityCapacityInfo(groupBuyActivity);
  const capacityCheckQuantity = existingOrder && existingOrder.paymentStatus !== "pending"
    ? Math.max(0, totalQuantity - (existingOrder.quantity ?? 0))
    : totalQuantity;
  const exceedsCapacity = capacityInfo.maximumCups > 0 && capacityCheckQuantity > capacityInfo.remainingCapacity;

  return (
    <MobileScreen
      title="購物車"
      subtitle={groupBuyActivity.title}
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title={`飲料明細（${totalQuantity} 杯）`}>
        {cartItems.length > 0 ? cartItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.itemName} x {item.quantity}</Text>
                <Text style={styles.meta}>{formatOrderItemCustomizations(item)}</Text>
              </View>
              <Text style={styles.itemAmount}>{formatCurrency(item.subtotal)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => actions.removeCartItem(item.id)}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
            >
              <Text style={styles.removeText}>刪除</Text>
            </Pressable>
          </View>
        )) : (
          <Text style={styles.emptyText}>購物車目前沒有飲料。</Text>
        )}
      </Section>

      {groupBuyActivityClosed ? (
        <Text style={styles.closedNotice}>活動已截止，系統已鎖定訂單，不能再送出或修改購物車。</Text>
      ) : null}
      {!groupBuyActivityClosed && exceedsCapacity ? (
        <Text style={styles.closedNotice}>
          此團購最高 {capacityInfo.maximumCups} 杯，目前剩餘容量不足，請調整購物車數量。
        </Text>
      ) : null}
      {submitError ? <Text style={styles.closedNotice}>{submitError}</Text> : null}
      {canUpdatePendingOrder && cartItems.length > 0 ? (
        <Text style={styles.closedNotice}>
          此團購已有一筆尚未完成預授權的訂單。送出後會用目前購物車內容更新該訂單，再重新進行 LINE Pay 預授權。
        </Text>
      ) : null}
      {blocksOrderUpdate && cartItems.length > 0 ? (
        <Text style={styles.closedNotice}>
          此團購已有一筆已授權或已鎖定的訂單。目前尚未支援把新飲料合併到已授權訂單。
        </Text>
      ) : null}

      <PrimaryButton
        label="繼續選購飲料"
        variant="secondary"
        onPress={() => !groupBuyActivityClosed && navigation.go("drinkSelection", { groupBuyActivityId: groupBuyActivity.id })}
      />

      <Section title="訂單金額">
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>原價合計</Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
        </View>
        <Text style={styles.notice}>
          {canUpdatePendingOrder
            ? "送出後會以目前購物車內容更新尚未授權的訂單。預授權成功後，購物車才會清空。"
            : blocksOrderUpdate
              ? "此團購已有一筆已授權或已鎖定的訂單，請先回到訂單頁查看。"
            : "送出訂單後才會進入 LINE Pay 預授權；目前仍是 prototype，不會真實扣款。"}
        </Text>
      </Section>

      <Section title="">
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptOriginalPrice }}
          onPress={() => setAcceptOriginalPrice((value) => !value)}
          style={({ pressed }) => [styles.checkboxRow, acceptOriginalPrice && styles.checkboxRowActive, pressed && styles.pressed]}
        >
          <View style={[styles.checkbox, acceptOriginalPrice && styles.checkboxActive]}>
            <Text style={styles.checkboxMark}>{acceptOriginalPrice ? "✓" : ""}</Text>
          </View>
          <View style={styles.checkboxTextGroup}>
            <Text style={styles.checkboxTitle}>若無優惠接受原價購買</Text>
            <Text style={styles.checkboxHint}>未勾選時，若未達優惠門檻則不付款。</Text>
          </View>
        </Pressable>
      </Section>

      <PrimaryButton
        label={isSubmitting
          ? "正在建立訂單..."
          : blocksOrderUpdate
            ? "前往既有訂單"
            : canUpdatePendingOrder
              ? "更新訂單並前往 LINE Pay"
              : "送出訂單並前往 LINE Pay"}
        onPress={async () => {
          if (isSubmitting) return;
          setSubmitError("");
          if (groupBuyActivityClosed) return;
          if (cartItems.length === 0) {
            if (existingOrder) navigation.go("paymentAuthorization", { groupBuyActivityId: groupBuyActivity.id, orderId: existingOrder.id });
            return;
          }
          if (blocksOrderUpdate) {
            navigation.go("paymentAuthorization", { groupBuyActivityId: groupBuyActivity.id, orderId: existingOrder.id });
            return;
          }
          if (exceedsCapacity) {
            setSubmitError(`此團購最多 ${capacityInfo.maximumCups} 杯，剩餘 ${capacityInfo.remainingCapacity} 杯可加入。`);
            return;
          }
          const fallbackPreference = acceptOriginalPrice ? "accept_original_price" : "decline_original_price";
          setIsSubmitting(true);
          try {
            const submitResult = await actions.submitCart(groupBuyActivity.id, fallbackPreference);
            if (submitResult?.error) {
              setSubmitError(submitResult.message);
              return;
            }
            const orderId = typeof submitResult === "string" ? submitResult : submitResult?.orderId;
            const orderRevisionId = typeof submitResult === "object" ? submitResult.orderRevisionId : null;
            const revisionAmount = typeof submitResult === "object" ? submitResult.revisionAmount : null;
            const revisionItems = typeof submitResult === "object" ? submitResult.revisionItems : null;
            if (orderId) navigation.go("paymentAuthorization", { groupBuyActivityId: groupBuyActivity.id, orderId, orderRevisionId, revisionAmount, revisionItems });
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12
  },
  itemTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  itemText: {
    flex: 1,
    gap: 5
  },
  itemName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  itemAmount: {
    color: "#1f6feb",
    fontSize: 16,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18
  },
  removeButton: {
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2"
  },
  removeText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "900"
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  totalLabel: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "800"
  },
  totalAmount: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "900"
  },
  notice: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18
  },
  closedNotice: {
    borderRadius: 12,
    backgroundColor: "#fef3c7",
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    padding: 10
  },
  checkboxRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  checkboxRowActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#eff6ff"
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff"
  },
  checkboxActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#1f6feb"
  },
  checkboxMark: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  checkboxTextGroup: {
    flex: 1,
    gap: 3
  },
  checkboxTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  checkboxHint: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 14
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 18
  },
  pressed: {
    opacity: 0.72
  }
});
