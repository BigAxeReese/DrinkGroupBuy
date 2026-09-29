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

export function MerchantStatisticsScreen({ selectedMerchantStoreId }) {
  const { status, statistics, retry } = useMerchantStatistics(selectedMerchantStoreId);

  return (
    <MobileScreen title="分析">
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

      <WeeklyTrendSection
        weeklyTrend={statistics.weeklyTrend}
        weeklyTrendUnavailable={statistics.weeklyTrendUnavailable}
      />

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

const CHART_BAR_HEIGHT = 100;
// The window is long enough now (near 3 months, ~13 bars) that a "MM/DD" label under every single
// bar collides with its neighbours on a real phone's width. Thinning to roughly this many evenly
// spaced labels keeps the x-axis readable without hiding any bar itself -- every week still gets a
// bar and its own value number, just not every week gets a date underneath it.
const MAX_VISIBLE_WEEK_LABELS = 7;

// A plain-View bar chart (no SVG/chart library in this project -- adding one would need a new
// native module and a fresh APK build, see docs/azure-classroom-deployment.md's update rules).
// Bar height is `value / maxValue` of CHART_BAR_HEIGHT, same ratio math the admin web trend charts
// use (backend/server.js's renderLineChart/renderBarChart), just expressed with RN View height
// instead of an SVG/CSS percentage. `valueKey`/`formatValue` let the same chart plot either
// orderCount or revenue off the same weeklyTrend rows (see WeeklyTrendSection below).
function WeeklyTrendChart({ weeklyTrend, valueKey, formatValue }) {
  const styles = useThemedStyles(makeStyles);
  const maxValue = Math.max(1, ...weeklyTrend.map((week) => week[valueKey]));
  const labelStride = Math.max(1, Math.ceil(weeklyTrend.length / MAX_VISIBLE_WEEK_LABELS));

  return (
    <View style={styles.chart}>
      {weeklyTrend.map((week, index) => (
        <View key={week.weekStart} style={styles.chartCol}>
          <Text
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            style={styles.chartValue}
            numberOfLines={1}
          >
            {formatValue(week[valueKey])}
          </Text>
          <View
            style={[styles.chartBar, { height: (week[valueKey] / maxValue) * CHART_BAR_HEIGHT }]}
          />
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.chartLabel}>
            {index % labelStride === 0 ? formatWeekLabel(week.weekStart) : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Order count and revenue plot off the same weeklyTrend rows, so they share one unavailable/empty
// guard and one fetch -- rendering two separate guarded sections (one per metric) would show the
// same "暫時無法載入" notice twice for what is really one failed request.
function WeeklyTrendSection({ weeklyTrend, weeklyTrendUnavailable }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section title="近期訂單與營收趨勢（近 3 個月）">
      {weeklyTrendUnavailable ? (
        <Notice tone="danger" message="暫時無法載入近期趨勢，請稍後再試。" />
      ) : weeklyTrend.length === 0 ? (
        <EmptyPanel>近期沒有訂單資料。</EmptyPanel>
      ) : (
        <>
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.chartSubLabel}>訂單數</Text>
          <WeeklyTrendChart weeklyTrend={weeklyTrend} valueKey="orderCount" formatValue={String} />
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.chartSubLabel}>營收</Text>
          <WeeklyTrendChart weeklyTrend={weeklyTrend} valueKey="revenue" formatValue={formatCurrency} />
        </>
      )}
    </Section>
  );
}

// "2026-09-07" -> "09/07"; weekStart is always that exact shape (see getStoreWeeklyTrendPostgres),
// never parsed through Date, so this can't be thrown off by timezone.
function formatWeekLabel(weekStart) {
  return weekStart.slice(5).replace("-", "/");
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
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.s4,
    height: CHART_BAR_HEIGHT + 44
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%"
  },
  chartBar: {
    width: "100%",
    minHeight: 2,
    borderRadius: radii.xs,
    backgroundColor: colors.accent
  },
  chartValue: {
    ...typeScale.caption,
    color: colors.textSecondary,
    marginBottom: spacing.s4
  },
  chartLabel: {
    ...typeScale.caption,
    color: colors.textSecondary,
    marginTop: spacing.s4
  },
  chartSubLabel: {
    ...typeScale.caption,
    color: colors.textSecondary
  },
  note: {
    ...typeScale.caption,
    color: colors.textSecondary
  }
});
