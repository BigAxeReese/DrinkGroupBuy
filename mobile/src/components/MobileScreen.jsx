import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { colors, maxFontSizeMultiplier, sizes, spacing, typeScale } from "../theme/tokens";

// Migrated routes get the new style (docs/ui-style-guide.md, see theme/MilkTeaContext.js).
// Everything below the early return is the old look, untouched, until the last screen has migrated.
export function MobileScreen({ title, subtitle, children, onBack, backLabel = "返回", compactHeader = false, headerRight = null }) {
  const milkTea = useMilkTea();
  if (milkTea) {
    return (
      <MilkTeaScreen title={title} subtitle={subtitle} onBack={onBack} backLabel={backLabel} headerRight={headerRight}>
        {children}
      </MilkTeaScreen>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.header, compactHeader && styles.compactHeader]}>
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text style={styles.backText}>← {backLabel}</Text>
            </Pressable>
          ) : <View style={styles.topSpacer} />}
          {headerRight}
        </View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Section({ title, children }) {
  const milkTea = useMilkTea();
  if (milkTea) {
    return (
      <View style={milkTeaStyles.section}>
        <Text accessibilityRole="header" style={milkTeaStyles.sectionTitle}>
          {title}
        </Text>
        {children}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MilkTeaScreen({ title, subtitle, children, onBack, backLabel, headerRight }) {
  const hasHeader = Boolean(onBack || title || subtitle || headerRight);

  return (
    <ScrollView style={milkTeaStyles.screen} contentContainerStyle={milkTeaStyles.content}>
      {hasHeader ? (
        <View style={milkTeaStyles.header}>
          <View style={milkTeaStyles.titleRow}>
            {onBack ? (
              <Pressable
                accessibilityLabel={backLabel}
                accessibilityRole="button"
                onPress={onBack}
                style={({ pressed }) => [milkTeaStyles.back, pressed && milkTeaStyles.pressed]}
              >
                <View style={milkTeaStyles.arrow} />
              </Pressable>
            ) : null}
            <View style={milkTeaStyles.titleWrap}>
              {title ? (
                <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier} style={milkTeaStyles.title}>
                  {title}
                </Text>
              ) : null}
            </View>
            {headerRight ? <View style={milkTeaStyles.headerRight}>{headerRight}</View> : null}
          </View>
          {subtitle ? <Text style={milkTeaStyles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 11,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 22
  },
  header: {
    gap: 6,
    zIndex: 2
  },
  compactHeader: {
    marginBottom: -10
  },
  topRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  topSpacer: {
    minHeight: 38,
    minWidth: 66
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    minWidth: 66,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12
  },
  backButtonPressed: {
    opacity: 0.75
  },
  backText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19
  },
  section: {
    gap: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800"
  }
});

const milkTeaStyles = StyleSheet.create({
  screen: {
    backgroundColor: colors.page
  },
  content: {
    gap: spacing.s24,
    paddingHorizontal: spacing.s20,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s20
  },
  header: {
    gap: spacing.s4
  },
  titleRow: {
    minHeight: sizes.tap,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s8
  },
  back: {
    width: sizes.tap,
    height: sizes.tap,
    marginLeft: -spacing.s12,
    alignItems: "center",
    justifyContent: "center"
  },
  arrow: {
    width: 10,
    height: 10,
    borderColor: colors.text,
    borderTopWidth: sizes.stroke,
    borderRightWidth: sizes.stroke,
    transform: [{ rotate: "-135deg" }]
  },
  pressed: {
    opacity: 0.75
  },
  titleWrap: {
    flex: 1
  },
  // Pills and other small controls size themselves with alignSelf: flex-start; without this wrapper
  // they would sit at the top of the row instead of level with the title.
  headerRight: {
    alignSelf: "center"
  },
  title: {
    ...typeScale.screenTitle,
    color: colors.text
  },
  subtitle: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  section: {
    gap: spacing.s12
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    color: colors.text
  }
});
