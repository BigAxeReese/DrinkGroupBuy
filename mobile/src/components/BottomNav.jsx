import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { colors, maxFontSizeMultiplier, sizes, spacing, typeScale } from "../theme/tokens";

const navItems = [
  { id: "home", route: "nearby", icon: "⌂", label: "首頁", roles: ["customer"] },
  { id: "liveMap", route: "liveMap", icon: "⌖", label: "即時地圖", roles: ["customer"] },
  { id: "orders", route: "customerOrders", icon: "＄", label: "我的訂單", roles: ["customer"] },
  { id: "profile", route: "profile", icon: "⌔", label: "個人中心", roles: ["customer"] },
  { id: "merchantDashboard", route: "merchantDashboard", icon: "⌂", label: "首頁", roles: ["merchant"] },
  { id: "merchantCreate", route: "merchantCreate", icon: "＋", label: "開團", roles: ["merchant"] }
];

// Migrated routes get the new style (a dot and a label, docs/ui-style-guide.md, see
// theme/MilkTeaContext.js). The old glyph bar below stays until the last route has migrated.
export function BottomNav({ current, currentParams, currentRole, navigation }) {
  const milkTea = useMilkTea();
  const visibleItems = navItems.filter((item) => !currentRole || item.roles.includes(currentRole));
  const isActive = (item) => current === item.route && (!item.params?.type || item.params.type === currentParams?.type);

  if (milkTea) {
    return (
      <View style={milkTeaStyles.nav}>
        {visibleItems.map((item) => {
          const active = isActive(item);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.id}
              onPress={() => navigation.replace(item.route, item.params)}
              style={milkTeaStyles.item}
            >
              <View style={[milkTeaStyles.dot, active && milkTeaStyles.dotActive]} />
              <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[milkTeaStyles.label, active && milkTeaStyles.labelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.nav}>
      {visibleItems.map((item) => {
        const active = isActive(item);
        return (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => navigation.replace(item.route, item.params)}
            style={styles.item}
          >
            <Text style={[styles.icon, active && styles.activeIcon]}>{item.icon}</Text>
            <Text style={[styles.label, active && styles.activeLabel]}>{item.label}</Text>
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
