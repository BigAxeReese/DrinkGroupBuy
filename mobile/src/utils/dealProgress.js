export function getDealProgress(deal) {
  const currentCups = Number(deal?.currentCups ?? 0);
  const tierTargets = (deal?.tiers ?? [])
    .map((tier) => Number(tier.cups ?? tier.targetCups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const maximumTarget = Number(deal?.maximumCups ?? tierTargets[tierTargets.length - 1] ?? deal?.targetCups ?? 0);
  const nextTarget = tierTargets.find((cups) => currentCups < cups)
    ?? maximumTarget
    ?? Number(deal?.targetCups ?? 0);
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

export function getDealCapacityInfo(deal) {
  const tierTargets = (deal?.tiers ?? [])
    .map((tier) => Number(tier.cups ?? tier.targetCups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const maximumCups = Number(deal?.maximumCups ?? tierTargets[tierTargets.length - 1] ?? deal?.targetCups ?? 0);
  const currentCups = Number(deal?.currentCups ?? 0);
  const remainingCapacity = Math.max(0, maximumCups - currentCups);

  return {
    currentCups,
    maximumCups,
    remainingCapacity,
    isFull: maximumCups > 0 && currentCups >= maximumCups
  };
}

export function wouldExceedDealCapacity(deal, additionalCups) {
  const { maximumCups, currentCups } = getDealCapacityInfo(deal);
  if (!maximumCups) return false;
  return currentCups + Number(additionalCups ?? 0) > maximumCups;
}
