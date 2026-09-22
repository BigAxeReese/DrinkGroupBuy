import { StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { colors, typeScale } from "../theme/tokens";
import { Notice } from "./Notice";
import { PrimaryButton } from "./PrimaryButton";

// Migrated routes get the new look (see theme/MilkTeaContext.js): a quiet caption while loading and the
// danger-tone notice on failure. The old grey / red card stays for the merchant dashboard.
export function ActivitySyncNotice({ status, onRetry }) {
  const milkTea = useMilkTea();

  if (status === "loading") {
    return (
      <Text accessibilityLiveRegion="polite" style={milkTea ? milkTeaStyles.loadingText : styles.loadingText}>
        正在更新團購活動…
      </Text>
    );
  }

  if (status !== "error") return null;

  if (milkTea) {
    return (
      <Notice accessibilityRole="alert" message="活動同步失敗，目前顯示上次成功載入的資料。" tone="danger">
        <PrimaryButton label="重新整理活動" variant="secondary" onPress={onRetry} style={milkTeaStyles.retry} />
      </Notice>
    );
  }

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

const milkTeaStyles = StyleSheet.create({
  loadingText: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  retry: {
    alignSelf: "flex-start"
  }
});
