import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, tones, typeScale } from "../theme/tokens";
import { StatusMark } from "./StatusMark";

const MARK_SIZE = 14;

// A tinted message box: the tone's colours from theme/tokens.js plus its drawn mark, so the meaning
// is never carried by colour alone. `title` and `message` are optional text; `children` are extra
// elements below them (a retry button, for example). Extra props (accessibilityRole="alert",
// accessibilityLiveRegion, ...) go to the root view.
export function Notice({ tone = "info", title, message, children, ...rest }) {
  const { bg, fg, mark } = tones[tone] ?? tones.info;

  return (
    <View style={[styles.box, { backgroundColor: bg }]} {...rest}>
      <View style={styles.markSlot}>
        <StatusMark mark={mark} color={fg} />
      </View>
      <View style={styles.content}>
        {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
        {message ? <Text style={[styles.message, { color: fg }]}>{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.s12,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radii.sm
  },
  // Centres the 14px mark on the first line of text.
  markSlot: {
    marginTop: (typeScale.bodyDense.lineHeight - MARK_SIZE) / 2
  },
  content: {
    flex: 1,
    gap: spacing.s8
  },
  title: {
    ...typeScale.bodyDense,
    fontWeight: typeScale.label.fontWeight
  },
  message: {
    ...typeScale.bodyDense
  }
});
