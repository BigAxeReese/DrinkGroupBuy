import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "../components/Card";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { ThemeToggleButton } from "../components/ThemeToggleButton";
import { useAppState } from "../state/AppStateContext";
import { maxFontSizeMultiplier, radii, sizes, spacing, typeScale } from "../theme/tokens";
import { useThemedStyles } from "../theme/ThemeContext";
import { getCustomerSavings } from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";
import { normalizeCustomerSavings } from "../utils/customerSavings";

// useFocusEffect (not useEffect): tabs stay mounted, so a plain effect would show the total from
// the first visit forever, even after a group buy is settled and more money was saved.
function useCustomerSavings(enabled) {
  const [state, setState] = useState({ status: "loading", savings: null });
  const [reloadCount, setReloadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    let active = true;
    // Refreshing keeps the last shown total on screen; only a first load or a retry shows "loading".
    // A failed load replaces it with the error notice instead of leaving a possibly stale figure.
    setState((current) => (current.savings ? current : { status: "loading", savings: null }));
    getCustomerSavings()
      .then((payload) => {
        if (!active) return;
        const savings = normalizeCustomerSavings(payload);
        setState(savings ? { status: "ready", savings } : { status: "error", savings: null });
      })
      .catch(() => {
        if (active) setState({ status: "error", savings: null });
      });
    return () => {
      active = false;
    };
  }, [enabled, reloadCount]));

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);
  return { ...state, retry };
}

export function ProfileScreen({ navigation, currentUserProfile, memberAction }) {
  const styles = useThemedStyles(makeStyles);
  const { logout } = useAppState();
  const savings = useCustomerSavings(Boolean(currentUserProfile));

  if (!currentUserProfile) {
    return (
      <MobileScreen title="個人中心" headerRight={<ThemeToggleButton />}>
        <Section title="會員資料">
          <EmptyPanel>找不到目前登入的會員資料，請重新登入。</EmptyPanel>
          {/* Same "back to role select, keep session state" shortcut as the header member icon. */}
          <PrimaryButton label="重新登入" onPress={memberAction} />
        </Section>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen title="個人中心" headerRight={<ThemeToggleButton />}>
      <Section title="會員資料">
        <Card style={styles.memberCard}>
          <View style={styles.avatar}>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.avatarText}>{(currentUserProfile.displayName || "會").slice(0, 1)}</Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{currentUserProfile.displayName || "會員"}</Text>
          </View>
        </Card>
      </Section>

      <Section title="省錢統計">
        <SavingsSummary status={savings.status} savings={savings.savings} onRetry={savings.retry} />
      </Section>

      <Section title="付款與取貨紀錄">
        <Text style={styles.description}>查看訂單狀態、付款結果與取貨憑證。</Text>
        {/* Switches to the Orders tab (react-navigation bubbles a name it can't find in this
            screen's own stack up to the parent tab navigator) instead of pushing a second copy
            of customerOrders inside this tab's own stack. */}
        <PrimaryButton label="查看我的訂單" onPress={() => navigation.navigate("OrdersTab")} />
      </Section>

      <Section title="帳號">
        <PrimaryButton label="登出" variant="secondary" onPress={logout} />
      </Section>
    </MobileScreen>
  );
}

function SavingsSummary({ status, savings, onRetry }) {
  const styles = useThemedStyles(makeStyles);

  if (status === "loading") return <EmptyPanel>正在計算你省下的金額…</EmptyPanel>;

  if (status === "error") {
    return (
      <Notice accessibilityRole="alert" tone="danger" message="暫時無法載入省錢統計，請稍後再試。">
        <PrimaryButton label="重新載入" variant="secondary" onPress={onRetry} />
      </Notice>
    );
  }

  if (savings.savedOrderCount === 0) {
    return (
      <EmptyPanel title="還沒有省錢紀錄">
        參加的團購成團並完成請款後，折扣省下的金額會累計在這裡。
      </EmptyPanel>
    );
  }

  return (
    <Card style={styles.savingsCard}>
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.savingsLabel}>累計省下</Text>
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.savingsAmount}>
        {formatCurrency(savings.totalSavedAmount)}
      </Text>
      <Text style={styles.savingsDetail}>
        共 {savings.savedOrderCount} 筆訂單、{savings.savedCupCount} 杯享有團購折扣
      </Text>
      <Text style={styles.savingsNote}>
        只計算已成團並完成請款的訂單；已全額退款、逾期未取或團購被取消的不列入。
      </Text>
    </Card>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  savingsCard: {
    gap: spacing.s4
  },
  savingsLabel: {
    ...typeScale.label,
    color: colors.textSecondary
  },
  savingsAmount: {
    ...typeScale.amount,
    color: colors.text
  },
  savingsDetail: {
    ...typeScale.body,
    color: colors.text
  },
  savingsNote: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  description: {
    ...typeScale.body,
    color: colors.textSecondary
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12
  },
  avatar: {
    width: sizes.tap,
    height: sizes.tap,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.recess
  },
  avatarText: {
    ...typeScale.sectionTitle,
    color: colors.text
  },
  memberInfo: {
    flex: 1,
    gap: spacing.s4
  },
  memberName: {
    ...typeScale.sectionTitle,
    color: colors.text
  }
});
