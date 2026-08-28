import { getBusinessNow } from "./businessTime";
import { calculateDistanceKm } from "./distance";

export const DEFAULT_MAP_FILTERS = Object.freeze({
  recruitingOnly: false,
  radiusKm: null,
  minCups: null,
  pickupWithinMinutes: null
});

export const RADIUS_OPTIONS = [
  { value: null, label: "不限" },
  { value: 0.5, label: "500 公尺" },
  { value: 1, label: "1 公里" },
  { value: 2, label: "2 公里" },
  { value: 3, label: "3 公里" },
  { value: 5, label: "5 公里" }
];

export const MIN_CUPS_OPTIONS = [
  { value: null, label: "不限" },
  { value: 10, label: "滿 10 杯" },
  { value: 20, label: "滿 20 杯" },
  { value: 30, label: "滿 30 杯" }
];

export const PICKUP_WITHIN_MINUTES_OPTIONS = [
  { value: null, label: "不限" },
  { value: 30, label: "30 分鐘內" },
  { value: 60, label: "1 小時內" }
];

// 篩選規則來自 system-analysis/藍圖.docx 4.1.2.2：
// - 招募中開關：只顯示 hasRecruitingGroupBuyActivity 的店家
// - 搜尋半徑：店家距離 <= 設定值
// - 優惠門檻／取餐時間：兩者是複合條件，店家必須有「同一筆」可加入活動同時滿足所有已設定的條件
//   （目前有效杯數 >= 設定值，且取餐開始時間落在「現在起 N 分鐘內」），不是分別找不同活動各自滿足其中一項
export function filterMapStores(stores, filters, userPosition, now = getBusinessNow()) {
  const activeFilters = { ...DEFAULT_MAP_FILTERS, ...filters };
  return (stores ?? []).filter((store) => storeMatchesFilters(store, activeFilters, userPosition, now));
}

function storeMatchesFilters(store, filters, userPosition, now) {
  if (filters.recruitingOnly && !store.hasRecruitingGroupBuyActivity) return false;

  if (filters.radiusKm != null) {
    const distanceKm = calculateDistanceKm(userPosition, store);
    if (distanceKm == null || distanceKm > filters.radiusKm) return false;
  }

  if (filters.minCups != null || filters.pickupWithinMinutes != null) {
    if (!storeHasActivityMeetingActivityFilters(store, filters, now)) return false;
  }

  return true;
}

function storeHasActivityMeetingActivityFilters(store, filters, now) {
  return (store.joinableGroupBuyActivities ?? []).some(
    (activity) => activityMeetsMinCups(activity, filters.minCups) && activityStartsWithin(activity, filters.pickupWithinMinutes, now)
  );
}

function activityMeetsMinCups(activity, minCups) {
  if (minCups == null) return true;
  return Number(activity.currentCups ?? 0) >= minCups;
}

function activityStartsWithin(activity, thresholdMinutes, now) {
  if (thresholdMinutes == null) return true;
  if (!activity.pickupStartAt) return false;
  const pickupStartAt = new Date(activity.pickupStartAt);
  if (Number.isNaN(pickupStartAt.getTime())) return false;
  const minutesUntil = (pickupStartAt.getTime() - now.getTime()) / 60000;
  return minutesUntil >= 0 && minutesUntil <= thresholdMinutes;
}

export function describeAppliedFilters(filters, matchCount) {
  const activeFilters = { ...DEFAULT_MAP_FILTERS, ...filters };
  const parts = [];

  if (activeFilters.recruitingOnly) parts.push("只看招募中");

  if (activeFilters.radiusKm != null) {
    const radiusOption = RADIUS_OPTIONS.find((option) => option.value === activeFilters.radiusKm);
    parts.push(`${radiusOption?.label ?? `${activeFilters.radiusKm} 公里`}內`);
  }

  if (activeFilters.minCups != null) {
    const minCupsOption = MIN_CUPS_OPTIONS.find((option) => option.value === activeFilters.minCups);
    parts.push(minCupsOption?.label ?? `滿 ${activeFilters.minCups} 杯`);
  }

  if (activeFilters.pickupWithinMinutes != null) {
    const pickupOption = PICKUP_WITHIN_MINUTES_OPTIONS.find((option) => option.value === activeFilters.pickupWithinMinutes);
    parts.push(pickupOption?.label ?? `${activeFilters.pickupWithinMinutes} 分鐘內取餐`);
  }

  const summary = parts.length > 0 ? parts.join("・") : "不限篩選條件";
  return `${summary}・符合 ${matchCount} 間`;
}
