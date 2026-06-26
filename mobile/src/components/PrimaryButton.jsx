import { Pressable, StyleSheet, Text } from "react-native";

export function PrimaryButton({ label, onPress, variant = "primary", style }) {
  const secondary = variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        style,
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
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
  label: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryLabel: {
    color: "#0f172a"
  }
});
