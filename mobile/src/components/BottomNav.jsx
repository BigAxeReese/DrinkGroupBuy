import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { colors, maxFontSizeMultiplier, sizes, spacing, typeScale } from "../theme/tokens";

// Label + glyph for every tab a bottom-tab navigator can show (keyed by the TAB's own route name, e.g.
// "HomeTab" -- not the screen name inside its nested stack, e.g. "nearby", which stays distinct on
// purpose so react-navigation never has to guess whether a `navigate("nearby")` call means "switch
// tab" or "push this screen in whichever stack is currently active"). CustomerTabs and MerchantTabs
// each register only their own tabs, so `state.routes` below never mixes customer and merchant items --
// no role filtering needed here any more.
const TAB_INFO = {
  HomeTab: { icon: "⌂", label: "首頁" },
  LiveMapTab: { icon: "⌖", label: "即時地圖" },
  OrdersTab: { icon: "＄", label: "我的訂單" },
  ProfileTab: { icon: "⌔", label: "個人中心" },
  MerchantDashboardTab: { icon: "⌂", label: "首頁" },
  MerchantCreateTab: { icon: "＋", label: "開團" }
};

// react-navigation's own tabBar prop shape ({ state, descriptors, navigation }); passed as
// tabBar={(props) => <BottomNav {...props} />} to CustomerTabs' / MerchantTabs' Tab.Navigator.
// Migrated routes get the new style (a dot and a label, docs/ui-style-guide.md, see
// theme/MilkTeaContext.js). The old glyph bar below stays until the last route has migrated.
export function BottomNav({ state, navigation }) {
  const milkTea = useMilkTea();

  // Emitting tabPress lets the tab's own native-stack pop back to its root when the already-active tab
  // is tapped again (native-stack listens for it); tapping a different tab just switches to it and
  // keeps that tab's history.
  const handleTabPress = (route, active) => {
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!active && !event.defaultPrevented) navigation.navigate(route.name);
  };

  if (milkTea) {
    return (
      <View style={milkTeaStyles.nav}>
        {state.routes.map((route, index) => {
          const info = TAB_INFO[route.name];
          const active = state.index === index;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={route.key}
              onPress={() => handleTabPress(route, active)}
              style={milkTeaStyles.item}
            >
              <View style={[milkTeaStyles.dot, active && milkTeaStyles.dotActive]} />
              <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[milkTeaStyles.label, active && milkTeaStyles.labelActive]}>
                {info.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.nav}>
      {state.routes.map((route, index) => {
        const info = TAB_INFO[route.name];
        const active = state.index === index;
        return (
          <Pressable
            accessibilityRole="button"
            key={route.key}
            onPress={() => handleTabPress(route, active)}
            style={styles.item}
          >
            <Text style={[styles.icon, active && styles.activeIcon]}>{info.icon}</Text>
            <Text style={[styles.label, active && styles.activeLabel]}>{info.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff"
  },
  item: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  icon: {
    minWidth: 22,
    minHeight: 22,
    borderRadius: 5,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#9ca3af",
    fontSize: 17,
    fontWeight: "900"
  },
  activeIcon: {
    color: "#1f6feb",
    backgroundColor: "#dbeafe"
  },
  label: {
    color: "#8b95a1",
    fontSize: 10,
    fontWeight: "800"
  },
  activeLabel: {
    color: "#1f6feb"
  }
});

const milkTeaStyles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    minHeight: 64,
    borderTopWidth: sizes.stroke,
    borderTopColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  item: {
    flex: 1,
    minHeight: sizes.tap,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s4
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: sizes.stroke,
    borderColor: colors.textSecondary
  },
  dotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  label: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  labelActive: {
    color: colors.accentInk,
    fontWeight: typeScale.label.fontWeight
  }
});
