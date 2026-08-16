export function getGroupBuyActivityProgress(groupBuyActivity) {
  const currentCups = Number(groupBuyActivity?.currentCups ?? 0);
  const tierTargets = (groupBuyActivity?.tiers ?? [])
    .map((tier) => Number(tier.cups ?? tier.targetCups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const maximumTarget = Number(groupBuyActivity?.maximumCups ?? tierTargets[tierTargets.length - 1] ?? groupBuyActivity?.targetCups ?? 0);
  const nextTarget = tierTargets.find((cups) => currentCups < cups)
    ?? maximumTarget
    ?? Number(groupBuyActivity?.targetCups ?? 0);
  const reachedTier = [...tierTargets].reverse().find((cups) => currentCups >= cups) ?? null;
  const remainingCups = Math.max(0, nextTarget - currentCups);
  const progressPercent = nextTarget > 0
    ? Math.min(100, Math.round((currentCups / nextTarget) * 100))
    : 0;

  return {
    currentCups,
    nextTarget,
    reachedTier,
    remainingCups,
    progressPercent
  };
}

export function getGroupBuyActivityCapacityInfo(groupBuyActivity) {
  const tierTargets = (groupBuyActivity?.tiers ?? [])
    .map((tier) => Number(tier.cups ?? tier.targetCups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const maximumCups = Number(groupBuyActivity?.maximumCups ?? tierTargets[tierTargets.length - 1] ?? groupBuyActivity?.targetCups ?? 0);
  const currentCups = Number(groupBuyActivity?.currentCups ?? 0);
  const remainingCapacity = Math.max(0, maximumCups - currentCups);

  return {
    currentCups,
    maximumCups,
    remainingCapacity,
    isFull: maximumCups > 0 && currentCups >= maximumCups
  };
}

export function wouldExceedGroupBuyActivityCapacity(groupBuyActivity, additionalCups) {
  const { maximumCups, currentCups } = getGroupBuyActivityCapacityInfo(groupBuyActivity);
  if (!maximumCups) return false;
  return currentCups + Number(additionalCups ?? 0) > maximumCups;
}

export function getGroupBuyActivityDiscountInfo(groupBuyActivity) {
  const settlement = groupBuyActivity?.settlement;
  if (settlement) {
    const appliedTier = (groupBuyActivity?.tiers ?? [])
      .find((tier) => tier.id === settlement.appliedTierId) ?? null;
    return {
      currentCups: settlement.authorizedCups,
      currentTierId: settlement.appliedTierId,
      currentTierTargetCups: appliedTier ? Number(appliedTier.cups ?? appliedTier.targetCups) : null,
      currentTierDiscountAmount: settlement.discountAmount,
      estimatedDiscountPerCup: settlement.discountPerCup,
      estimatedAllocatedDiscountAmount: settlement.allocatedDiscountAmount,
      estimatedUndistributedDiscountAmount: settlement.undistributedDiscountAmount,
      nextTierTargetCups: null,
      cupsToNextTier: 0,
      isQualified: settlement.outcome === "qualified",
      isEstimated: false
    };
  }

  const currentCups = Math.max(Number(groupBuyActivity?.currentCups ?? 0), 0);
  const tiers = (groupBuyActivity?.tiers ?? [])
    .map((tier) => ({
      id: tier.id ?? null,
      targetCups: Number(tier.cups ?? tier.targetCups),
      discountAmount: Number(tier.discountAmount)
    }))
    .filter((tier) => Number.isInteger(tier.targetCups)
      && tier.targetCups > 0
      && Number.isInteger(tier.discountAmount)
      && tier.discountAmount >= 0)
    .sort((left, right) => left.targetCups - right.targetCups);
  const reachedTiers = tiers.filter((tier) => currentCups >= tier.targetCups);
  const reachedTier = reachedTiers[reachedTiers.length - 1] ?? null;
  const nextTier = tiers.find((tier) => currentCups < tier.targetCups) ?? null;
  const hasCurrentBackendSummary = Number(groupBuyActivity?.discountSummaryAuthorizedCups) === currentCups;
  const discountPerCup = hasCurrentBackendSummary
    ? normalizeNonNegativeInteger(groupBuyActivity?.estimatedDiscountPerCup)
    : reachedTier && currentCups > 0
      ? Math.floor(reachedTier.discountAmount / currentCups)
      : 0;
  const allocatedDiscountAmount = hasCurrentBackendSummary
    ? normalizeNonNegativeInteger(groupBuyActivity?.estimatedAllocatedDiscountAmount)
    : discountPerCup * currentCups;
  const undistributedDiscountAmount = hasCurrentBackendSummary
    ? normalizeNonNegativeInteger(groupBuyActivity?.estimatedUndistributedDiscountAmount)
    : reachedTier
      ? Math.max(reachedTier.discountAmount - allocatedDiscountAmount, 0)
      : 0;

  return {
    currentCups,
    currentTierId: hasCurrentBackendSummary
      ? groupBuyActivity?.currentTierId ?? reachedTier?.id ?? null
      : reachedTier?.id ?? null,
    currentTierTargetCups: hasCurrentBackendSummary
      ? normalizeNullablePositiveInteger(groupBuyActivity?.currentTierTargetCups)
      : reachedTier?.targetCups ?? null,
    currentTierDiscountAmount: hasCurrentBackendSummary
      ? normalizeNonNegativeInteger(groupBuyActivity?.currentTierDiscountAmount)
      : reachedTier?.discountAmount ?? 0,
    estimatedDiscountPerCup: discountPerCup,
    estimatedAllocatedDiscountAmount: allocatedDiscountAmount,
    estimatedUndistributedDiscountAmount: undistributedDiscountAmount,
    nextTierTargetCups: hasCurrentBackendSummary
      ? normalizeNullablePositiveInteger(groupBuyActivity?.nextTierTargetCups)
      : nextTier?.targetCups ?? null,
    cupsToNextTier: hasCurrentBackendSummary
      ? normalizeNonNegativeInteger(groupBuyActivity?.cupsToNextTier)
      : nextTier ? Math.max(nextTier.targetCups - currentCups, 0) : 0,
    isQualified: Boolean(reachedTier),
    isEstimated: ["recruiting", "confirmed"].includes(groupBuyActivity?.status)
  };
}

export function getFinalSettlementSnapshot(groupBuyActivity, order) {
  const settlement = groupBuyActivity?.settlement;
  if (!settlement) return null;

  const originalAmount = normalizeNullableNonNegativeInteger(
    order?.originalAmount ?? order?.subtotal
  );
  const finalAmount = normalizeNullableNonNegativeInteger(order?.finalAmount);
  const orderDiscountAmount = originalAmount == null || finalAmount == null
    ? null
    : Math.max(originalAmount - finalAmount, 0);

  return {
    hasOrder: Boolean(order),
    outcome: settlement.outcome,
    outcomeLabel: getSettlementOutcomeLabel(settlement.outcome),
    authorizedCups: normalizeNonNegativeInteger(settlement.authorizedCups),
    discountPerCup: normalizeNonNegativeInteger(settlement.discountPerCup),
    allocatedDiscountAmount: normalizeNonNegativeInteger(settlement.allocatedDiscountAmount),
    undistributedDiscountAmount: normalizeNonNegativeInteger(
      settlement.undistributedDiscountAmount
    ),
    originalAmount,
    finalAmount,
    orderDiscountAmount,
    settledAt: settlement.settledAt ?? null
  };
}

function getSettlementOutcomeLabel(outcome) {
  if (outcome === "qualified") return "已達優惠門檻";
  if (outcome === "failed") return "未達優惠門檻";
  if (outcome === "cancelled") return "團購已取消";
  return "已完成結算";
}

function normalizeNonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function normalizeNullablePositiveInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeNullableNonNegativeInteger(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}
