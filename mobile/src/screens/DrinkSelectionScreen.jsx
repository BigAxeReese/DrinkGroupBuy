import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { drinks } from "../mock/drinks";
import { stores } from "../mock/stores";
import { calculateDrinkSubtotal, formatCurrency, getDealById, getDrinkById, getStoreById } from "../utils/calculations";

export function DrinkSelectionScreen({ navigation, route, appState, actions, memberAction }) {
  const deal = getDealById(appState.deals, route.params?.dealId);
  const store = getStoreById(stores, deal.storeId);
  const storeDrinks = drinks.filter((drink) => drink.storeId === deal.storeId);
  const editOrderItem = route.params?.editOrderItem;
  const initialDrinkId = storeDrinks.find((item) => item.id === editOrderItem?.drinkId)?.id ?? storeDrinks[0]?.id;
  const [drinkId, setDrinkId] = useState(initialDrinkId);
  const drink = getDrinkById(storeDrinks, drinkId);
  const initialTopping = drink.toppings.find((item) => editOrderItem?.toppings?.includes(item.name));
  const [sweetness, setSweetness] = useState(editOrderItem?.sweetness ?? drink.sweetnessOptions[0]);
  const [ice, setIce] = useState(editOrderItem?.ice ?? drink.iceOptions[0]);
  const [toppingId, setToppingId] = useState(initialTopping?.id ?? drink.toppings[0].id);
  const [quantity, setQuantity] = useState(editOrderItem?.quantity ?? 1);
  const [fallbackPreference, setFallbackPreference] = useState("decline_original_price");
  const [submitted, setSubmitted] = useState(false);
  const [customizing, setCustomizing] = useState(Boolean(editOrderItem));

  const subtotal = useMemo(() => calculateDrinkSubtotal(drink, toppingId, quantity), [drink, toppingId, quantity]);
  const categories = [
    { id: "recommended", label: "推薦" },
    { id: "tea", label: "純茶系列" },
    { id: "milk_tea", label: "鮮奶系列" },
    { id: "fruit", label: "果茶系列" }
  ];
  const [category, setCategory] = useState("recommended");
  const filteredDrinks = category === "recommended"
    ? storeDrinks
    : storeDrinks.filter((item) => item.category === category);

  return (
    <MobileScreen
      title={editOrderItem ? "修改飲料" : "選擇飲料"}
      subtitle={`${store?.name} · ${deal.title}`}
      onBack={() => navigation.back()}
      onMemberPress={memberAction}
    >
      <View style={styles.menuHero}>
        <Text style={styles.shopName}>{store?.name}</Text>
        <Text style={styles.dealName}>{deal.title}</Text>
      </View>

      <View style={styles.categoryRow}>
        {categories.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => setCategory(item.id)}
            style={[styles.categoryPill, category === item.id && styles.activeCategoryPill]}
          >
            <Text style={[styles.categoryText, category === item.id && styles.activeCategoryText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <Section title={customizing ? "已選飲料" : "人氣推薦"}>
        {filteredDrinks.length ? filteredDrinks.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => {
              setDrinkId(item.id);
              setSweetness(item.sweetnessOptions[0]);
              setIce(item.iceOptions[0]);
              setToppingId(item.toppings[0].id);
              setCustomizing(true);
            }}
            style={({ pressed }) => [
              styles.menuItem,
              drinkId === item.id && styles.activeMenuItem,
              customizing && drinkId !== item.id && styles.hiddenItem,
              pressed && styles.pressed
            ]}
          >
            <View style={styles.menuTextGroup}>
              <View style={styles.nameRow}>
                <Text style={styles.menuItemName}>{item.name}</Text>
                {item.id === storeDrinks[0]?.id ? <Text style={styles.hotTag}>推</Text> : null}
              </View>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <Text style={styles.menuPrice}>{formatCurrency(item.price)}</Text>
          </Pressable>
        )) : (
          <Text style={styles.meta}>此分類目前沒有品項。</Text>
        )}
        {customizing ? (
          <PrimaryButton label="重新選擇飲料" variant="secondary" onPress={() => setCustomizing(false)} />
        ) : null}
      </Section>

      {customizing ? (
        <>
          <Section title="甜度">
            <OptionGroup options={drink.sweetnessOptions} value={sweetness} onChange={setSweetness} />
          </Section>

          <Section title="冰塊">
            <OptionGroup options={drink.iceOptions} value={ice} onChange={setIce} />
          </Section>

          <Section title="加料">
            {drink.toppings.map((item) => (
              <OptionButton
                key={item.id}
                active={toppingId === item.id}
                label={`${item.name}${item.price ? ` +${formatCurrency(item.price)}` : ""}`}
                onPress={() => setToppingId(item.id)}
              />
            ))}
          </Section>

          <Section title="數量與流團偏好">
            <View style={styles.quantityRow}>
              <PrimaryButton label="-" variant="secondary" onPress={() => setQuantity((value) => Math.max(1, value - 1))} />
              <Text style={styles.quantity}>{quantity}</Text>
              <PrimaryButton label="+" variant="secondary" onPress={() => setQuantity((value) => value + 1)} />
            </View>
            <OptionButton
              active={fallbackPreference === "decline_original_price"}
              label="流團時不原價購買，不付款"
              onPress={() => setFallbackPreference("decline_original_price")}
            />
            <OptionButton
              active={fallbackPreference === "accept_original_price"}
              label="流團時接受原價購買"
              onPress={() => setFallbackPreference("accept_original_price")}
            />
          </Section>

          <Section title="小計">
            <Text style={styles.subtotal}>{formatCurrency(subtotal)}</Text>
          </Section>

          <View style={styles.stickyAction}>
            <Text style={styles.stickyTotal}>{formatCurrency(subtotal)}</Text>
            <PrimaryButton
              label={editOrderItem ? "儲存修改（Mock）" : "加入團購"}
              onPress={() => {
                const selectedTopping = drink.toppings.find((item) => item.id === toppingId);
                if (editOrderItem) {
                  route.params?.onSaveOrderItem?.({
                    ...editOrderItem,
                    drinkId: drink.id,
                    name: drink.name,
                    quantity,
                    sweetness,
                    ice,
                    toppings: selectedTopping && selectedTopping.id !== "none" ? [selectedTopping.name] : ["不加料"],
                    unitPrice: quantity > 0 ? Math.round(subtotal / quantity) : subtotal,
                    subtotal
                  });
                  setSubmitted(true);
                  navigation.back();
                  return;
                }
                const orderId = actions.joinGroupOrder({
                  dealId: deal.id,
                  storeName: store?.name ?? "Mock store",
                  itemName: drink.name,
                  quantity,
                  sweetness,
                  ice,
                  toppings: selectedTopping && selectedTopping.id !== "none" ? [selectedTopping.name] : ["不加料"],
                  subtotal,
                  fallbackPurchasePreference: fallbackPreference
                });
                setSubmitted(true);
                navigation.go("groupProgress", { dealId: deal.id, orderId });
              }}
            />
          </View>
          {submitted ? <Text style={styles.success}>已加入團購。</Text> : null}
        </>
      ) : (
        <Text style={styles.selectHint}>請先選擇飲料，再設定甜度、冰塊與加料。</Text>
      )}
    </MobileScreen>
  );
}

