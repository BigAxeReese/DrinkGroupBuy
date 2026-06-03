import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function MobileScreen({ title, subtitle, children, onBack, backLabel = "返回", onMemberPress, compactHeader = false }) {
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
          {onMemberPress ? (
            <Pressable
              accessibilityRole="button"
              onPress={onMemberPress}
              style={({ pressed }) => [styles.memberButton, pressed && styles.backButtonPressed]}
            >
              <Text style={styles.memberText}>會員</Text>
            </Pressable>
          ) : null}
        </View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
    gap: 6
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
  memberButton: {
    minHeight: 38,
    minWidth: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f6feb",
    paddingHorizontal: 12
  },
  memberText: {
    color: "#ffffff",
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
