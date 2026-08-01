import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  fallbackDevLocationConfig,
  fetchDevLocationConfig,
  isDevLocationControlEnabled
} from "../utils/devLocationControl";

const REFRESH_INTERVAL_MS = 5000;

export function useDevLocationConfig(authUserId) {
  const enabled = isDevLocationControlEnabled() && Boolean(authUserId);
  const [config, setConfig] = useState(fallbackDevLocationConfig);
  const [syncStatus, setSyncStatus] = useState(enabled ? "loading" : "disabled");
  const [syncError, setSyncError] = useState("");

  const refreshConfig = useCallback(async () => {
    if (!enabled) return null;
    try {
      const nextConfig = await fetchDevLocationConfig(authUserId);
      if (nextConfig) setConfig(nextConfig);
      setSyncStatus("ready");
      setSyncError("");
      return nextConfig;
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error?.message || "無法讀取開發定位設定");
      return null;
    }
  }, [authUserId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setConfig(fallbackDevLocationConfig);
      setSyncStatus("disabled");
      setSyncError("");
      return undefined;
    }

    refreshConfig();
    const intervalId = setInterval(refreshConfig, REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refreshConfig();
    });
    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [enabled, refreshConfig]);

  return {
    config,
    enabled,
    refreshConfig,
    syncError,
    syncStatus
  };
}
