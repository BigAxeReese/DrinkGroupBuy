import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typeScale } from "../theme/tokens";

export function PlaceholderBox({ title, description }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 96,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s8,
    backgroundColor: colors.recess,
    padding: spacing.s16
  },
  title: {
    ...typeScale.button,
    color: colors.textSecondary
  },
  description: {
    ...typeScale.bodyDense,
    color: colors.textSecondary,
    textAlign: "center"
  }
});
