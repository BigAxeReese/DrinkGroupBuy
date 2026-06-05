import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatCurrency, getDealById } from "../utils/calculations";

export function CartScreen({ navigation, route, appState, actions, memberAction }) {
  const deal = getDealById(appState.deals, route.params?.dealId);
  const cartItems = appState.cartItems.filter((item) => item.dealId === deal.id);
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

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

      <PrimaryButton
        label="繼續選購飲料"
        variant="secondary"
        onPress={() => navigation.go("drinkSelection", { dealId: deal.id })}
      />

      <Section title="訂單金額">
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>原價合計</Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
        </View>
        <Text style={styles.notice}>送出訂單後才會進入 LINE Pay 預授權；目前仍是 prototype，不會真實扣款。</Text>
      </Section>

      <PrimaryButton
        label="送出訂單並前往 LINE Pay"
        onPress={() => {
          if (cartItems.length === 0) return;
          const orderId = actions.submitCart(deal.id);
          if (orderId) navigation.go("paymentReport", { dealId: deal.id, orderId });
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
