import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency, getGroupBuyActivityById } from "../utils/calculations";
import { getGroupBuyActivityStore } from "../utils/groupBuyActivityStores";

export function PickupInfoScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const order = appState.orders.find((item) => item.id === route.params?.orderId && item.customerId === selectedCustomerId)
    ?? appState.orders.find((item) => item.customerId === selectedCustomerId);
  const groupBuyActivity = order ? getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId ?? order.groupBuyActivityId) : null;
  const store = order?.backendStore ?? getGroupBuyActivityStore(groupBuyActivity);
  const pickupCode = order?.pickupCredential?.status === "active"
    ? order.pickupCredential.pickupCode
    : null;

  useEffect(() => {
    if (!order?.id) return;
    actions.syncOrderFromBackend(order.id).catch(() => {});
  }, [order?.id]);
  if (!order || !groupBuyActivity || !store) {
    return (
      <MobileScreen
        title="取貨資訊"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有取貨資料">
          <Text style={styles.meta}>訂單完成付款並進入取貨流程後，才會顯示取貨資訊與取貨憑證。</Text>
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      title="取貨資訊"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="取貨狀態">
        <StatusBadge owner="pickup" value={order.pickupStatus} />
        <Text style={styles.title}>{store.name}</Text>
        <Text style={styles.meta}>我的訂單：{order.itemName} x {order.quantity}，{formatCurrency(order.subtotal)}</Text>
      </Section>

      <Section title="到店資訊">
        <Text style={styles.meta}>地址：{store.address}</Text>
        <Text style={styles.meta}>時間：{groupBuyActivity.pickupTime}</Text>
        <PlaceholderBox title="地圖導航" />
      </Section>

      <Section title="取餐憑證">
        {pickupCode ? (
          <View style={styles.pickupPass}>
            <Text style={styles.passLabel}>六位取餐碼</Text>
            <Text style={styles.passCode}>{pickupCode}</Text>
            <Text style={styles.passHint}>到店取餐時，將此代碼提供給店家。</Text>
          </View>
        ) : (
          <Text style={styles.meta}>
            {order.pickupStatus === "picked_up" ? "此訂單已完成取餐。" : "店家標記可取餐後，六位取餐碼會顯示在這裡。"}
          </Text>
        )}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900"
  },
  meta: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21
  },
  pickupPass: {
    gap: 7,
    minHeight: 128,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    padding: 16
  },
  passLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  passCode: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center"
  },
  passHint: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  }
});
