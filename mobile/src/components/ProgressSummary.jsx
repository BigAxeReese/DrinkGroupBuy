import { StyleSheet, Text, View } from "react-native";

export function ProgressSummary({ currentCups, targetCups, participantCount, remainingTimeText }) {
  const progress = Math.min(100, Math.round((currentCups / targetCups) * 100));

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.metric}>{currentCups}</Text>
        <Text style={styles.label}>/ {targetCups} 杯</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${progress}%` }]} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{participantCount} 人參與</Text>
        <Text style={styles.meta}>{remainingTimeText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 12,
    borderRadius: 15,
    backgroundColor: "#f8fafc"
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6
  },
  metric: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "900"
  },
  label: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4
  },
  track: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden"
  },
  bar: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#1f6feb"
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  }
});
