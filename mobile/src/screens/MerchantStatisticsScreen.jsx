import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, Text, View } from "react-native";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { maxFontSizeMultiplier, radii, spacing, typeScale } from "../theme/tokens";
import { useThemedStyles } from "../theme/ThemeContext";
import { getMerchantStoreStatistics } from "../utils/apiClient";
import { formatCurrency } from "../utils/calculations";
import { formatQualifiedRate, normalizeMerchantStatistics } from "../utils/merchantStatistics";

// useFocusEffect (not useEffect): the screen stays mounted in its stack, so a plain effect would
// keep showing the figures from the first visit even after more orders are paid.
function useMerchantStatistics(storeId) {
  const [state, setState] = useState({ status: "loading", statistics: null });
  const [reloadCount, setReloadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!storeId) return undefined;
    let active = true;
    // Refreshing keeps the last shown figures on screen; only a first load or a retry shows "loading".
    // A failed load replaces them with the error notice instead of leaving possibly stale numbers.
    setState((current) => (current.statistics ? current : { status: "loading", statistics: null }));
    getMerchantStoreStatistics(storeId)
      .then((payload) => {
        if (!active) return;
        const statistics = normalizeMerchantStatistics(payload);
        setState(statistics ? { status: "ready", statistics } : { status: "error", statistics: null });
      })
      .catch(() => {
        if (active) setState({ status: "error", statistics: null });
      });
    return () => {
      active = false;
    };
  }, [storeId, reloadCount]));

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);
  return { ...state, retry };
}

export function MerchantStatisticsScreen({ navigation, selectedMerchantStoreId }) {
  const { status, statistics, retry } = useMerchantStatistics(selectedMerchantStoreId);

  return (
    <MobileScreen title="營運統計" onBack={() => navigation.goBack()} backLabel="返回">
      {!selectedMerchantStoreId ? (
        <EmptyPanel>找不到目前的店家資料，請重新登入。</EmptyPanel>
      ) : (
        <StatisticsBody status={status} statistics={statistics} onRetry={retry} />
      )}
    </MobileScreen>
  );
}

function StatisticsBody({ status, statistics, onRetry }) {
  const styles = useThemedStyles(makeStyles);

  if (status === "loading") return <EmptyPanel>正在統計店家數據…</EmptyPanel>;

  if (status === "error") {
    return (
      <Notice accessibilityRole="alert" tone="danger" message="暫時無法載入營運統計，請稍後再試。">
        <PrimaryButton label="重新載入" variant="secondary" onPress={onRetry} />
      </Notice>
    );
  }

  if (statistics.orderCount === 0 && statistics.settledActivityCount === 0) {
    return (
      <EmptyPanel title="還沒有營運數據">
        有團購成團並完成請款後，統計會顯示在這裡。
      </EmptyPanel>
    );
  }

  return (
    <>
      <Section title="營收與訂單">
        <View style={styles.grid}>
          <StatCard label="累計實收" value={formatCurrency(statistics.totalRevenue)} />
          <StatCard label="成交訂單" value={`${statistics.orderCount} 筆`} />
          <StatCard label="折扣讓利" value={formatCurrency(statistics.discountGivenTotal)} />
          <StatCard
            label="成團率"
            value={formatQualifiedRate(statistics.qualifiedRate)}
            hint={statistics.settledActivityCount > 0
              ? `${statistics.qualifiedActivityCount} / ${statistics.settledActivityCount} 場達到優惠門檻`
              : null}
          />
        </View>
      </Section>

      <Section title="熱賣飲品 前三名">
        {statistics.topDrinks.length === 0 ? (
          <EmptyPanel>還沒有已成交的飲品。</EmptyPanel>
        ) : (
          <View style={styles.drinkList}>
            {statistics.topDrinks.map((drink, index) => (
              <View key={drink.name} style={styles.drinkRow}>
                <Text style={styles.drinkRank}>{index + 1}</Text>
                <Text style={styles.drinkName} numberOfLines={2}>{drink.name}</Text>
                <Text style={styles.drinkCups}>{drink.cups} 杯</Text>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Text style={styles.note}>
        只計算已請款、未取消的訂單：全額退款的不列入，部分退款會從累計實收扣掉；逾期未取的仍計入（顧客已付款且不退）。
        「折扣讓利」是這些訂單的原價減實收。成團率＝達到優惠門檻的團購 ÷ 已結算的團購，進行中與店家取消的不列入。
      </Text>
    </>
  );
}

function StatCard({ label, value, hint }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.cardLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.cardValue}>{value}</Text>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s12
  },
  card: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: spacing.s4,
    padding: spacing.s16,
    borderRadius: radii.md,
    backgroundColor: colors.recess
  },
  cardLabel: {
    ...typeScale.label,
    color: colors.textSecondary
  },
  cardValue: {
    ...typeScale.amount,
    color: colors.text
  },
  cardHint: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  drinkList: {
    gap: spacing.s8
  },
  drinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    padding: spacing.s12,
    borderRadius: radii.md,
    backgroundColor: colors.recess
  },
  drinkRank: {
    ...typeScale.sectionTitle,
    minWidth: 20,
    color: colors.text
  },
  drinkName: {
    ...typeScale.body,
    flex: 1,
    color: colors.text
  },
  drinkCups: {
    ...typeScale.price,
    color: colors.text
  },
  note: {
    ...typeScale.caption,
    color: colors.textSecondary
  }
});
