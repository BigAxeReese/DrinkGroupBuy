import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MobileScreen, Section } from "../components/MobileScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { getStoreMenu } from "../utils/apiClient";
import { formatCurrency, getGroupBuyActivityById } from "../utils/calculations";

export function DrinkSelectionScreen({ navigation, route, appState, actions, memberAction, selectedCustomerId }) {
  const groupBuyActivity = getGroupBuyActivityById(appState.groupBuyActivities, route.params?.groupBuyActivityId);
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(Boolean(groupBuyActivity));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!groupBuyActivity) return undefined;
    let active = true;
    setLoading(true);
    setError(null);
    getStoreMenu(groupBuyActivity.storeId)
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
  }, [groupBuyActivity?.storeId]);

  if (!groupBuyActivity) {
    return (
      <MobileScreen
        title="選擇飲料"
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有可加入的團購">
          <Text style={styles.meta}>團購已清空，或目前尚未有商家建立活動。</Text>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => navigation.replace("nearby")} />
        </Section>
      </MobileScreen>
    );
  }
  if (loading) {
    return (
      <MobileScreen title="選擇飲料" onBack={() => navigation.back()} onMemberPress={memberAction}>
        <Section title="正在載入"><Text style={styles.meta}>正在讀取店家最新菜單與價格…</Text></Section>
      </MobileScreen>
    );
  }
  if (error || !menu || menu.menuItems.length === 0) {
    return (
      <MobileScreen title="選擇飲料" onBack={() => navigation.back()} onMemberPress={memberAction}>
        <Section title="目前沒有可用菜單">
          <Text style={styles.meta}>{error || "這間店目前沒有上架飲品。"}</Text>
        </Section>
      </MobileScreen>
    );
  }

  return (
    <DrinkMenuContent
      navigation={navigation}
      route={route}
      appState={appState}
      actions={actions}
      memberAction={memberAction}
      selectedCustomerId={selectedCustomerId}
      groupBuyActivity={groupBuyActivity}
      menu={menu}
    />
  );
}

function DrinkMenuContent({ navigation, route, appState, actions, memberAction, selectedCustomerId, groupBuyActivity, menu }) {
  const store = menu.store;
  const storeDrinks = menu.menuItems;

  const editOrderItem = route.params?.editOrderItem;
  const editOrderId = route.params?.editOrderId;
  const initialDrinkId = storeDrinks.find((item) => item.id === editOrderItem?.drinkId)?.id ?? storeDrinks[0]?.id;
  const [drinkId, setDrinkId] = useState(initialDrinkId);
  const drink = storeDrinks.find((item) => item.id === drinkId) || storeDrinks[0];
  const [selectedOptionIds, setSelectedOptionIds] = useState(() => buildInitialSelections(drink, editOrderItem));
  const [quantity, setQuantity] = useState(editOrderItem?.quantity ?? 1);
  const [submitted, setSubmitted] = useState(false);
  const [customizing, setCustomizing] = useState(Boolean(editOrderItem));
  const cartItemsForGroupBuyActivity = (appState.cartItems ?? []).filter((item) => (
    item.groupBuyActivityId === groupBuyActivity.id && (!item.customerId || item.customerId === selectedCustomerId)
  ));
  const cartQuantity = cartItemsForGroupBuyActivity.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItemsForGroupBuyActivity.reduce((sum, item) => sum + item.subtotal, 0);

  const selectedOptions = drink.customizationGroups
    .flatMap((group) => group.options)
    .filter((option) => selectedOptionIds.includes(option.id));
  const unitPrice = drink.basePrice + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
  const subtotal = unitPrice * quantity;
  const categories = [{ id: "recommended", label: "全部" }, ...[...new Set(storeDrinks.map((item) => item.category))]
    .map((categoryId) => ({ id: categoryId, label: categoryId }))];
  const [category, setCategory] = useState("recommended");
  const filteredDrinks = category === "recommended"
    ? storeDrinks
    : storeDrinks.filter((item) => item.category === category);

  return (
    <View style={styles.screenWrap}>
      <MobileScreen
        title={editOrderItem ? "修改飲料" : "選擇飲料"}
        subtitle={`${store?.name} · ${groupBuyActivity.title}`}
        onBack={() => navigation.back()}
        onMemberPress={memberAction}
      >
      <View style={styles.menuHero}>
        <Text style={styles.shopName}>{store?.name}</Text>
        <Text style={styles.groupBuyActivityName}>{groupBuyActivity.title}</Text>
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
              setSelectedOptionIds(buildInitialSelections(item, null));
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
            <Text style={styles.menuPrice}>{formatCurrency(item.basePrice)}</Text>
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
          {drink.customizationGroups.map((group) => (
            <Section key={group.optionType} title={getGroupTitle(group.optionType)}>
              {group.options.length === 0 || group.maxSelections === 0 ? (
                <Text style={styles.meta}>此飲品不提供{getGroupTitle(group.optionType)}選項。</Text>
              ) : (
                <View style={styles.optionWrap}>
                  {group.options.map((option) => (
                    <OptionButton
                      key={option.id}
                      active={selectedOptionIds.includes(option.id)}
                      label={`${option.label}${option.priceDelta ? ` +${formatCurrency(option.priceDelta)}` : ""}`}
                      onPress={() => setSelectedOptionIds((current) => toggleOption(current, option.id, group))}
                    />
                  ))}
                </View>
              )}
              {group.optionType === "topping" && group.maxSelections > 0 ? (
                <Text style={styles.meta}>最多可選 {group.maxSelections} 種加料。</Text>
              ) : null}
            </Section>
          ))}

          <Section title="數量">
            <View style={styles.quantityRow}>
              <PrimaryButton label="-" variant="secondary" onPress={() => setQuantity((value) => Math.max(1, value - 1))} />
              <Text style={styles.quantity}>{quantity}</Text>
              <PrimaryButton label="+" variant="secondary" onPress={() => setQuantity((value) => value + 1)} />
            </View>
          </Section>

          <Section title="小計">
            <Text style={styles.subtotal}>{formatCurrency(subtotal)}</Text>
          </Section>

          <View style={styles.stickyAction}>
            <PrimaryButton
              label={editOrderItem ? "儲存修改（Mock）" : editOrderId ? "加入訂單並重新預授權" : "加入購物車"}
              style={styles.stickyButton}
              onPress={() => {
                const orderItem = buildCartItem({
                  drink,
                  store,
                  groupBuyActivity,
                  quantity,
                  unitPrice,
                  subtotal,
                  selectedOptions,
                  selectedOptionIds
                });
                if (editOrderItem) {
                  route.params?.onSaveOrderItem?.({
                    ...editOrderItem,
                    ...orderItem
                  });
                  setSubmitted(true);
                  navigation.back();
                  return;
                }
                if (editOrderId) {
                  actions.addToCart({
                    ...orderItem,
                    targetOrderId: editOrderId,
                  });
                  setSubmitted(true);
                  setCustomizing(false);
                  setQuantity(1);
                  return;
                }
                actions.addToCart({
                  ...orderItem
                });
                setSubmitted(true);
                setCustomizing(false);
                setQuantity(1);
              }}
            />
          </View>
          {submitted ? <Text style={styles.success}>已加入購物車。</Text> : null}
        </>
      ) : (
        <Text style={styles.selectHint}>請先選擇飲料，再設定甜度、冰塊與加料。</Text>
      )}
      </MobileScreen>
      {cartQuantity > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.go("cart", { groupBuyActivityId: groupBuyActivity.id })}
          style={({ pressed }) => [styles.floatingCart, pressed && styles.pressed]}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartQuantity}</Text>
          </View>
          <View style={styles.floatingCartTextGroup}>
            <Text style={styles.floatingCartTitle}>購物車</Text>
            <Text style={styles.floatingCartMeta}>{formatCurrency(cartTotal)}</Text>
          </View>
          <Text style={styles.floatingCartArrow}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function buildInitialSelections(drink, editOrderItem) {
  const existingIds = new Set(editOrderItem?.customizationOptionIds || []);
  const selected = [];
  for (const group of drink.customizationGroups) {
    const matchingById = group.options.filter((option) => existingIds.has(option.id));
    const matchingByLabel = group.options.filter((option) => {
      if (group.optionType === "topping") return editOrderItem?.toppings?.includes(option.label);
      return editOrderItem?.[group.optionType] === option.label;
    });
    const matches = matchingById.length ? matchingById : matchingByLabel;
    if (matches.length) {
      selected.push(...matches.slice(0, group.maxSelections));
    } else if (group.minSelections > 0 && group.options[0]) {
      selected.push(group.options[0]);
    }
  }
  return selected.map((option) => option.id);
}

