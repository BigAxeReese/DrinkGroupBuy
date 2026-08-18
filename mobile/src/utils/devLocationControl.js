import Constants from "expo-constants";
import { Platform } from "react-native";
import { mapCenter } from "../mock/mapConfig";
import { fetchWithTimeout } from "./fetchWithTimeout";

const REQUEST_TIMEOUT_MS = 2500;

export const fallbackDevLocationConfig = Object.freeze({
  version: 0,
  locationMode: "fixed",
  fixedLocation: Object.freeze({
    name: mapCenter.name,
    latitude: mapCenter.latitude,
    longitude: mapCenter.longitude
  })
});

export function isDevLocationControlEnabled() {
  return isDevelopmentBuild() && getAuthMode() === "dev";
}

export async function fetchDevLocationConfig(userId) {
  if (!isDevLocationControlEnabled() || !isValidUserId(userId)) return null;

  const query = new URLSearchParams({ userId });
  const response = await fetchWithTimeout(`${getDevConsoleBaseUrl()}/api/app/config?${query}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    timeoutMessage: "開發控制台連線逾時"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return normalizeLocationConfig(payload.config);
}

export async function reportAppliedDevLocation({ userId, config, locationPermission }) {
  if (!isDevLocationControlEnabled() || !isValidUserId(userId) || !config) return null;
  const response = await fetch(`${getDevConsoleBaseUrl()}/api/app/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appliedVersion: config.version,
      locationMode: config.locationMode,
      locationPermission,
      user: {
        id: userId,
        displayName: userId,
        roles: ["customer"]
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.appReport;
}

export function getDevConsoleBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_DEV_CONSOLE_URL
    || Constants.expoConfig?.extra?.devConsoleBaseUrl
    || Constants.manifest2?.extra?.expoClient?.extra?.devConsoleBaseUrl;
  const fallbackUrl = Platform.OS === "android"
    ? "http://10.0.2.2:3100"
    : "http://127.0.0.1:3100";
  return String(configuredUrl || fallbackUrl).replace(/\/$/, "");
}

function normalizeLocationConfig(input) {
  const fixedLocation = input?.fixedLocation;
  const latitude = Number(fixedLocation?.latitude);
  const longitude = Number(fixedLocation?.longitude);
  if (
    !input
    || !Number.isInteger(input.version)
    || !["fixed", "live"].includes(input.locationMode)
    || typeof fixedLocation?.name !== "string"
    || !fixedLocation.name.trim()
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    throw new Error("開發控制台回傳了無效的定位設定");
  }
  return {
    version: input.version,
    locationMode: input.locationMode,
    fixedLocation: {
      name: fixedLocation.name.trim(),
      latitude,
      longitude
    }
  };
}

function getAuthMode() {
  return process.env.EXPO_PUBLIC_AUTH_MODE
    || Constants.expoConfig?.extra?.authMode
    || Constants.manifest2?.extra?.expoClient?.extra?.authMode
    || "firebase";
}

function isDevelopmentBuild() {
  return typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";
}

function isValidUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
}
