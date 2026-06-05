import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { customerOrderDemo } from "../mock/customerOrderDemo";
import { deals } from "../mock/deals";
import { stores } from "../mock/stores";
import { formatCurrency, isWithdrawalLocked } from "../utils/calculations";

export function CustomerOrdersScreen({ navigation, appState, actions, memberAction, selectedCustomerId }) {
  const [tab, setTab] = useState("active");
  const [demoItems, setDemoItems] = useState(customerOrderDemo.orderItems ?? []);
  const customerOrders = appState.orders.filter((item) => item.customerId === selectedCustomerId);
  const order = customerOrders.find((item) => item.id === customerOrderDemo.activeOrderId) ?? customerOrders[0];
  const cartItems = appState.cartItems.filter((item) => item.customerId === selectedCustomerId);
  const cartDeal = cartItems.length > 0
    ? appState.deals.find((item) => item.id === cartItems[0].dealId) ?? null
    : null;
  const cartTotalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  if (!order) {
    return (
      <MobileScreen title="我的訂單" onMemberPress={memberAction}>
        {cartItems.length > 0 ? (
          <CartDraftSection
            cartDeal={cartDeal}
            cartItems={cartItems}
            cartTotalQuantity={cartTotalQuantity}
            cartTotalAmount={cartTotalAmount}
            navigation={navigation}
          />
        ) : (
          <Section title="目前沒有訂單">
            <Text style={styles.meta}>加入團購後，訂單明細與取貨憑證會顯示在這裡。</Text>
            <PrimaryButton label="去逛逛" onPress={() => navigation.replace("liveMap")} />
          </Section>
        )}
      </MobileScreen>
    );
  }

  const deal = appState.deals.find((item) => item.id === order.dealId) ?? deals[0];
  const payment = appState.paymentReports.find((item) => item.orderId === order.id);
  const store = deal ? stores.find((item) => item.id === deal.storeId) : null;
  const orderItems = (order.items ?? (order.id === customerOrderDemo.activeOrderId ? demoItems : [])).map(normalizeOrderItem);
  const demoSubtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
  const displaySubtotal = orderItems.length > 0 ? demoSubtotal : order.subtotal ?? 0;
  const displayTotal = payment?.captureAmount ?? Math.max(customerOrderDemo.minimumPayableAmount, displaySubtotal - customerOrderDemo.discountAmount);
  const authorizedTotal = orderItems.length > 0 ? displaySubtotal : payment?.authorizedAmount ?? displaySubtotal;
  const merchantAccepted = order.merchantAcceptanceStatus === "accepted";
  const withdrawalLocked = isWithdrawalLocked(deal);
  const progressText = deal ? `${deal.currentCups} / ${deal.targetCups} 杯` : "團購資料已移除";

  return (
    <MobileScreen title="我的訂單" onMemberPress={memberAction}>
      <View style={styles.tabRow}>
        <Text
          onPress={() => setTab("active")}
          style={[styles.tabItem, tab === "active" && styles.activeTabItem]}
        >
          訂單列表
        </Text>
        <Text
          onPress={() => setTab("history")}
          style={[styles.tabItem, tab === "history" && styles.activeTabItem]}
        >
          歷史訂單
        </Text>
      </View>

      {tab === "history" ? (
        <Section title="歷史訂單">
            <Text style={styles.meta}>目前沒有歷史訂單。每個顧客帳號會分開顯示訂單。</Text>
          <PrimaryButton label="返回訂單列表" variant="secondary" onPress={() => setTab("active")} />
        </Section>
      ) : (
      <>
      {cartItems.length > 0 ? (
        <CartDraftSection
          cartDeal={cartDeal}
          cartItems={cartItems}
          cartTotalQuantity={cartTotalQuantity}
          cartTotalAmount={cartTotalAmount}
          navigation={navigation}
        />
      ) : null}
      <View style={styles.orderCard}>
        <View style={styles.statusBar}>
          <View style={styles.statusGroup}>
            <StatusBadge owner="payment" value={order.paymentStatus} />
            <Text style={styles.statusText}>團購進度：{progressText}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.flex}>
            <Text style={styles.storeName}>{store?.name}</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.go("dealDetail", { dealId: order.dealId })} style={styles.smallDetailButton}>
              <Text style={styles.smallDetailText}>團購詳情</Text>
            </Pressable>
          </View>
        </View>

        <Section title="訂單明細">
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.itemScroller}
            contentContainerStyle={styles.itemList}
          >
            {orderItems.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item.id}
                disabled={withdrawalLocked}
                onPress={() => navigation.go("drinkSelection", {
                  dealId: order.dealId,
                  editMode: true,
                  editOrderItem: item,
                  onSaveOrderItem: (updatedItem) => {
                    const nextItems = orderItems.map((current) => (
                      current.id === updatedItem.id ? updatedItem : current
                    ));
                    actions.updateOrderItems(order.id, nextItems);
                  }
                })}
                style={({ pressed }) => [
                  styles.detailCard,
                  withdrawalLocked && styles.detailCardLocked,
                  pressed && styles.pressed
                ]}
              >
                <View style={styles.detailTop}>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{item.name}（{item.size}） x {item.quantity}</Text>
                    <View style={styles.chips}>
                      <Text style={styles.chip}>{item.sweetness}</Text>
                      <Text style={styles.chip}>{item.ice}</Text>
                      {item.toppings.map((topping) => <Text key={`${item.id}-${topping}`} style={styles.chip}>{topping}</Text>)}
                    </View>
                    <Text style={styles.itemPrice}>{formatCurrency(item.subtotal)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={withdrawalLocked}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      const nextItems = orderItems.filter((current) => current.id !== item.id);
                      actions.updateOrderItems(order.id, nextItems);
                    }}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      withdrawalLocked && styles.deleteButtonDisabled,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text style={[styles.deleteText, withdrawalLocked && styles.deleteTextDisabled]}>
                      {withdrawalLocked ? "已鎖定" : "刪除"}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
            {orderItems.length === 0 ? <Text style={styles.emptyItems}>目前沒有飲品品項。</Text> : null}
          </ScrollView>
          {withdrawalLocked ? (
            <Text style={styles.withdrawalLockNotice}>距截止時間 30 分鐘內只能加入，既有訂單不可修改或退出。</Text>
          ) : null}
          <PrimaryButton
            label={withdrawalLocked ? "訂單已鎖定，無法修改" : "修改訂單"}
            variant="secondary"
            onPress={() => !withdrawalLocked && navigation.go("drinkSelection", { dealId: order.dealId, editOrderId: order.id })}
          />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>訂單金額</Text>
            <View style={styles.priceGroup}>
              <Text style={styles.price}>{formatCurrency(displayTotal)}</Text>
              <Text style={styles.originalPrice}>{formatCurrency(authorizedTotal)}</Text>
            </View>
          </View>
          {order.reauthorizationReason === "order_amount_changed" ? (
            <View style={styles.reauthorizationNotice}>
              <Text style={styles.reauthorizationTitle}>訂單金額已變動</Text>
              <Text style={styles.reauthorizationText}>原預授權已失效，請依新訂單金額重新預授權。</Text>
              <PrimaryButton
                label="重新預授權"
                onPress={() => navigation.go("paymentReport", { dealId: order.dealId, orderId: order.id })}
              />
            </View>
          ) : null}
        </Section>

        {merchantAccepted ? (
          <View style={styles.pickupPass}>
            <View>
              <Text style={styles.passLabel}>{customerOrderDemo.pickupPass.label}</Text>
              <Text style={styles.passCode}>{customerOrderDemo.pickupPass.code}</Text>
            </View>
            <View style={styles.qrBox}>
              <Text style={styles.qrText}>{customerOrderDemo.pickupPass.qrLabel}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.pickupPending}>
            <Text style={styles.pickupPendingTitle}>等待店家確認接單</Text>
            <Text style={styles.pickupPendingText}>店家確認接單後，取貨憑證才會顯示。</Text>
          </View>
        )}
      </View>
      </>
      )}
    </MobileScreen>
  );
}