function toggleOption(current, optionId, group) {
  const groupIds = new Set(group.options.map((option) => option.id));
  const activeGroupIds = current.filter((id) => groupIds.has(id));
  if (activeGroupIds.includes(optionId)) {
    if (activeGroupIds.length <= group.minSelections) return current;
    return current.filter((id) => id !== optionId);
  }
  if (group.maxSelections === 1) {
    return [...current.filter((id) => !groupIds.has(id)), optionId];
  }
  if (activeGroupIds.length >= group.maxSelections) return current;
  return [...current, optionId];
}

function buildCartItem({ drink, store, groupBuyActivity, quantity, unitPrice, subtotal, selectedOptions, selectedOptionIds }) {
  const labelFor = (optionType) => selectedOptions.find((option) => option.optionType === optionType)?.label || "";
  return {
    groupBuyActivityId: groupBuyActivity.id,
    drinkId: drink.id,
    storeName: store.name,
    name: drink.name,
    itemName: drink.name,
    size: labelFor("size"),
    quantity,
    sweetness: labelFor("sweetness"),
    ice: labelFor("ice"),
    toppings: selectedOptions.filter((option) => option.optionType === "topping").map((option) => option.label),
    customizationOptionIds: selectedOptionIds,
    unitPrice,
    subtotal
  };
}

function getGroupTitle(optionType) {
  return { size: "尺寸", sweetness: "甜度", ice: "冰塊", topping: "加料" }[optionType] || optionType;
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
  screenWrap: {
    flex: 1
  },
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
  groupBuyActivityName: {
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
    width: "100%",
    borderRadius: 18,
    backgroundColor: "transparent",
    paddingVertical: 4
  },
  stickyButton: {
    minHeight: 58,
    borderRadius: 18
  },
  success: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center"
  },
  floatingCart: {
    position: "absolute",
    right: 18,
    bottom: 22,
    minWidth: 156,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#111827",
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  cartBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    paddingHorizontal: 8
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  floatingCartTextGroup: {
    flex: 1
  },
  floatingCartTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  floatingCartMeta: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  floatingCartArrow: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900"
  }
});
