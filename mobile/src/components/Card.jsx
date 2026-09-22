import { Pressable, StyleSheet, View } from "react-native";
import { colors, radii, sizes, spacing } from "../theme/tokens";

// The customer card: white with a 2px decorative outline (docs/ui-style-guide.md). `compact` is the
// smaller list-row size; `tone="recess"` is a filled panel with no visible outline. Pass `onPress` to
// make the whole card one button. Extra props (accessibilityLabel, testID, ...) go to the root view.
export function Card({ children, onPress, compact = false, tone = "plain", style, ...rest }) {
  const cardStyle = [styles.card, compact && styles.compact, tone === "recess" && styles.recess, style];

  if (!onPress) {
    return (
      <View style={cardStyle} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s8,
    padding: spacing.s20,
    borderRadius: radii.lg,
    borderWidth: sizes.stroke,
    borderColor: colors.lineDecor,
    backgroundColor: colors.page
  },
  compact: {
    gap: spacing.s4,
    padding: spacing.s16,
    borderRadius: radii.md,
    minHeight: 56
  },
  // Same border box as the plain card so both line up when stacked.
  recess: {
    borderColor: colors.recess,
    backgroundColor: colors.recess
  },
  pressed: {
    opacity: 0.8
  }
});
