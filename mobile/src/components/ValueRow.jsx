import { StyleSheet, Text, View } from "react-native";
import { colors, radii, sizes, spacing, typeScale } from "../theme/tokens";

// One "label ........ value" line on a milk-tea fill (amounts, dates, counts). A long label wraps
// instead of pushing the value out. `emphasis` is the line that matters most (the total to pay).
export function ValueRow({ label, value, emphasis = false }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, emphasis && styles.emphasisLabel]}>{label}</Text>
      <Text style={[styles.value, emphasis && styles.emphasisValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
    paddingVertical: spacing.s8,
    paddingHorizontal: spacing.s16,
    borderRadius: radii.sm,
    backgroundColor: colors.recess
  },
  label: {
    ...typeScale.body,
    flex: 1,
    color: colors.textSecondary
  },
  emphasisLabel: {
    color: colors.text,
    fontWeight: typeScale.label.fontWeight
  },
  value: {
    ...typeScale.body,
    fontWeight: typeScale.label.fontWeight,
    textAlign: "right",
    color: colors.text
  },
  emphasisValue: {
    ...typeScale.price
  }
});
