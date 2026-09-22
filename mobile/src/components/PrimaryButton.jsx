import { Pressable, StyleSheet, Text } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { colors, sizes, spacing, typeScale } from "../theme/tokens";

// Migrated routes get the new look (docs/ui-style-guide.md, see theme/MilkTeaContext.js): a solid
// brown-sugar button, or a white one with a 2px outline for the secondary action. Everything below
// the early return is the old look, untouched, because merchant screens still use it.
export function PrimaryButton({ label, onPress, variant = "primary", style, disabled = false }) {
  const milkTea = useMilkTea();
  const secondary = variant === "secondary";

  if (milkTea) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          milkTeaStyles.button,
          secondary && milkTeaStyles.secondary,
          disabled && (secondary ? milkTeaStyles.secondaryDisabled : milkTeaStyles.disabled),
          style,
          pressed && !disabled && milkTeaStyles.pressed
        ]}
      >
        <Text style={[milkTeaStyles.label, secondary && milkTeaStyles.secondaryLabel, disabled && milkTeaStyles.disabledLabel]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        disabled && styles.disabled,
        style,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel, disabled && styles.disabledLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb",
    paddingHorizontal: 14
  },
  secondary: {
    backgroundColor: "#e2e8f0"
  },
  pressed: {
    opacity: 0.78
  },
  disabled: {
    backgroundColor: "#cbd5e1",
    opacity: 0.72
  },
  label: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryLabel: {
    color: "#0f172a"
  },
  disabledLabel: {
    color: "#64748b"
  }
});

// Primary and secondary share the same 2px border so both are exactly the same size.
const milkTeaStyles = StyleSheet.create({
  button: {
    minHeight: sizes.buttonHeight,
    borderRadius: sizes.buttonRadius,
    borderWidth: sizes.stroke,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.s20
  },
  secondary: {
    backgroundColor: colors.page
  },
  disabled: {
    borderColor: colors.recess,
    backgroundColor: colors.recess
  },
  secondaryDisabled: {
    borderColor: colors.lineDecor
  },
  pressed: {
    opacity: 0.8
  },
  label: {
    ...typeScale.button,
    color: colors.onAccent,
    textAlign: "center"
  },
  secondaryLabel: {
    color: colors.accentInk
  },
  disabledLabel: {
    color: colors.textSecondary
  }
});
