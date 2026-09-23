import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { TonePill } from "../components/TonePill";
import { colors, maxFontSizeMultiplier, spacing, typeScale } from "../theme/tokens";
import { getStoreMenu } from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";

const businessStatusLabels = {
  open: "營業中",
  closed: "休息中",
  temporarily_closed: "暫停營業"
};

// Pill tone per business status; an unknown value falls back to neutral and shows its raw text.
const businessStatusTones = {
  open: "success",
  closed: "neutral",
  temporarily_closed: "warning"
};

export function StoreMenuScreen({ navigation, route, memberAction }) {
  const storeId = route.params?.storeId;
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getStoreMenu(storeId)
      .then((result) => {
        if (active) setMenu(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "菜單載入失敗。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [storeId]);

  const store = menu?.store;
  const storeDrinks = menu?.menuItems || [];

  if (loading) {
    return (
      <MobileScreen title="店家菜單" onBack={() => navigation.back()} onMemberPress={memberAction}>
        <Section title="正在載入"><EmptyPanel>正在讀取店家最新菜單…</EmptyPanel></Section>
      </MobileScreen>
    );
  }

  if (!store) {
    return (
      <MobileScreen
        title="店家菜單"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="找不到店家">
          <Notice tone="danger" accessibilityRole="alert" message={error || "後端找不到這間店家。"} />
          <PrimaryButton label="返回地圖" variant="secondary" onPress={() => navigation.replace("liveMap")} />
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      title="店家菜單"
      subtitle="目前沒有進行中的團購，可先查看店家飲品。"
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <Section title="店家資訊">
        <Card style={styles.storeCard}>
          <View style={styles.storeHeader}>
            <Text style={styles.storeName}>{store.name}</Text>
            <TonePill
              tone={businessStatusTones[store.businessStatus] ?? "neutral"}
              label={businessStatusLabels[store.businessStatus] ?? store.businessStatus}
            />
          </View>
          <Text style={styles.meta}>{store.address}</Text>
          <Text style={styles.meta}>{store.phone}</Text>
        </Card>
      </Section>

      <Section title="目前狀態">
        <Notice
          tone="neutral"
          title="此店家目前沒有進行中的團購"
          message="此畫面僅供瀏覽菜單，不會加入購物車，也不會建立訂單。"
        />
      </Section>

      <Section title="飲品菜單">
        {storeDrinks.length > 0 ? (
          storeDrinks.map((drink) => (
            <Card compact key={drink.id}>
              <View style={styles.drinkTopRow}>
                <View style={styles.flex}>
                  <Text style={styles.drinkName}>{drink.name}</Text>
                  <Text style={styles.description}>{drink.description}</Text>
                </View>
                <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.price}>{formatCurrency(drink.basePrice)}</Text>
              </View>
            </Card>
          ))
        ) : (
          <EmptyPanel>此店家目前沒有上架飲品。</EmptyPanel>
        )}
      </Section>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  storeCard: {
    gap: spacing.s4
  },
  storeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.s12,
    marginBottom: spacing.s4
  },
  storeName: {
    ...typeScale.sectionTitle,
    flex: 1,
    color: colors.text
  },
  meta: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  drinkTopRow: {
    flexDirection: "row",
    gap: spacing.s12,
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.s4
  },
  drinkName: {
    ...typeScale.button,
    color: colors.text
  },
  description: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  price: {
    ...typeScale.price,
    color: colors.text
  }
});
