import { StyleSheet, Text, View } from "react-native";
import { useMilkTea } from "../theme/MilkTeaContext";
import { maxFontSizeMultiplier, radii, spacing, tones, typeScale } from "../theme/tokens";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getGroupBuyActivityDiscountInfo } from "../utils/groupBuyActivityProgress";

// Migrated routes get the new style: an estimated discount uses the "estimate" tone, a settled one
// the "success" tone (docs/ui-style-guide.md, see theme/MilkTeaContext.js). The old blue / green
// card below stays until the last screen has migrated.
export function DiscountSummaryCard({ groupBuyActivity, compact = false }) {
  const milkTea = useMilkTea();
  const discount = getGroupBuyActivityDiscountInfo(groupBuyActivity);
  const isFinal = discount.isQualified && !discount.isEstimated;
  const dealFactorLabel = formatDealFactorLabel(discount.currentTierDiscountPercent);
  const heading = discount.isQualified
    ? `${discount.isEstimated ? "預估" : "最終"}打 ${dealFactorLabel || "—"}`
    : "尚未達到優惠門檻";
  const tierText = discount.isQualified
    ? `目前 ${discount.currentCups} 杯，達到 ${discount.currentTierTargetCups} 杯級距`
    : discount.nextTierTargetCups
      ? `再 ${discount.cupsToNextTier} 杯達到 ${discount.nextTierTargetCups} 杯級距`
      : "目前沒有可套用的優惠級距";

  if (milkTea) {
    const tone = tones[isFinal ? "success" : "estimate"];
    return (
      <View style={[milkTeaStyles.card, { backgroundColor: tone.bg }]}>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[milkTeaStyles.heading, { color: tone.fg }]}>{heading}</Text>
        <Text style={[milkTeaStyles.meta, { color: tone.fg }]}>{tierText}</Text>
        {!compact && discount.isEstimated ? (
          <Text style={[milkTeaStyles.note, { color: tone.fg }]}>截止前為預估值，實際折扣依每筆訂單自己的金額結算。</Text>
        ) : null}
        {!compact && isFinal ? (
          <Text style={[milkTeaStyles.note, { color: tone.fg }]}>已結算，此折數為最終折扣，不會再變動。</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.card, compact && styles.compactCard, isFinal && styles.finalCard]}>
      <Text style={[styles.heading, isFinal && styles.finalHeading]}>{heading}</Text>
      <Text style={styles.meta}>{tierText}</Text>
      {!compact && discount.isEstimated ? (
        <Text style={styles.notice}>截止前為預估值，實際折扣依每筆訂單自己的金額結算。</Text>
      ) : null}
      {!compact && isFinal ? (
        <Text style={styles.finalNotice}>已結算，此折數為最終折扣，不會再變動。</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12
  },
  compactCard: {
    paddingVertical: 9
  },
  finalCard: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  heading: {
    color: "#1d4ed8",
    fontSize: 16,
    fontWeight: "900"
  },
  finalHeading: {
    color: "#047857"
  },
  meta: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  notice: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16
  },
  finalNotice: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  }
});

const milkTeaStyles = StyleSheet.create({
  card: {
    gap: spacing.s4,
    paddingVertical: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radii.sm
  },
  heading: {
    ...typeScale.sectionTitle
  },
  meta: {
    ...typeScale.bodyDense
  },
  note: {
    ...typeScale.caption
  }
});
