import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Remembers the light/dark choice between launches. It is a display preference, not a secret, but
// expo-secure-store is already the app's native key-value store (authSession.js), so no new package is
// needed; the browser preview uses localStorage instead.
const STORAGE_KEY = "drinkgroupbuy.themeMode";

function isMode(value) {
  return value === "light" || value === "dark";
}

export async function loadThemeMode() {
  try {
    const value = Platform.OS === "web"
      ? globalThis?.localStorage?.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
    return isMode(value) ? value : null;
  } catch {
    // A failed read is treated as "no saved choice": the theme falls back to the phone's own setting,
    // which is a safe default for a display preference (nothing else depends on this value).
    return null;
  }
}

export async function saveThemeMode(mode) {
  if (!isMode(mode)) return;
  try {
    if (Platform.OS === "web") {
      globalThis?.localStorage?.setItem(STORAGE_KEY, mode);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, mode);
  } catch {
    // Best effort: failing to save only means the next launch starts from the system setting again.
  }
}
