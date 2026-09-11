import { Pressable, StyleSheet, Text } from "react-native";

export function PrimaryButton({ label, onPress, variant = "primary", style, disabled = false }) {
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
