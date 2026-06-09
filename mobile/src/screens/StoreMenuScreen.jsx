import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { drinks } from "../mock/drinks";
import { stores } from "../mock/stores";
import { formatCurrency } from "../utils/calculations";

const businessStatusLabels = {
  open: "營業中",
  closed: "休息中",
  temporarily_closed: "暫停營業"
};

export function StoreMenuScreen({ navigation, route, memberAction }) {
  const storeId = route.params?.storeId;
  const store = stores.find((item) => item.id === storeId);
  const storeDrinks = drinks.filter((drink) => drink.storeId === storeId);

  if (!store) {
    return (
      <MobileScreen
        title="店家菜單"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="找不到店家">
          <Text style={styles.meta}>此店家可能已從 prototype mock data 移除。</Text>
          <PrimaryButton label="返回地圖" variant="secondary" onPress={() => navigation.replace("liveMap")} />
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      title="店家菜單"
      subtitle="目前沒有進行中的團購，可先查看店家飲品與客製化選項。"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="店家資訊">
        <View style={styles.storeHeader}>
          <View style={styles.flex}>
            <Text style={styles.storeName}>{store.name}</Text>
            <Text style={styles.meta}>{store.distanceText} · {store.address}</Text>
            <Text style={styles.meta}>{store.phone}</Text>
          </View>
          <View style={[styles.businessBadge, styles[store.businessStatus] || styles.closed]}>
            <Text style={styles.businessBadgeText}>{businessStatusLabels[store.businessStatus] ?? store.businessStatus}</Text>
          </View>
        </View>
      </Section>

      <Section title="目前狀態">
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>此店家目前沒有進行中的團購</Text>
          <Text style={styles.noticeText}>此畫面僅供瀏覽菜單，不會加入購物車，也不會建立訂單。</Text>
        </View>
      </Section>

      <Section title="飲品菜單">
        {storeDrinks.length > 0 ? (
          storeDrinks.map((drink) => (
            <View key={drink.id} style={styles.drinkCard}>
              <View style={styles.drinkTopRow}>
                <View style={styles.flex}>
                  <Text style={styles.drinkName}>{drink.name}</Text>
                  <Text style={styles.description}>{drink.description}</Text>
                </View>
                <Text style={styles.price}>{formatCurrency(drink.price)}</Text>
              </View>
              <Text style={styles.optionText}>甜度：{drink.sweetnessOptions.join("、")}</Text>
              <Text style={styles.optionText}>冰塊：{drink.iceOptions.join("、")}</Text>
              <Text style={styles.optionText}>
                加料：{drink.toppings.map((topping) => `${topping.name}${topping.price > 0 ? ` +${formatCurrency(topping.price)}` : ""}`).join("、")}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.meta}>此店家目前沒有 mock 菜單資料。</Text>
          </View>
        )}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  storeHeader: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  flex: {
    flex: 1
  },
  storeName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20
  },
  businessBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  businessBadgeText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  },
  open: {
    backgroundColor: "#dcfce7"
  },
  closed: {
    backgroundColor: "#e2e8f0"
  },
  temporarily_closed: {
    backgroundColor: "#fef3c7"
  },
  noticeBox: {
    gap: 4,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 12
  },
  noticeTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  noticeText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19
  },
  drinkCard: {
    gap: 7,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  drinkTopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  drinkName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  description: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18
  },
  price: {
    color: "#1f6feb",
    fontSize: 15,
    fontWeight: "900"
  },
  optionText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18
  },
  emptyBox: {
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 12
  }
});
