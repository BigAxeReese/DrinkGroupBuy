import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { EmptyPanel } from "../components/EmptyPanel";
import { MobileScreen, Section } from "../components/MobileScreen";
import { Notice } from "../components/Notice";
import { PrimaryButton } from "../components/PrimaryButton";
import { maxFontSizeMultiplier, radii, spacing, typeScale } from "../theme/tokens";
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
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

// The chart's columns are narrow (13 weeks side by side), so formatCurrency's full "$14529" gets
// cut down to "$..." by the value Text's numberOfLines={1} -- it simply doesn't fit. Dropping the
// "$" (the "營收" sub-label above the chart already establishes these are money) and rounding to
// the nearest thousand keeps the label as short as the order-count numbers next to it, which do fit.
// Also used to format the y-axis tick values (computeNiceAxisStep below already rounds those to
// clean numbers, so "27000" reads as "27k" the same way a bar's own value does).
function formatRevenueCompact(amount) {
  return amount >= 1000 ? `${Math.round(amount / 1000)}k` : `${amount}`;
}

const CHART_HEIGHT = 120;
const MIN_BAR_HEIGHT = 3;
const Y_AXIS_WIDTH = 34;
// 4 steps above 0 => 5 gridlines/labels (0, step, 2*step, 3*step, 4*step), matching the reference
// chart's "0 / 5875 / 11750 / 17625 / 23500" style axis.
const Y_AXIS_STEPS = 4;

// Rounds maxValue/Y_AXIS_STEPS up to a "nice" 1/2/5 * 10^n number, so the axis reads like a real
// chart's 0/5k/10k/15k/20k instead of an arbitrary fraction of whatever this week's max happens to
// be. Always rounds UP (never down), so axisStep * Y_AXIS_STEPS is guaranteed >= maxValue.
function computeNiceAxisStep(maxValue) {
  const rawStep = maxValue / Y_AXIS_STEPS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

// A gradient-filled bar chart with a y-axis scale and gridlines (mirrors the "0/5875/11750/17625/
// 23500"-style reference chart the store owner asked to match), replacing the flat single-colour
// bars and the earlier line-chart attempt neither of which had an axis scale. A week with an actual
// 0 gets no bar at all (height 0, no floor); a non-zero value keeps a small floor so it doesn't
// disappear next to a much taller neighbour. `valueKey`/`formatValue` let the same chart plot either
// orderCount or revenue off the same weeklyTrend rows (see WeeklyTrendSection below).
function WeeklyTrendChart({ weeklyTrend, valueKey, formatValue }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const maxValue = Math.max(1, ...weeklyTrend.map((week) => week[valueKey]));
  const axisStep = computeNiceAxisStep(maxValue);
  const axisMax = axisStep * Y_AXIS_STEPS;
  const ticksDescending = Array.from(
    { length: Y_AXIS_STEPS + 1 },
    (_, index) => axisStep * (Y_AXIS_STEPS - index)
  );

  return (
    <View>
      <View style={styles.chartRow}>
        <View style={styles.yAxisLabels}>
          {ticksDescending.map((tick) => (
            <Text key={tick} maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.yAxisLabel} numberOfLines={1}>
              {formatValue(tick)}
            </Text>
          ))}
        </View>
        <View style={styles.plotArea}>
          <View style={styles.gridLines} pointerEvents="none">
            {ticksDescending.map((tick) => (
              <View key={tick} style={styles.gridLine} />
            ))}
          </View>
          {weeklyTrend.map((week) => {
            const value = week[valueKey];
            const barHeight = value === 0 ? 0 : Math.max(MIN_BAR_HEIGHT, (value / axisMax) * CHART_HEIGHT);
            return (
              <View key={week.weekStart} style={styles.chartCol}>
                <Text
                  maxFontSizeMultiplier={maxFontSizeMultiplier}
                  style={styles.chartValue}
                  numberOfLines={1}
                >
                  {formatValue(value)}
                </Text>
                <LinearGradient
                  colors={[colors.lineDecor, colors.accent]}
                  style={[styles.chartBar, { height: barHeight }]}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.xAxisRow}>
        <View style={styles.yAxisSpacer} />
        {weeklyTrend.map((week) => (
          <View key={week.weekStart} style={styles.xAxisLabelCol}>
            <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.xAxisLabel} numberOfLines={1}>
              {formatWeekLabel(week.weekStart)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Order count and revenue plot off the same weeklyTrend rows, so they share one unavailable/empty
// guard and one fetch -- rendering two separate guarded sections (one per metric) would show the
// same "暫時無法載入" notice twice for what is really one failed request.
function WeeklyTrendSection({ weeklyTrend, weeklyTrendUnavailable }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section title="近期訂單與營收趨勢（近 2 個月）">
      {weeklyTrendUnavailable ? (
        <Notice tone="danger" message="暫時無法載入近期趨勢，請稍後再試。" />
      ) : weeklyTrend.length === 0 ? (
        <EmptyPanel>近期沒有訂單資料。</EmptyPanel>
      ) : (
        <>
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.chartSubLabel}>訂單數</Text>
          <WeeklyTrendChart weeklyTrend={weeklyTrend} valueKey="orderCount" formatValue={String} />
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={styles.chartSubLabel}>營收</Text>
          <WeeklyTrendChart weeklyTrend={weeklyTrend} valueKey="revenue" formatValue={formatRevenueCompact} />
        </>
      )}
    </Section>
  );
}

// "2026-09-07" -> "9/7" (no leading zeros); weekStart is always that exact shape (see
// getStoreWeeklyTrendPostgres), never parsed through Date, so this can't be thrown off by timezone.
function formatWeekLabel(weekStart) {
  const [, month, day] = weekStart.split("-");
  return `${Number(month)}/${Number(day)}`;
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
  chartRow: {
    flexDirection: "row",
    gap: spacing.s8
  },
  yAxisLabels: {
    width: Y_AXIS_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: "space-between"
  },
  yAxisLabel: {
    ...typeScale.caption,
    color: colors.textSecondary,
    textAlign: "right"
  },
  plotArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.s4,
    height: CHART_HEIGHT
  },
  gridLines: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between"
  },
  gridLine: {
    height: 1,
    backgroundColor: colors.lineRow
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%"
  },
  chartBar: {
    width: "100%",
    borderTopLeftRadius: radii.xs,
    borderTopRightRadius: radii.xs
  },
  chartValue: {
    ...typeScale.caption,
    color: colors.textSecondary,
    marginBottom: spacing.s4
  },
  xAxisRow: {
    flexDirection: "row",
    gap: spacing.s4,
    marginTop: spacing.s12
  },
  yAxisSpacer: {
    width: Y_AXIS_WIDTH + spacing.s8
  },
  xAxisLabelCol: {
    flex: 1,
    alignItems: "center"
  },
  xAxisLabel: {
    ...typeScale.caption,
    color: colors.textSecondary
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
