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
