import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { ChoiceChip } from "../components/ChoiceChip";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { QuantityStepper } from "../components/QuantityStepper";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { getStoreMenu } from "../utils/apiClient";
import { formatCurrency, getGroupBuyActivityById } from "../utils/calculations";
import { goToCustomerHome } from "../navigation/goToCustomerHome";

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
        onBack={() => navigation.goBack()}
        onMemberPress={memberAction}
      >
        <Section title="目前沒有可加入的團購">
          <EmptyPanel>團購已清空，或目前尚未有商家建立活動。</EmptyPanel>
          <PrimaryButton label="返回首頁" variant="secondary" onPress={() => goToCustomerHome(navigation)} />
        </Section>
      </MobileScreen>
    );
  }
  if (loading) {
    return (
      <MobileScreen title="選擇飲料" onBack={() => navigation.goBack()} onMemberPress={memberAction}>
        <Section title="正在載入"><EmptyPanel>正在讀取店家最新菜單與價格…</EmptyPanel></Section>
      </MobileScreen>
    );
  }
  if (error || !menu || menu.menuItems.length === 0) {
    return (
      <MobileScreen title="選擇飲料" onBack={() => navigation.goBack()} onMemberPress={memberAction}>
        <Section title="目前沒有可用菜單">
          {error ? (
            <Notice accessibilityRole="alert" message={error} tone="danger" />
          ) : (
            <EmptyPanel>這間店目前沒有上架飲品。</EmptyPanel>
          )}
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
  const editOrder = editOrderId ? appState.orders.find((order) => order.id === editOrderId) : null;
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
        onBack={() => navigation.goBack()}
        onMemberPress={memberAction}
      >
      <View style={styles.menuHeader}>
        <View style={styles.menuHero}>
          <Text style={styles.shopName}>{store?.name}</Text>
          <Text style={styles.groupBuyActivityName}>{groupBuyActivity.title}</Text>
        </View>

        <View style={styles.categoryRow}>
          {categories.map((item) => (
            <ChoiceChip
              key={item.id}
              label={item.label}
              onPress={() => setCategory(item.id)}
              selected={category === item.id}
            />
          ))}
        </View>
      </View>

      <Section title={customizing ? "已選飲料" : "人氣推薦"}>
        {filteredDrinks.length ? filteredDrinks.map((item) => (
          <Card
            compact
            accessibilityState={{ selected: customizing && drinkId === item.id }}
            key={item.id}
            onPress={() => {
              setDrinkId(item.id);
              setSelectedOptionIds(buildInitialSelections(item, null));
              setCustomizing(true);
            }}
            style={[
              styles.menuItem,
              customizing && drinkId === item.id && styles.activeMenuItem,
              customizing && drinkId !== item.id && styles.hiddenItem
            ]}
          >
            <View style={styles.menuTextGroup}>
              <View style={styles.nameRow}>
                <Text style={styles.menuItemName}>{item.name}</Text>
                {item.id === storeDrinks[0]?.id ? (
                  <View style={styles.hotTag}>
                    <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.hotTagText}>推</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.menuPrice}>{formatCurrency(item.basePrice)}</Text>
          </Card>
        )) : (
          <EmptyPanel>此分類目前沒有品項。</EmptyPanel>
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
                <EmptyPanel>{`此飲品不提供${getGroupTitle(group.optionType)}選項。`}</EmptyPanel>
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
            <QuantityStepper
              decreaseLabel="減少一杯"
              increaseLabel="增加一杯"
              onDecrease={() => setQuantity((value) => Math.max(1, value - 1))}
              onIncrease={() => setQuantity((value) => value + 1)}
              value={quantity}
            />
          </Section>

          <Section title="小計">
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.subtotal}>{formatCurrency(subtotal)}</Text>
          </Section>

          <View style={styles.actionBlock}>
            <PrimaryButton
              label={editOrderItem ? "儲存修改" : editOrderId ? "加入訂單並重新預授權" : "加入購物車"}
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
                  // route.params must stay JSON-serializable, so the caller (CustomerOrdersScreen)
                  // passes editOrderId instead of a save callback; the merge-and-replace logic that
                  // used to live in that callback happens here instead, against the order's current
                  // items looked up fresh from appState.
                  const updatedItem = { ...editOrderItem, ...orderItem };
                  const nextItems = (editOrder?.items ?? []).map((current) => (
                    current.id === updatedItem.id ? updatedItem : current
                  ));
                  actions.updateOrderItems(editOrderId, nextItems);
                  setSubmitted(true);
                  navigation.goBack();
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
            {submitted ? <Notice message="已加入購物車。" tone="success" /> : null}
          </View>
        </>
      ) : (
        <EmptyPanel>請先選擇飲料，再設定甜度、冰塊與加料。</EmptyPanel>
      )}
      {cartQuantity > 0 ? <View style={styles.cartSpacer} /> : null}
      </MobileScreen>
      {cartQuantity > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.push("cart", { groupBuyActivityId: groupBuyActivity.id })}
          style={({ pressed }) => [styles.floatingCart, pressed && styles.pressed]}
        >
          <View style={styles.cartBadge}>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.cartBadgeText}>{cartQuantity}</Text>
          </View>
          <View style={styles.floatingCartTextGroup}>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.floatingCartTitle}>購物車</Text>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.floatingCartMeta}>{formatCurrency(cartTotal)}</Text>
          </View>
          <View style={styles.floatingCartArrow} />
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
  return <ChoiceChip label={label} onPress={onPress} selected={active} />;
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1
  },
  menuHeader: {
    gap: spacing.s12
  },
  menuHero: {
    gap: spacing.s4
  },
  shopName: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  groupBuyActivityName: {
    ...typeScale.bodyDense,
    color: colors.textSecondary
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s8
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12
  },
  // The card keeps its 2px outline box; picking a drink only recolours it.
  activeMenuItem: {
    borderColor: colors.accent
  },
  hiddenItem: {
    display: "none"
  },
  menuTextGroup: {
    flex: 1,
    gap: spacing.s4
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s8
  },
  menuItemName: {
    ...typeScale.button,
    flexShrink: 1,
    color: colors.text
  },
  hotTag: {
    paddingHorizontal: spacing.s8,
    borderRadius: radii.xs,
    backgroundColor: colors.recess
  },
  hotTagText: {
    ...typeScale.label,
    color: colors.accentInk
  },
  menuDescription: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  menuPrice: {
    ...typeScale.price,
    color: colors.text
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s8
  },
  subtotal: {
    ...typeScale.amount,
    color: colors.text
  },
  meta: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  actionBlock: {
    gap: spacing.s12
  },
  // Keeps the last content clear of the floating cart button (only rendered while that button shows).
  cartSpacer: {
    height: sizes.buttonHeight
  },
  pressed: {
    opacity: 0.8
  },
  // Floats over the content, so it keeps an Android elevation (docs/ui-style-guide.md, principle 3).
  floatingCart: {
    position: "absolute",
    right: spacing.s20,
    bottom: spacing.s16,
    minHeight: sizes.buttonHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    paddingVertical: spacing.s8,
    paddingLeft: spacing.s8,
    paddingRight: spacing.s20,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    elevation: 8
  },
  cartBadge: {
    minWidth: spacing.s32,
    minHeight: spacing.s32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s8,
    borderRadius: radii.pill,
    backgroundColor: colors.text
  },
  cartBadgeText: {
    ...typeScale.button,
    color: colors.onDark
  },
  floatingCartTextGroup: {
    flexShrink: 1
  },
  floatingCartTitle: {
    ...typeScale.button,
    color: colors.onAccent
  },
  floatingCartMeta: {
    ...typeScale.caption,
    color: colors.onAccent
  },
  // A right-pointing chevron drawn like the back arrow in MobileScreen (a 10px corner, rotated).
  floatingCartArrow: {
    width: 10,
    height: 10,
    borderColor: colors.onAccent,
    borderTopWidth: sizes.stroke,
    borderRightWidth: sizes.stroke,
    transform: [{ rotate: "45deg" }]
  }
});
