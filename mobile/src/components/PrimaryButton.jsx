import { Pressable, StyleSheet, Text } from "react-native";
import { sizes, spacing, typeScale } from "../theme/tokens";
import { useThemedStyles } from "../theme/ThemeContext";

// A solid accent button, or a page-coloured one with a 2px outline for the secondary action
// (docs/ui-style-guide.md).
export function PrimaryButton({ label, onPress, variant = "primary", style, disabled = false }) {
  const styles = useThemedStyles(makeStyles);
  const secondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        disabled && (secondary ? styles.secondaryDisabled : styles.disabled),
        style,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel, disabled && styles.disabledLabel]}>{label}</Text>
    </Pressable>
  );
}

// Primary and secondary share the same 2px border so both are exactly the same size.
const makeStyles = (colors) => StyleSheet.create({
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
