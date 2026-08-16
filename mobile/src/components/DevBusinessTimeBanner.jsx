import { StyleSheet, Text, View } from "react-native";

export function DevBusinessTimeBanner({ businessTime }) {
  const snapshot = businessTime?.snapshot;
  if (!businessTime?.enabled || !snapshot?.simulated) return null;

  const modeLabel = snapshot.mode === "fixed"
    ? "固定時間"
    : `${snapshot.offsetMinutes >= 0 ? "+" : ""}${snapshot.offsetMinutes} 分鐘`;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>DEV 模擬業務時間 · {modeLabel}</Text>
      <Text style={styles.time}>{formatDateTime(snapshot.effectiveNow)}</Text>
      <Text style={styles.hint}>訂單截止與取餐時限依此時間判斷</Text>
    </View>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間讀取失敗";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#2b2100",
    borderBottomColor: "#f5c451",
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  title: {
    color: "#ffe29a",
    fontSize: 12,
    fontWeight: "800",
  },
  time: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  hint: {
    color: "#d8cda8",
    fontSize: 10,
    marginTop: 1,
  },
});
