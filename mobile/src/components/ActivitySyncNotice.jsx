import { StyleSheet, Text } from "react-native";
import { typeScale } from "../theme/tokens";
import { Notice } from "./Notice";
import { PrimaryButton } from "./PrimaryButton";
import { useThemedStyles } from "../theme/ThemeContext";

// A quiet caption while the activities load and the danger-tone notice when the sync failed.
export function ActivitySyncNotice({ status, onRetry }) {
  const styles = useThemedStyles(makeStyles);

  if (status === "loading") {
    return (
      <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
        正在更新團購活動…
      </Text>
    );
  }

  if (status !== "error") return null;

  return (
    <Notice accessibilityRole="alert" message="活動同步失敗，目前顯示上次成功載入的資料。" tone="danger">
      <PrimaryButton label="重新整理活動" variant="secondary" onPress={onRetry} style={styles.retry} />
    </Notice>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  loadingText: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  retry: {
    alignSelf: "flex-start"
  }
});
