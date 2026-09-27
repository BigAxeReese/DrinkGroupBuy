import { StyleSheet, Text, View } from "react-native";
import { maxFontSizeMultiplier, radii, spacing, typeScale } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getGroupBuyActivityDiscountInfo } from "../utils/groupBuyActivityProgress";

// An estimated discount uses the "estimate" tone, a settled one the "success" tone
// (docs/ui-style-guide.md).
export function DiscountSummaryCard({ groupBuyActivity, compact = false }) {
  const { tones } = useTheme();
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
  const tone = tones[isFinal ? "success" : "estimate"];

  return (
    <View style={[styles.card, { backgroundColor: tone.bg }]}>
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[styles.heading, { color: tone.fg }]}>{heading}</Text>
      <Text style={[styles.meta, { color: tone.fg }]}>{tierText}</Text>
      {!compact && discount.isEstimated ? (
        <Text style={[styles.note, { color: tone.fg }]}>截止前為預估值，實際折扣依每筆訂單自己的金額結算。</Text>
      ) : null}
      {!compact && isFinal ? (
        <Text style={[styles.note, { color: tone.fg }]}>已結算，此折數為最終折扣，不會再變動。</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