function CartDraftSection({ cartDeal, cartItems, cartTotalQuantity, cartTotalAmount, navigation }) {
  return (
    <Section title={`購物車草稿（${cartTotalQuantity} 杯）`}>
      <View style={styles.cartDraftHeader}>
        <View style={styles.flex}>
          <Text style={styles.cartDraftTitle}>{cartDeal?.title ?? "尚未選定團購"}</Text>
          <Text style={styles.meta}>這些飲料尚未送出訂單，送出後才會進入 LINE Pay 預授權。</Text>
        </View>
        <Text style={styles.cartDraftAmount}>{formatCurrency(cartTotalAmount)}</Text>
      </View>
      <View style={styles.cartDraftList}>
        {cartItems.map((item) => (
          <View key={item.id} style={styles.cartDraftItem}>
            <Text style={styles.cartDraftItemName}>{item.itemName} x {item.quantity}</Text>
            <Text style={styles.cartDraftItemMeta}>{item.sweetness} · {item.ice} · {item.toppings.join("、")}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton
        label="前往購物車送出"
        onPress={() => cartDeal && navigation.go("cart", { dealId: cartDeal.id })}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  orderCard: {
    overflow: "hidden",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 15,
    backgroundColor: "#e9eef6",
    padding: 5
  },
  tabItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center"
  },
  activeTabItem: {
    color: "#1f6feb",
    backgroundColor: "#ffffff"
  },
  statusBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ecfdf5",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0"
  },
  statusGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  statusText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900"
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    padding: 12
  },
  flex: {
    flex: 1
  },
  drinkName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6
  },
  storeName: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6
  },
  smallDetailButton: {
    alignSelf: "flex-start",
    minHeight: 28,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: "#eaf2ff",
    marginTop: 8,
    paddingHorizontal: 10
  },
  smallDetailText: {
    color: "#1f6feb",
    fontSize: 11,
    fontWeight: "900"
  },
  priceGroup: {
    alignItems: "flex-end"
  },
  cartDraftHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  cartDraftTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  cartDraftAmount: {
    color: "#2563eb",
    fontSize: 20,
    fontWeight: "900"
  },
  cartDraftList: {
    gap: 7
  },
  cartDraftItem: {
    gap: 3,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 9
  },
  cartDraftItemName: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  cartDraftItemMeta: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16
  },
  itemScroller: {
    maxHeight: 240
  },
  itemList: {
    gap: 10,
    paddingRight: 4
  },
  emptyItems: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 20
  },
  price: {
    color: "#2563eb",
    fontSize: 21,
    fontWeight: "900"
  },
  originalPrice: {
    color: "#94a3b8",
    fontSize: 12,
    textDecorationLine: "line-through"
  },
  detailCard: {
    minHeight: 66,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 10
  },
  detailCardLocked: {
    opacity: 0.72
  },
  pressed: {
    opacity: 0.75
  },
  detailTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8
  },
  deleteButton: {
    minWidth: 48,
    minHeight: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10
  },
  deleteText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "900"
  },
  deleteButtonDisabled: {
    backgroundColor: "#e2e8f0"
  },
  deleteTextDisabled: {
    color: "#64748b"
  },
  withdrawalLockNotice: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 17
  },
  itemTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  itemPrice: {
    color: "#1f6feb",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8
  },
  chip: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  pickupPass: {
    margin: 12,
    marginTop: 4,
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 13
  },
  pickupPending: {
    gap: 5,
    margin: 12,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    padding: 13
  },
  pickupPendingTitle: {
    color: "#92400e",
    fontSize: 13,
    fontWeight: "900"
  },
  pickupPendingText: {
    color: "#a16207",
    fontSize: 11,
    lineHeight: 17
  },
  totalRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    marginTop: 4,
    paddingTop: 10
  },
  totalLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  reauthorizationNotice: {
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    padding: 10
  },
  reauthorizationTitle: {
    color: "#9a3412",
    fontSize: 13,
    fontWeight: "900"
  },
  reauthorizationText: {
    color: "#c2410c",
    fontSize: 11,
    lineHeight: 17
  },
  passLabel: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "800"
  },
  passCode: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 8
  },
  qrBox: {
    width: 50,
    height: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  qrText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  }
});

function normalizeOrderItem(item) {
  const itemName = item.itemName ?? item.name ?? "";
  return {
    ...item,
    drinkId: item.drinkId ?? item.menuItemId ?? item.id,
    name: item.name ?? itemName,
    itemName,
    size: item.size ?? "L",
    unitPrice: item.unitPrice ?? (item.quantity > 0 ? Math.round(item.subtotal / item.quantity) : item.subtotal),
    toppings: item.toppings ?? []
  };
}