function OptionGroup({ options, value, onChange }) {
  return (
    <View style={styles.optionWrap}>
      {options.map((option) => (
        <OptionButton key={option} active={value === option} label={option} onPress={() => onChange(option)} />
      ))}
    </View>
  );
}

function OptionButton({ active, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, active && styles.activeOption, pressed && styles.pressed]}
    >
      <Text style={[styles.optionText, active && styles.activeOptionText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  menuHero: {
    gap: 5,
    paddingVertical: 8
  },
  shopName: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  },
  dealName: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700"
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4
  },
  categoryPill: {
    minHeight: 42,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: "#eef2f7",
    paddingHorizontal: 15
  },
  activeCategoryPill: {
    backgroundColor: "#111827"
  },
  categoryText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900"
  },
  activeCategoryText: {
    color: "#ffffff"
  },
  menuItem: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    paddingVertical: 12
  },
  activeMenuItem: {
    backgroundColor: "#f8fbff"
  },
  hiddenItem: {
    display: "none"
  },
  pressed: {
    opacity: 0.76
  },
  menuTextGroup: {
    flex: 1,
    gap: 5
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  menuItemName: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  hotTag: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "900"
  },
  menuDescription: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18
  },
  menuPrice: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  option: {
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  activeOption: {
    borderColor: "#1f6feb",
    backgroundColor: "#dbeafe"
  },
  pressed: {
    opacity: 0.75
  },
  optionText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800"
  },
  activeOptionText: {
    color: "#1f6feb"
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  quantity: {
    minWidth: 50,
    textAlign: "center",
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  subtotal: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19
  },
  selectHint: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    paddingVertical: 8
  },
  stickyAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#111827",
    padding: 12
  },
  stickyTotal: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    paddingLeft: 8
  },
  success: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center"
  }
});
