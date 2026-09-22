import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";

const BOX = 24;

// A tappable row with a checkbox drawn from views. The whole row is the 44px target. `children` is
// the label: a string, or your own elements when the label needs more than one style.
export function CheckRow({ checked, onToggle, disabled = false, children }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <View style={styles.tick} /> : null}</View>
      <View style={styles.content}>{typeof children === "string" ? <Text style={styles.text}>{children}</Text> : children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.s12,
    paddingVertical: spacing.s8
  },
  disabled: {
    opacity: 0.5
  },
  pressed: {
    opacity: 0.8
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radii.xs,
    borderWidth: sizes.stroke,
    borderColor: colors.lineInput,
    backgroundColor: colors.page
  },
  boxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent
  },
  // The check mark: an L rotated 45 degrees, centred (slightly high, like the status marks) in the box.
  tick: {
    position: "absolute",
    left: 7,
    top: 3,
    width: 6,
    height: 11,
    borderRightWidth: sizes.stroke,
    borderBottomWidth: sizes.stroke,
    borderColor: colors.onAccent,
    transform: [{ rotate: "45deg" }]
  },
  content: {
    flex: 1
  },
  text: {
    ...typeScale.body,
    color: colors.text
  }
});
