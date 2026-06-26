// Prototype only, not final API contract.
// This uses browser localStorage when available so prototype data can survive refreshes.
// It is not a production database and is not shared across devices or users.

const STORAGE_KEY = "drinkGroupBuy.mobilePrototypeState.v1";
const RESET_PREFIX = "drinkGroupBuy.mobilePrototypeReset.";

function getLocalStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPrototypeState() {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (!rawValue) return null;
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

export function savePrototypeState(state) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Prototype persistence should never break the app screen flow.
  }
}

export function clearPrototypeState() {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Prototype cleanup should never break the app screen flow.
  }
}

export function clearPrototypeStateOnce(resetKey) {
  const storage = getLocalStorage();
  if (!storage) return;

  const markerKey = `${RESET_PREFIX}${resetKey}`;
  try {
    if (storage.getItem(markerKey)) return;
    storage.removeItem(STORAGE_KEY);
    storage.setItem(markerKey, "1");
  } catch {
    // Prototype cleanup should never break the app screen flow.
  }
}
