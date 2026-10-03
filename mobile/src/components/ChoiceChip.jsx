import { Pressable, StyleSheet, Text } from "react-native";
import { radii, sizes, spacing, typeScale } from "../theme/tokens";
import { useThemedStyles } from "../theme/ThemeContext";

// A pill you pick from a group (drink size, category, tab, filter). Selected = page-coloured with a
// 2px accent outline (docs/ui-style-guide.md rule 2), unselected = the recess fill. Same text weight
// in both states -- see selectedLabel below for why bold is not used. `role` is the accessibility role: "radio" for pick-one
// groups, "checkbox" for pick-many, "tab" for tab bars, "button" otherwise.
export function ChoiceChip({ label, selected = false, onPress, disabled = false, role = "button", accessibilityLabel, style }) {
  const styles = useThemedStyles(makeStyles);
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
const makeStyles = (colors) => StyleSheet.create({
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
  // Color only, same weight as the unselected label -- bold text measures wider than regular at
  // the same size, so toggling weight on select made neighbouring chips in the same flex-wrap row
  // shift position every time one was picked (reported as "點擊客製化選項字會跑掉" on a real device).
  // The 2px outline (docs/ui-style-guide.md rule 2) is this app's one selected-state convention; it
  // doesn't need bold text alongside it to read as selected.
  selectedLabel: {
    color: colors.accentInk
  }
});
