import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";

const GLYPH = 14;
const GLYPH_OFFSET = (GLYPH - sizes.stroke) / 2;

// Minus / count / plus. The buttons are drawn with views (not text symbols) and each is a 44px
// target; `decreaseLabel` / `increaseLabel` are what a screen reader says for them.
export function QuantityStepper({
  value,
  onDecrease,
  onIncrease,
  decreaseLabel = "減少",
  increaseLabel = "增加",
  decreaseDisabled = false,
  increaseDisabled = false
}) {
  return (
    <View style={styles.row}>
      <StepButton kind="minus" label={decreaseLabel} onPress={onDecrease} disabled={decreaseDisabled} />
      <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.value}>
        {value}
      </Text>
      <StepButton kind="plus" label={increaseLabel} onPress={onIncrease} disabled={increaseDisabled} />
    </View>
  );
}

function StepButton({ kind, label, onPress, disabled }) {
  const color = disabled ? colors.lineInput : colors.accent;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.glyph}>
        <View style={[styles.horizontalBar, { backgroundColor: color }]} />
        {kind === "plus" ? <View style={[styles.verticalBar, { backgroundColor: color }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s8
  },
  value: {
    ...typeScale.price,
    minWidth: 32,
    textAlign: "center",
    color: colors.text
  },
  button: {
    width: sizes.tap,
    height: sizes.tap,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: sizes.stroke,
    borderColor: colors.accent,
    backgroundColor: colors.page
  },
  buttonDisabled: {
    borderColor: colors.lineDecor
  },
  pressed: {
    opacity: 0.8
  },
  glyph: {
    width: GLYPH,
    height: GLYPH
  },
  horizontalBar: {
    position: "absolute",
    left: 0,
    top: GLYPH_OFFSET,
    width: GLYPH,
    height: sizes.stroke
  },
  verticalBar: {
    position: "absolute",
    left: GLYPH_OFFSET,
    top: 0,
    width: sizes.stroke,
    height: GLYPH
  }
});
