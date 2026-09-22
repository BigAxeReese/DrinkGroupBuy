import { StyleSheet, View } from "react-native";
import { colors, radii, sizes, spacing } from "../theme/tokens";
import { getFilledPearls } from "../utils/pearlProgress";

const PEARL_COUNT = 5;

// Mini pearl progress for cards. Each pearl stands for a fifth of the way to `target` cups; the
// exact cup count is always written next to it, so the pearls are only the picture and are hidden
// from screen readers (which read that text instead of announcing the same progress twice).
// `capsule` puts the pearls on a tan pill (used on the home card); without it they stand alone.
export function PearlStrip({ current, target, capsule = false }) {
  const filled = getFilledPearls(current, target, PEARL_COUNT);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.strip, capsule && styles.capsule]}
    >
      {Array.from({ length: PEARL_COUNT }, (_, index) => (
        <View key={index} style={[styles.pearl, index < filled && styles.filled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s4
  },
  capsule: {
    alignSelf: "flex-start",
    minHeight: 28,
    paddingHorizontal: spacing.s12,
    borderRadius: radii.pill,
    backgroundColor: colors.recess
  },
  pearl: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: sizes.stroke,
    borderColor: colors.accent
  },
  filled: {
    backgroundColor: colors.text,
    borderColor: colors.text
  }
});
