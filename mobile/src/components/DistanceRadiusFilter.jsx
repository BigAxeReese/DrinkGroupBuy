import { Pressable, StyleSheet, Text, View } from "react-native";

const DEFAULT_OPTIONS = [
  { label: "1 公里", value: 1 },
  { label: "3 公里", value: 3 },
  { label: "5 公里", value: 5 },
  { label: "不限", value: null }
];

export function DistanceRadiusFilter({ value = null, onChange, options = DEFAULT_OPTIONS }) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.pill, isActive && styles.activePill]}
          >
            <Text style={[styles.text, isActive && styles.activeText]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4
  },
  pill: {
    minHeight: 42,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: "#eef2f7",
    paddingHorizontal: 15
  },
  activePill: {
    backgroundColor: "#111827"
  },
  text: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900"
  },
  activeText: {
    color: "#ffffff"
  }
});
