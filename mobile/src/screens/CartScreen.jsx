import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatCurrency, getDealById } from "../utils/calculations";
import { isDeadlineReached } from "../utils/deadlineTime";
import { getDealCapacityInfo } from "../utils/dealProgress";

export function CartScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const [acceptOriginalPrice, setAcceptOriginalPrice] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deal = getDealById(appState.deals, route.params?.dealId);
  if (!deal) {
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
    item.dealId === deal.id && (!item.customerId || item.customerId === selectedCustomerId)
  ));
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const dealClosed = deal.canJoin === false || isDeadlineReached(deal);
  const existingOrder = appState.orders.find((order) => (
    order.customerId === selectedCustomerId
    && order.dealId === deal.id
    && !["cancelled", "completed"].includes(order.status)
  ));
  const requiresReauthorization = Boolean(existingOrder && ["authorized", "captured"].includes(existingOrder.paymentStatus));
  const capacityInfo = getDealCapacityInfo(deal);
  const capacityCheckQuantity = existingOrder && !["authorized", "captured"].includes(existingOrder.paymentStatus)
    ? (existingOrder.quantity ?? 0) + totalQuantity
    : totalQuantity;
  const exceedsCapacity = capacityInfo.maximumCups > 0 && capacityCheckQuantity > capacityInfo.remainingCapacity;

  return (
    <MobileScreen
      title="購物車"
      subtitle={deal.title}
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title={`飲料明細（${totalQuantity} 杯）`}>
        {cartItems.length > 0 ? cartItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View style={styles.itemText}>
                <Text style={styles.itemName}>{item.itemName} x {item.quantity}</Text>
                <Text style={styles.meta}>{item.sweetness} · {item.ice} · {item.toppings.join("、")}</Text>
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

      {dealClosed ? (
        <Text style={styles.closedNotice}>活動已截止，系統已鎖定訂單，不能再送出或修改購物車。</Text>
      ) : null}
      {!dealClosed && exceedsCapacity ? (
        <Text style={styles.closedNotice}>
          此團購最高 {capacityInfo.maximumCups} 杯，目前剩餘容量不足，請調整購物車數量。
        </Text>
      ) : null}
      {submitError ? <Text style={styles.closedNotice}>{submitError}</Text> : null}

      <PrimaryButton
        label="繼續選購飲料"
        variant="secondary"
        onPress={() => !dealClosed && navigation.go("drinkSelection", { dealId: deal.id })}
      />

      <Section title="訂單金額">
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>原價合計</Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
        </View>
        <Text style={styles.notice}>
          {requiresReauthorization
            ? "送出後才會取消原本預授權，並以新訂單總額重新進行 LINE Pay 預授權。"
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
        label={isSubmitting ? "正在建立訂單..." : requiresReauthorization ? "重新預授權" : "送出訂單並前往 LINE Pay"}
        onPress={async () => {
          if (isSubmitting) return;
          setSubmitError("");
          if (dealClosed) return;
          if (cartItems.length === 0) return;
          if (exceedsCapacity) {
            setSubmitError(`此團購最多 ${capacityInfo.maximumCups} 杯，剩餘 ${capacityInfo.remainingCapacity} 杯可加入。`);
            return;
          }
          const fallbackPreference = acceptOriginalPrice ? "accept_original_price" : "decline_original_price";
          setIsSubmitting(true);
          try {
            const orderId = await actions.submitCart(deal.id, fallbackPreference);
            if (orderId?.error) {
              setSubmitError(orderId.message);
              return;
            }
            if (orderId) navigation.go("paymentReport", { dealId: deal.id, orderId });
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
