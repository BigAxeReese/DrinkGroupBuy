import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAuthMode, getDevBusinessTime } from "../utils/apiClient";
import {
  applyBusinessTimeSnapshot,
  getBusinessTimeSnapshot,
  resetBusinessTimeSnapshot,
} from "../utils/businessTime";

const REFRESH_INTERVAL_MS = 5000;

export function useDevBusinessTime() {
  const enabled = isDevelopmentBuild() && getAuthMode() === "dev";
  const [snapshot, setSnapshot] = useState(getBusinessTimeSnapshot());
  const [syncStatus, setSyncStatus] = useState(enabled ? "loading" : "disabled");
  const [syncError, setSyncError] = useState("");
  const requestInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || requestInFlightRef.current) return null;
    requestInFlightRef.current = true;
    try {
      const nextSnapshot = applyBusinessTimeSnapshot(await getDevBusinessTime());
      setSnapshot(nextSnapshot);
      setSyncStatus("ready");
      setSyncError("");
      return nextSnapshot;
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error?.message || "無法讀取開發業務時間");
      return null;
    } finally {
      requestInFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(resetBusinessTimeSnapshot());
      setSyncStatus("disabled");
      setSyncError("");
      return undefined;
    }

    refresh();
    const intervalId = setInterval(refresh, REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refresh();
    });
    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [enabled, refresh]);

  return { enabled, refresh, snapshot, syncError, syncStatus };
}

function isDevelopmentBuild() {
  return typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";
}
