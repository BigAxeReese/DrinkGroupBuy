import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typeScale } from "../theme/tokens";

// A quiet milk-tea panel for "nothing here yet", loading and hint messages. `children` is the
// message: a string, or your own elements.
export function EmptyPanel({ title, children }) {
  return (
    <View style={styles.panel}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={styles.text}>{children}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.s4,
    padding: spacing.s16,
    borderRadius: radii.md,
    backgroundColor: colors.recess
  },
  title: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  text: {
    ...typeScale.body,
    color: colors.textSecondary
  }
});
