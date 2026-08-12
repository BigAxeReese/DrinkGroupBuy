import { StyleSheet, Text, View } from "react-native";
import { formatCurrency } from "../utils/calculations";
import { getGroupBuyActivityDiscountInfo } from "../utils/groupBuyActivityProgress";

export function DiscountSummaryCard({ groupBuyActivity, compact = false }) {
  const discount = getGroupBuyActivityDiscountInfo(groupBuyActivity);
  const isFinal = discount.isQualified && !discount.isEstimated;
  const heading = discount.isQualified
    ? `${discount.isEstimated ? "預估" : "最終"}每杯折 ${formatCurrency(discount.estimatedDiscountPerCup)}`
    : "尚未達到優惠門檻";
  const tierText = discount.isQualified
    ? `目前 ${discount.currentCups} 杯，達到 ${discount.currentTierTargetCups} 杯級距（總折扣 ${formatCurrency(discount.currentTierDiscountAmount)}）`
    : discount.nextTierTargetCups
      ? `再 ${discount.cupsToNextTier} 杯達到 ${discount.nextTierTargetCups} 杯級距`
      : "目前沒有可套用的優惠級距";
  const allocationLabel = discount.isEstimated ? "預估分配" : "實際分配";

  return (
    <View style={[styles.card, compact && styles.compactCard, isFinal && styles.finalCard]}>
      <Text style={[styles.heading, isFinal && styles.finalHeading]}>{heading}</Text>
      <Text style={styles.meta}>{tierText}</Text>
      {discount.isQualified && !compact ? (
        <Text style={styles.meta}>
          {allocationLabel} {formatCurrency(discount.estimatedAllocatedDiscountAmount)}
          {discount.estimatedUndistributedDiscountAmount > 0
            ? ` · 未分配尾差 ${formatCurrency(discount.estimatedUndistributedDiscountAmount)}（退回商家）`
            : " · 無未分配尾差"}
        </Text>
      ) : null}
      {!compact && discount.isEstimated ? (
        <Text style={styles.notice}>截止前為預估值，將依最終有效授權杯數重新計算。</Text>
      ) : null}
      {!compact && isFinal ? (
        <Text style={styles.finalNotice}>已結算，此金額為最終折扣，不會再變動。</Text>
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
