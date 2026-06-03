import { Pressable, StyleSheet, Text, View } from "react-native";

const navItems = [
  { id: "home", route: "nearby", icon: "⌂", label: "首頁", roles: ["customer"] },
  { id: "liveMap", route: "customerPlaceholder", icon: "⌖", label: "即時地圖", params: { type: "liveMap" }, roles: ["customer"] },
  { id: "orders", route: "customerOrders", icon: "＄", label: "我的訂單", roles: ["customer"] },
  { id: "discussion", route: "customerPlaceholder", icon: "○", label: "討論區", params: { type: "discussion" }, roles: ["customer"] },
  { id: "profile", route: "customerPlaceholder", icon: "⌔", label: "個人中心", params: { type: "profile" }, roles: ["customer"] },
  { id: "merchantDashboard", route: "merchantDashboard", icon: "▣", label: "商家", roles: ["merchant"] }
];

export function BottomNav({ current, currentParams, currentRole, navigation }) {
  const visibleItems = navItems.filter((item) => !currentRole || item.roles.includes(currentRole));

  return (
    <View style={styles.nav}>
      {visibleItems.map((item) => {
        const active = current === item.route && (!item.params?.type || item.params.type === currentParams?.type);
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
    minHeight: 54,
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
