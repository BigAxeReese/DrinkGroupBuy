import { StyleSheet, Text } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { StatusBadge } from "../components/StatusBadge";
import { stores } from "../mock/stores";
import { formatCurrency, getDealById } from "../utils/calculations";

export function PickupInfoScreen({ navigation, route, appState, memberAction, selectedCustomerId }) {
  const order = appState.orders.find((item) => item.id === route.params?.orderId && item.customerId === selectedCustomerId)
    ?? appState.orders.find((item) => item.customerId === selectedCustomerId);
  const deal = order ? getDealById(appState.deals, route.params?.dealId ?? order.dealId) : null;
  const store = deal ? stores.find((item) => item.id === deal.storeId) : null;
  if (!order || !deal || !store) {
    return (
      <MobileScreen
        title="取貨資訊"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有取貨資料">
          <Text style={styles.meta}>訂單已清空。送出訂單並由店家確認接單後，才會顯示取貨資訊與取貨憑證。</Text>
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
        <Text style={styles.meta}>時間：{deal.pickupTime}</Text>
        <PlaceholderBox title="地圖導航" />
      </Section>

      <Section title="異動提示">
        <Text style={styles.meta}>取貨憑證會在店家確認接單後顯示。</Text>
        <PlaceholderBox title="取貨碼" />
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
  }
});
