import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";
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
    gap: spacing.s8,
    alignSelf: "flex-start",
    minWidth: 140
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
    minHeight: sizes.tap,
    borderRadius: radii.pill,
    backgroundColor: colors.recess,
    paddingHorizontal: spacing.s16
  },
  pressed: {
    opacity: 0.75
  },
  triggerLabel: {
    ...typeScale.label,
    color: colors.text
  },
  triggerIcon: {
    ...typeScale.label,
    color: colors.textSecondary
  },
  optionList: {
    overflow: "hidden",
    borderRadius: radii.md,
    borderWidth: sizes.stroke,
    borderColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  option: {
    minHeight: sizes.tap,
    justifyContent: "center",
    paddingHorizontal: spacing.s16
  },
  optionDivider: {
    borderBottomWidth: sizes.stroke,
    borderBottomColor: colors.lineDecor
  },
  // "Currently selected" is drawn as a white item with a 2px accent outline (docs/ui-style-guide.md);
  // the divider's own bottom colour has to be overridden or it would win over borderColor.
  // The radius equals the list's inner clip radius (its own radius minus its border) so the outline's
  // corners are not shaved when the first or last row is selected, and the outline's 2px comes off the
  // padding so the label lines up with the other rows.
  activeOption: {
    backgroundColor: colors.page,
    borderWidth: sizes.stroke,
    borderColor: colors.accent,
    borderBottomColor: colors.accent,
    borderRadius: radii.md - sizes.stroke,
    paddingHorizontal: spacing.s16 - sizes.stroke
  },
  optionText: {
    ...typeScale.bodyDense,
    color: colors.text
  },
  activeOptionText: {
    color: colors.accentInk,
    fontWeight: typeScale.label.fontWeight
  }
});
