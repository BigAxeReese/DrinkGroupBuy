import { useCallback, useEffect, useRef, useState } from "react";

export function useOrderListSync(syncOrders, scope, identityKey) {
  const [syncStatus, setSyncStatus] = useState("idle");
  const syncOrdersRef = useRef(syncOrders);
  syncOrdersRef.current = syncOrders;

  const refreshOrders = useCallback(async () => {
    setSyncStatus("loading");
    try {
      await syncOrdersRef.current(scope);
      setSyncStatus("ready");
    } catch {
      setSyncStatus("error");
    }
  }, [identityKey, scope]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  return { syncStatus, refreshOrders };
}
