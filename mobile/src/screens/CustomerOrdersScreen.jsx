import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { formatCurrency, isWithdrawalLocked } from "../utils/calculations";
import { getDealProgress } from "../utils/dealProgress";
import { normalizeOrderItem } from "../utils/orderItems";

export function CustomerOrdersScreen({ navigation, appState, actions, memberAction, selectedCustomerId }) {
  const [tab, setTab] = useState("active");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const customerOrders = appState.orders.filter((order) => order.customerId === selectedCustomerId);
  const cartItems = appState.cartItems.filter((item) => item.customerId === selectedCustomerId);
  const activeOrders = customerOrders.filter((order) => !isHistoryOrder(order, appState.deals));
  const historyOrders = customerOrders.filter((order) => isHistoryOrder(order, appState.deals));
  const displayTab = tab;
  const visibleOrders = displayTab === "history" ? historyOrders : activeOrders;
  const selectedOrder = useMemo(
    () => visibleOrders.find((order) => order.id === selectedOrderId) ?? null,
    [selectedOrderId, visibleOrders]
  );
  const cartDeal = cartItems.length > 0
    ? appState.deals.find((deal) => deal.id === cartItems[0].dealId) ?? null
    : null;
  const cartTotalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  function handleTabChange(nextTab) {
    setSelectedOrderId(null);
    setTab(nextTab);
  }

  if (selectedOrder) {
    return (
      <MobileScreen
        title="訂單明細"
        onBack={() => setSelectedOrderId(null)}
        backLabel="返回"
        onMemberPress={memberAction}
      >
        <OrderDetailCard
          order={selectedOrder}
          deals={appState.deals}
          payments={appState.paymentReports}
          actions={actions}
          navigation={navigation}
          historical={displayTab === "history"}
        />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen title="我的訂單" onMemberPress={memberAction}>
      {(customerOrders.length > 0 || cartItems.length > 0) ? (
        <OrderTabs tab={displayTab} setTab={handleTabChange} />
      ) : null}

      {displayTab === "active" ? (
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
          <OrderListSection
            title="訂單列表"
            orders={activeOrders}
            deals={appState.deals}
            payments={appState.paymentReports}
            emptyText="目前沒有進行中的訂單。加入團購後會顯示在這裡。"
            onSelectOrder={setSelectedOrderId}
          />
          {activeOrders.length === 0 && cartItems.length === 0 ? (
            <View style={styles.emptyActions}>
              {historyOrders.length > 0 ? (
                <PrimaryButton label="查看歷史訂單" variant="secondary" onPress={() => handleTabChange("history")} />
              ) : null}
              <PrimaryButton label="去逛逛" onPress={() => navigation.replace("liveMap")} />
            </View>
          ) : null}
        </>
      ) : (
        <OrderListSection
          title={`歷史訂單 ${historyOrders.length} 筆`}
          orders={historyOrders}
          deals={appState.deals}
          payments={appState.paymentReports}
          emptyText="目前沒有歷史訂單。管理員刪除團購、流團、完成或取消的訂單會顯示在這裡。"
          onSelectOrder={setSelectedOrderId}
          historical
        />
      )}
    </MobileScreen>
  );
}

function OrderListSection({ title, orders, deals, payments, emptyText, onSelectOrder, historical = false }) {
  return (
    <Section title={title}>
      {orders.length === 0 ? (
        <Text style={styles.meta}>{emptyText}</Text>
      ) : (
        <View style={styles.orderList}>
          {orders.map((order) => (
            <OrderListCard
              key={order.id}
              order={order}
              deals={deals}
              payments={payments}
              historical={historical}
              onPress={() => onSelectOrder(order.id)}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

function OrderListCard({ order, deals, payments, historical, onPress }) {
  const deal = deals.find((item) => item.id === order.dealId) ?? null;
  const store = deal ? stores.find((item) => item.id === deal.storeId) : null;
  const payment = payments.find((item) => item.orderId === order.id);
  const orderItems = (order.items ?? []).map(normalizeOrderItem);
  const total = payment?.captureAmount ?? getOrderSubtotal(order);
  const progress = deal ? getDealProgress(deal) : null;
  const progressText = progress ? `${progress.currentCups} / ${progress.nextTarget} 杯` : "團購資料已不存在";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.orderListCard, pressed && styles.pressed]}
    >
      <View style={styles.listTop}>
        <View style={styles.flex}>
          <Text style={styles.storeNameSmall}>{store?.name ?? "店家資料"}</Text>
          <Text style={styles.orderSubtitle}>
            {historical ? getHistoryReason(order, deal) : `團購進度：${progressText}`}
          </Text>
        </View>
        <Text style={styles.listAmount}>{formatCurrency(total)}</Text>
      </View>
      <View style={styles.orderPreview}>
        {orderItems.slice(0, 2).map((item) => (
          <Text key={item.id} style={styles.previewText}>
            {item.name} x {item.quantity}
          </Text>
        ))}
        {orderItems.length > 2 ? <Text style={styles.previewText}>另有 {orderItems.length - 2} 項</Text> : null}
      </View>
      <Text style={styles.openHint}>點擊查看訂單明細</Text>
    </Pressable>
  );
}

function OrderDetailCard({ order, deals, payments, actions, navigation, historical }) {
  const deal = deals.find((item) => item.id === order.dealId) ?? null;
  const payment = payments.find((item) => item.orderId === order.id);
  const store = deal ? stores.find((item) => item.id === deal.storeId) : null;
  const orderItems = (order.items ?? []).map(normalizeOrderItem);
  const displaySubtotal = getOrderSubtotal(order);
  const displayTotal = payment?.captureAmount ?? displaySubtotal;
  const authorizedTotal = payment?.authorizedAmount ?? displaySubtotal;
  const merchantAccepted = order.merchantAcceptanceStatus === "accepted";
  const pickupReady = ["ready", "picked_up"].includes(order.pickupStatus);
  const orderLocked = order.status === "locked";
  const withdrawalLocked = !historical && (orderLocked || isWithdrawalLocked(deal));
  const progress = deal ? getDealProgress(deal) : null;
  const progressText = progress ? `${progress.currentCups} / ${progress.nextTarget} 杯` : "團購資料已不存在";

  return (
    <View style={styles.orderCard}>
      <View style={[styles.statusBar, historical && styles.historyStatusBar]}>
        <View style={styles.statusGroup}>
          <StatusBadge owner="payment" value={order.paymentStatus} />
          <Text style={styles.statusText}>團購進度：{progressText}</Text>
        </View>
        {historical ? <Text style={styles.historyReason}>{getHistoryReason(order, deal)}</Text> : null}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.flex}>
          <Text style={styles.storeName}>{store?.name ?? "店家資料"}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.go("dealDetail", { dealId: order.dealId })}
            style={styles.smallDetailButton}
          >
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
              disabled={withdrawalLocked || historical}
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
                (withdrawalLocked || historical) && styles.detailCardLocked,
                pressed && styles.pressed
              ]}
            >
              <View style={styles.detailTop}>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{item.name} ({item.size}) x {item.quantity}</Text>
                  <View style={styles.chips}>
                    <Text style={styles.chip}>{item.sweetness}</Text>
                    <Text style={styles.chip}>{item.ice}</Text>
                    {item.toppings.map((topping) => (
                      <Text key={`${item.id}-${topping}`} style={styles.chip}>{topping}</Text>
                    ))}
                  </View>
                  <Text style={styles.itemPrice}>{formatCurrency(item.subtotal)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={withdrawalLocked || historical}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    const nextItems = orderItems.filter((current) => current.id !== item.id);
                    actions.updateOrderItems(order.id, nextItems);
                  }}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    (withdrawalLocked || historical) && styles.deleteButtonDisabled,
                    pressed && styles.pressed
                  ]}
                >
                  <Text style={[styles.deleteText, (withdrawalLocked || historical) && styles.deleteTextDisabled]}>
                    {historical ? "歷史" : withdrawalLocked ? "鎖定" : "刪除"}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
          {orderItems.length === 0 ? <Text style={styles.emptyItems}>目前沒有飲品明細。</Text> : null}
        </ScrollView>

        {historical ? (
          <Text style={styles.historyNotice}>歷史訂單不可修改，僅保留查詢紀錄。</Text>
        ) : orderLocked ? (
          <Text style={styles.withdrawalLockNotice}>活動已到結束時間，系統已自動鎖定訂單。</Text>
        ) : withdrawalLocked ? (
          <Text style={styles.withdrawalLockNotice}>截止前 30 分鐘訂單已鎖定，只能加入不可退出或修改。</Text>
        ) : null}

        <PrimaryButton
          label={historical ? "歷史訂單不可修改" : withdrawalLocked ? "訂單已鎖定" : "修改訂單"}
          variant="secondary"
          onPress={() => !withdrawalLocked && !historical && navigation.go("drinkSelection", {
            dealId: order.dealId,
            editOrderId: order.id
          })}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>訂單金額</Text>
          <View style={styles.priceGroup}>
            <Text style={styles.price}>{formatCurrency(displayTotal)}</Text>
            <Text style={styles.originalPrice}>{formatCurrency(authorizedTotal)}</Text>
          </View>
        </View>

        {order.reauthorizationReason === "order_amount_changed" && !historical ? (
          <View style={styles.reauthorizationNotice}>
            <Text style={styles.reauthorizationTitle}>訂單金額已變動</Text>
            <Text style={styles.reauthorizationText}>修改後需重新完成 Line Pay 預授權，訂單才會重新計入團購杯數。</Text>
            <PrimaryButton
              label="重新預授權"
              onPress={() => navigation.go("paymentReport", { dealId: order.dealId, orderId: order.id })}
            />
          </View>
        ) : null}
      </Section>

      {pickupReady && !historical ? (
        <View style={styles.pickupPass}>
          <View>
            <Text style={styles.passLabel}>取貨憑證</Text>
            <Text style={styles.passCode}>A7924</Text>
          </View>
          <View style={styles.qrBox}>
            <Text style={styles.qrText}>QR</Text>
          </View>
        </View>
      ) : !historical ? (
        <View style={styles.pickupPending}>
          <Text style={styles.pickupPendingTitle}>
            {merchantAccepted ? "店家製作中" : "等待店家確認接單"}
          </Text>
          <Text style={styles.pickupPendingText}>
            {merchantAccepted
              ? "店家標記可取貨後，取貨憑證才會顯示。"
              : "店家確認接單後會進入製作中，完成後才會顯示取貨憑證。"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function OrderTabs({ tab, setTab }) {
  return (
    <View style={styles.tabRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setTab("active")}
        style={[styles.tabItem, tab === "active" && styles.activeTabItem]}
      >
        <Text style={[styles.tabText, tab === "active" && styles.activeTabText]}>訂單列表</Text>
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
  );
}

function CartDraftSection({ cartDeal, cartItems, cartTotalQuantity, cartTotalAmount, navigation }) {
  return (
    <Section title={`購物車草稿，共 ${cartTotalQuantity} 杯`}>
      <View style={styles.cartDraftHeader}>
        <View style={styles.flex}>
          <Text style={styles.cartDraftTitle}>{cartDeal?.title ?? "尚未選擇團購"}</Text>
          <Text style={styles.meta}>送出購物車後才會建立訂單，並進入 Line Pay 預授權流程。</Text>
        </View>
        <Text style={styles.cartDraftAmount}>{formatCurrency(cartTotalAmount)}</Text>
      </View>
      <View style={styles.cartDraftList}>
        {cartItems.map((item) => (
          <View key={item.id} style={styles.cartDraftItem}>
            <Text style={styles.cartDraftItemName}>{item.itemName} x {item.quantity}</Text>
            <Text style={styles.cartDraftItemMeta}>{item.sweetness} / {item.ice} / {item.toppings.join("、") || "不加料"}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton
        label="查看購物車"
        onPress={() => cartDeal && navigation.go("cart", { dealId: cartDeal.id })}
      />
    </Section>
  );
}

function getOrderSubtotal(order) {
  const items = (order.items ?? []).map(normalizeOrderItem);
  if (items.length === 0) return order.subtotal ?? order.originalAmount ?? 0;
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

function isHistoryOrder(order, deals) {
  const deal = deals.find((item) => item.id === order.dealId);
  const historyDealStatuses = ["cancelled", "failed", "completed"];
  const historyOrderStatuses = ["cancelled", "completed"];
  return historyDealStatuses.includes(deal?.status) || historyOrderStatuses.includes(order.status);
}

function getHistoryReason(order, deal) {
  if (deal?.status === "cancelled") return "此團購已由管理員取消，訂單已移至歷史訂單。";
  if (deal?.status === "failed") return "此團購未達門檻，訂單已移至歷史訂單。";
  if (deal?.status === "completed" || order.status === "completed") return "此訂單已完成。";
  if (order.status === "cancelled") return "此訂單已取消。";
  return "此訂單已歸入歷史訂單。";
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
  orderList: {
    gap: 10
  },
  orderListCard: {
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 11
  },
  listTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  storeNameSmall: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  orderSubtitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 4
  },
  listAmount: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "900"
  },
  orderPreview: {
    gap: 4
  },
  previewText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700"
  },
  openHint: {
    color: "#1f6feb",
    fontSize: 11,
    fontWeight: "900"
  },
  emptyActions: {
    gap: 8
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
  statusBar: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ecfdf5",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0"
  },
  historyStatusBar: {
    backgroundColor: "#f8fafc",
    borderBottomColor: "#e2e8f0"
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
  historyNotice: {
    color: "#64748b",
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
