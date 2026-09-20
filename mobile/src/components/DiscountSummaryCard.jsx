import { StyleSheet, Text, View } from "react-native";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getGroupBuyActivityDiscountInfo } from "../utils/groupBuyActivityProgress";

export function DiscountSummaryCard({ groupBuyActivity, compact = false }) {
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
