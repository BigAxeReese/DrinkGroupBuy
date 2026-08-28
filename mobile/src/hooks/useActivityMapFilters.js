import { useEffect, useMemo, useState } from "react";
import { getBusinessNow } from "../utils/businessTime";
import { DEFAULT_MAP_FILTERS, describeAppliedFilters, filterMapStores } from "../utils/groupBuyActivityMapFilters";

// 只有「取餐時間」是會隨著時間流逝而過期的條件，所以只在有設定這個條件時才需要定時重算，
// 避免使用者停留在畫面上時，已經過了取餐時間的店家還一直留在符合清單裡。
const PICKUP_WINDOW_RECHECK_INTERVAL_MS = 30000;

export function useActivityMapFilters(mapStores, userPosition) {
  const [filters, setFilters] = useState(DEFAULT_MAP_FILTERS);
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [nowTick, setNowTick] = useState(() => getBusinessNow().getTime());

  useEffect(() => {
    if (filters.pickupWithinMinutes == null) return undefined;
    const intervalId = setInterval(() => setNowTick(getBusinessNow().getTime()), PICKUP_WINDOW_RECHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [filters.pickupWithinMinutes]);

  const visibleMapStores = useMemo(
    () => filterMapStores(mapStores, filters, userPosition),
    [mapStores, filters, userPosition.latitude, userPosition.longitude, nowTick]
  );

  const visibleStoreIds = useMemo(
    () => new Set(visibleMapStores.map((store) => store.id)),
    [visibleMapStores]
  );

  return {
    filters,
    visibleMapStores,
    visibleStoreIds,
    statusText: describeAppliedFilters(filters, visibleMapStores.length),
    filterPanelVisible,
    openFilterPanel: () => setFilterPanelVisible(true),
    closeFilterPanel: () => setFilterPanelVisible(false),
    applyFilters: (nextFilters) => {
      setFilters(nextFilters);
      setFilterPanelVisible(false);
    }
  };
}
