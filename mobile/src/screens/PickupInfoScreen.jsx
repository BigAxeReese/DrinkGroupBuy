import { StyleSheet, Text } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { StatusBadge } from "../components/StatusBadge";
import { pickupInfo } from "../mock/pickupInfo";
import { formatCurrency } from "../utils/calculations";

export function PickupInfoScreen({ navigation, route, appState, memberAction }) {
  const pickup = pickupInfo.find((item) => item.orderId === route.params?.orderId) ?? pickupInfo[0];
  const order = appState.orders.find((item) => item.id === route.params?.orderId);

  return (
    <MobileScreen
      title="取貨資訊"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="取貨狀態">
        <StatusBadge owner="pickup" value={pickup.status} />
        <Text style={styles.title}>{pickup.storeName}</Text>
        <Text style={styles.meta}>{pickup.itemSummary}</Text>
        {order ? (
          <Text style={styles.meta}>我的訂單：{order.itemName} x {order.quantity}，{formatCurrency(order.subtotal)}</Text>
        ) : null}
      </Section>

      <Section title="到店資訊">
        <Text style={styles.meta}>地址：{pickup.address}</Text>
        <Text style={styles.meta}>時間：{pickup.pickupTime}</Text>
        <PlaceholderBox title="地圖導航" />
      </Section>

      <Section title="異動提示">
        <Text style={styles.meta}>{pickup.updateNotice}</Text>
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
