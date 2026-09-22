import { StyleSheet, Text, View } from "react-native";
import { colors, radii, sizes, spacing, tones, typeScale } from "../theme/tokens";
import { formatDealFactorLabel } from "../utils/discountPercentFormat";
import { getGroupBuyActivityDiscountInfo } from "../utils/groupBuyActivityProgress";
import { StatusMark } from "./StatusMark";

// The discount ladder, one row per tier (docs/ui-style-guide.md). Tiers the activity has reached are
// filled with the "estimate" tone while the discount can still change, and with the "success" tone
// once it is settled; tiers not reached yet stay on the plain milk-tea fill. A reached row also carries
// the tone's drawn mark and says "已達成" to screen readers, so colour is never the only signal.
export function TierLadder({ groupBuyActivity }) {
  const discount = getGroupBuyActivityDiscountInfo(groupBuyActivity);
  const tone = tones[discount.isEstimated ? "estimate" : "success"];
  const reachedCups = discount.isQualified ? discount.currentTierTargetCups ?? 0 : 0;
  const tiers = (groupBuyActivity?.tiers ?? [])
    .map((tier) => ({ key: tier.id ?? String(tier.cups ?? tier.targetCups), cups: Number(tier.cups ?? tier.targetCups), discountPercent: tier.discountPercent }))
    .filter((tier) => Number.isFinite(tier.cups))
    .sort((left, right) => left.cups - right.cups);

  return (
    <View style={styles.list}>
      {tiers.map((tier) => {
        const reached = reachedCups > 0 && tier.cups <= reachedCups;
        const discountLabel = formatDealFactorLabel(tier.discountPercent) || "—";
        const textColor = reached ? tone.fg : colors.text;

        return (
          <View
            key={tier.key}
            accessible
            accessibilityLabel={`滿 ${tier.cups} 杯，打 ${discountLabel}${reached ? "，已達成" : ""}`}
            style={[styles.row, { backgroundColor: reached ? tone.bg : colors.recess }]}
          >
            <View style={styles.markSlot}>{reached ? <StatusMark mark={tone.mark} color={tone.fg} /> : null}</View>
            <Text style={[styles.cups, { color: textColor }]}>滿 {tier.cups} 杯</Text>
            <Text style={[styles.discount, { color: textColor }]}>打 {discountLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s8
  },
  row: {
    minHeight: sizes.tap + spacing.s4,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    borderRadius: radii.sm
  },
  // Reserves the mark's width on every row so the text lines up whether or not a tier is reached.
  markSlot: {
    width: 14,
    height: 14
  },
  cups: {
    ...typeScale.body,
    flex: 1
  },
  discount: {
    ...typeScale.body,
    fontWeight: typeScale.label.fontWeight
  }
});
