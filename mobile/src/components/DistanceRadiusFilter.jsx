import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RADIUS_OPTIONS } from "../utils/groupBuyActivityMapFilters";

export function DistanceRadiusFilter({ value = null, onChange, options = RADIUS_OPTIONS }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setIsOpen((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerLabel}>距離：{selectedOption.label}</Text>
        <Text style={styles.triggerIcon}>{isOpen ? "▲" : "▼"}</Text>
      </Pressable>
      {isOpen ? (
        <View style={styles.optionList}>
          {options.map((option, index) => {
            const isActive = option.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.label}
                onPress={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  index < options.length - 1 && styles.optionDivider,
                  isActive && styles.activeOption,
                  pressed && styles.pressed
                ]}
              >
                <Text style={[styles.optionText, isActive && styles.activeOptionText]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    alignSelf: "flex-start",
    minWidth: 140
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#eef2f7",
    paddingHorizontal: 14
  },
  pressed: {
    opacity: 0.75
  },
  triggerLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  triggerIcon: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900"
  },
  optionList: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  option: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  optionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7"
  },
  activeOption: {
    backgroundColor: "#111827"
  },
  optionText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900"
  },
  activeOptionText: {
    color: "#ffffff"
  }
});
