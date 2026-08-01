export function getGroupBuyActivityStore(groupBuyActivity) {
  if (!groupBuyActivity) return null;

  const store = groupBuyActivity.store ?? {};
  const id = groupBuyActivity.storeId ?? store.id ?? null;
  if (!id) return null;

  return {
    id,
    name: store.name ?? groupBuyActivity.storeName ?? "店家資料未提供",
    address: store.address ?? "",
    phone: store.phone ?? "",
    latitude: toFiniteNumber(store.latitude),
    longitude: toFiniteNumber(store.longitude)
  };
}

export function buildGroupBuyActivityMapStores(groupBuyActivities = []) {
  const storesById = new Map();

  groupBuyActivities.forEach((groupBuyActivity) => {
    const store = getGroupBuyActivityStore(groupBuyActivity);
    if (!store || store.latitude == null || store.longitude == null) return;

    const current = storesById.get(store.id) ?? {
      ...store,
      hasRecruitingGroupBuyActivity: false,
      recruitingGroupBuyActivityId: null,
      progressText: ""
    };

    if (!current.recruitingGroupBuyActivityId && isJoinableActivity(groupBuyActivity)) {
      current.hasRecruitingGroupBuyActivity = true;
      current.recruitingGroupBuyActivityId = groupBuyActivity.id;
      current.progressText = getGroupBuyActivityProgressText(groupBuyActivity);
    }

    storesById.set(store.id, current);
  });

  return [...storesById.values()];
}

function isJoinableActivity(groupBuyActivity) {
  return ["recruiting", "confirmed"].includes(groupBuyActivity.status)
    && groupBuyActivity.canJoin !== false
    && !groupBuyActivity.cancellationReason;
}

function getGroupBuyActivityProgressText(groupBuyActivity) {
  const tierTargets = (groupBuyActivity.tiers ?? [])
    .map((tier) => Number(tier.targetCups ?? tier.cups))
    .filter((cups) => Number.isFinite(cups) && cups > 0)
    .sort((left, right) => left - right);
  const currentCups = Number(groupBuyActivity.currentCups ?? 0);
  const fallbackTarget = Number(groupBuyActivity.targetCups);
  const nextTarget = tierTargets.find((cups) => currentCups < cups)
    ?? tierTargets[tierTargets.length - 1]
    ?? (Number.isFinite(fallbackTarget) ? fallbackTarget : null)
    ?? 0;
  return `${currentCups}/${nextTarget}杯`;
}

function toFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
