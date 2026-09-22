import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";

// A pill you pick from a group (drink size, category, tab, filter). Selected = white with a 2px
// brown-sugar outline and bold text (docs/ui-style-guide.md), unselected = the milk-tea fill, so the
// choice never depends on colour alone. `role` is the accessibility role: "radio" for pick-one
// groups, "checkbox" for pick-many, "tab" for tab bars, "button" otherwise.
export function ChoiceChip({ label, selected = false, onPress, disabled = false, role = "button", accessibilityLabel, style }) {
  const isChecked = role === "radio" || role === "checkbox";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={role}
      accessibilityState={{ disabled, ...(isChecked ? { checked: selected } : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

// Selected and unselected share the same 2px border box, so picking one never shifts the layout.
const styles = StyleSheet.create({
  chip: {
    minHeight: sizes.tap,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s16,
    borderRadius: radii.pill,
    borderWidth: sizes.stroke,
    borderColor: colors.recess,
    backgroundColor: colors.recess
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: colors.page
  },
  disabled: {
    opacity: 0.5
  },
  pressed: {
    opacity: 0.8
  },
  label: {
    ...typeScale.bodyDense,
    color: colors.text
  },
  selectedLabel: {
    color: colors.accentInk,
    fontWeight: typeScale.label.fontWeight
  }
});
