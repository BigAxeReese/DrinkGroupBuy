import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MobileScreen } from "../components/MobileScreen";
import { PickupPass } from "../components/PickupPass";
import { PlaceholderBox } from "../components/PlaceholderBox";
import { StatusBadge } from "../components/StatusBadge";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";
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
        onBack={() => navigation.goBack()}
        onMemberPress={memberAction}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>目前沒有取貨資料</Text>
          <Text style={styles.meta}>訂單完成付款並進入取貨流程後，才會顯示取貨資訊與取貨憑證。</Text>
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      title="取貨資訊"
      onBack={() => navigation.goBack()}
      onMemberPress={memberAction}
      headerRight={<StatusBadge owner="pickup" value={order.pickupStatus} />}
    >
      {pickupCode ? (
        <PickupPass pickupCode={pickupCode} cupCount={order.quantity} />
      ) : (
        <View style={styles.pending}>
          <Text style={styles.meta}>
            {order.pickupStatus === "picked_up" ? "此訂單已完成取餐。" : "店家標記可取餐後，六位取餐碼會顯示在這裡。"}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{store.name}</Text>
        <Text style={styles.meta}>地址：{store.address}</Text>
        <Text style={styles.meta}>時間：{groupBuyActivity.pickupTime}</Text>
        <Text style={styles.meta}>我的訂單：{order.itemName} x {order.quantity}，{formatCurrency(order.subtotal)}</Text>
        <PlaceholderBox title="地圖導航" />
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s8,
    padding: spacing.s20,
    borderRadius: radii.lg,
    borderWidth: sizes.stroke,
    borderColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  cardTitle: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  meta: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  pending: {
    padding: spacing.s20,
    borderRadius: radii.lg,
    backgroundColor: colors.recess
  }
});
