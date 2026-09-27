import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typeScale } from "../theme/tokens";
import { useThemedStyles } from "../theme/ThemeContext";

// A quiet milk-tea panel for "nothing here yet", loading and hint messages. `children` is the
// message: a string, or your own elements.
export function EmptyPanel({ title, children }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.panel}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={styles.text}>{children}</Text> : children}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
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
