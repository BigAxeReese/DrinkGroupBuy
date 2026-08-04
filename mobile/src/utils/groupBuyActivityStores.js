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

export function buildStoreMapStores(stores = [], groupBuyActivities = []) {
  const storesById = new Map();

  stores.forEach((store) => {
    const normalizedStore = normalizePublicStore(store);
    if (!normalizedStore || normalizedStore.latitude == null || normalizedStore.longitude == null) return;

    storesById.set(normalizedStore.id, {
      ...normalizedStore,
      hasRecruitingGroupBuyActivity: false,
      recruitingGroupBuyActivityId: null,
      joinableGroupBuyActivityIds: [],
      progressText: ""
    });
  });

  groupBuyActivities.forEach((groupBuyActivity) => {
    const store = getGroupBuyActivityStore(groupBuyActivity);
    const current = store ? storesById.get(store.id) : null;
    if (!current || !isJoinableGroupBuyActivity(groupBuyActivity)) return;

    current.hasRecruitingGroupBuyActivity = true;
    current.recruitingGroupBuyActivityId ??= groupBuyActivity.id;
    current.joinableGroupBuyActivityIds.push(groupBuyActivity.id);
    current.progressText = current.joinableGroupBuyActivityIds.length === 1
      ? getGroupBuyActivityProgressText(groupBuyActivity)
      : `${current.joinableGroupBuyActivityIds.length} 個團購`;
  });

  return [...storesById.values()];
}

export function isJoinableGroupBuyActivity(groupBuyActivity) {
  return ["recruiting", "confirmed"].includes(groupBuyActivity.status)
    && groupBuyActivity.canJoin !== false
    && !groupBuyActivity.cancellationReason;
}

export function getStoreMapDestination(store) {
  const activityIds = store?.joinableGroupBuyActivityIds ?? [];
  if (activityIds.length > 1) {
    return { name: "storeGroupBuyActivities", params: { storeId: store.id } };
  }
  if (activityIds.length === 1) {
    return { name: "groupBuyActivityDetail", params: { groupBuyActivityId: activityIds[0] } };
  }
  return { name: "storeMenu", params: { storeId: store.id } };
}

function normalizePublicStore(store) {
  if (!store?.id) return null;
  return {
    id: store.id,
    name: store.name ?? "未命名店家",
    address: store.address ?? "",
    phone: store.phone ?? "",
    businessStatus: store.businessStatus ?? "open",
    latitude: toFiniteNumber(store.latitude),
    longitude: toFiniteNumber(store.longitude)
  };
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
