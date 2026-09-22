import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./PrimaryButton";

export function ActivitySyncNotice({ status, onRetry }) {
  if (status === "loading") {
    return (
      <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
        正在更新團購活動…
      </Text>
    );
  }

  if (status !== "error") return null;

  return (
    <View style={styles.errorCard}>
      <Text accessibilityRole="alert" style={styles.errorText}>
        活動同步失敗，目前顯示上次成功載入的資料。
      </Text>
      <PrimaryButton label="重新整理活動" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 2
  },
  errorCard: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff7f7",
    padding: 12
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  }
});
