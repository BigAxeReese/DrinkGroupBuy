import { StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { getStoreById } from "../utils/calculations";
import { colors, tones } from "../theme/tokens";

export function MerchantProductionListScreen({ navigation, route, appState, selectedMerchantStoreId }) {
  const groupBuyActivityId = route.params?.groupBuyActivityId;
  const groupBuyActivity = appState.groupBuyActivities.find((item) => item.id === groupBuyActivityId);
  const store = getStoreById(appState.stores ?? [], groupBuyActivity?.storeId ?? selectedMerchantStoreId);

  const manufacturableOrders = appState.orders.filter((order) => (
    order.groupBuyActivityId === groupBuyActivityId
    && order.paymentStatus === "captured"
    && order.status !== "cancelled"
    && order.pickupStatus === "not_ready"
  ));

  const summaryRows = buildProductionSummary(manufacturableOrders);
  const totalCups = summaryRows.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <MobileScreen
      title="總製作清單"
      subtitle={groupBuyActivity ? `${groupBuyActivity.title} · ${store?.name ?? ""}` : "找不到這筆團購活動"}
      onBack={() => navigation.goBack()}
    >
      {!groupBuyActivity ? (
        <Text style={styles.emptyText}>找不到這筆團購活動。</Text>
      ) : (
        <>
          <Section title={`待製作合計（${manufacturableOrders.length} 筆訂單 · ${totalCups} 杯）`}>
            {summaryRows.length === 0 ? (
              <Text style={styles.emptyText}>目前沒有待製作的訂單。</Text>
            ) : (
              summaryRows.map((row) => (
                <View key={row.key} style={styles.summaryRow}>
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{row.itemName}</Text>
                    <Text style={styles.itemDetail}>{formatVariantDetail(row)}</Text>
                  </View>
                  <Text style={styles.quantity}>x{row.quantity}</Text>
                </View>
              ))
            )}
          </Section>

          <Section title={`依訂單明細（共 ${manufacturableOrders.length} 筆）`}>
            {manufacturableOrders.length === 0 ? (
              <Text style={styles.emptyText}>目前沒有待製作的訂單。</Text>
            ) : (
              manufacturableOrders.map((order) => (
                <View key={order.id} style={styles.orderRow}>
                  <Text style={styles.orderCustomer}>{order.customerDisplayName || order.customerId || "顧客"}</Text>
                  {(order.items || []).map((item, index) => (
                    <Text key={`${order.id}-${index}`} style={styles.orderItem}>
                      {item.itemName} x{item.quantity}（{formatVariantDetail(item)}）
                    </Text>
                  ))}
                </View>
              ))
            )}
          </Section>
        </>
      )}
    </MobileScreen>
  );
}

function buildProductionSummary(orders) {
  const rowsByKey = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      const toppings = [...(item.toppings || [])].sort();
      const key = [item.itemName, item.size, item.sweetness, item.ice, toppings.join("、")].join("|");
      const existingRow = rowsByKey.get(key);
      if (existingRow) {
        existingRow.quantity += item.quantity;
      } else {
        rowsByKey.set(key, {
          key,
          itemName: item.itemName,
          size: item.size,
          sweetness: item.sweetness,
          ice: item.ice,
          toppings,
          quantity: item.quantity
        });
      }
    }
  }

  return [...rowsByKey.values()].sort((a, b) => (
    b.quantity - a.quantity || a.itemName.localeCompare(b.itemName)
  ));
}

function formatVariantDetail(row) {
  return [row.size, row.sweetness, row.ice, ...(row.toppings || [])].filter(Boolean).join("、") || "無客製化";
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineRow,
    paddingVertical: 9
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  itemDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  quantity: {
    color: colors.accentInk,
    fontSize: 20,
    fontWeight: "900"
  },
  orderRow: {
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineRow,
    paddingVertical: 8
  },
  orderCustomer: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "900"
  },
  orderItem: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  }
});
