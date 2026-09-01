import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "drinkgroupbuy.authSession";

// expo-secure-store has no real (encrypted) backing on web -- and a browser tab's JS memory
// doesn't survive a page reload either way, so there's nothing to gain by persisting there.
// This project is Android-first (see AGENTS.md); web simply keeps its existing behavior of
// asking for login on every reload.
const persistenceEnabled = Platform.OS !== "web";

export async function saveAuthSession({ token, user }) {
  if (!persistenceEnabled || !token || !user) return;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ token, user }));
  } catch {
    // Best-effort -- failing to persist only means the next app launch asks for login again,
    // not a broken session right now.
  }
}

export async function loadAuthSession() {
  if (!persistenceEnabled) return null;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearAuthSession() {
  if (!persistenceEnabled) return;
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Already gone or inaccessible -- nothing further to do.
  }
}
