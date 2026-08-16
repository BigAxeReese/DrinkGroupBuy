const realSnapshot = Object.freeze({
  mode: "real",
  offsetMinutes: 0,
  fixedNow: null,
  simulated: false,
  effectiveNow: null,
  realNow: null,
  updatedAt: null,
  version: 0,
});

let currentSnapshot = realSnapshot;
let appliedAtMs = Date.now();

export function applyBusinessTimeSnapshot(input) {
  const snapshot = normalizeBusinessTimeSnapshot(input);
  currentSnapshot = snapshot;
  appliedAtMs = Date.now();
  return snapshot;
}

export function resetBusinessTimeSnapshot() {
  currentSnapshot = realSnapshot;
  appliedAtMs = Date.now();
  return currentSnapshot;
}

export function getBusinessNow() {
  if (currentSnapshot.mode === "fixed") {
    return new Date(currentSnapshot.fixedNow);
  }
  if (currentSnapshot.effectiveNow) {
    return new Date(Date.parse(currentSnapshot.effectiveNow) + (Date.now() - appliedAtMs));
  }
  return new Date();
}

export function getBusinessTimeSnapshot() {
  return currentSnapshot;
}

function normalizeBusinessTimeSnapshot(input) {
  const mode = input?.mode;
  const effectiveNow = parseIso(input?.effectiveNow);
  const realNow = parseIso(input?.realNow);
  if (!["real", "offset", "fixed"].includes(mode) || !effectiveNow || !realNow) {
    throw new Error("後端回傳了無效的業務時間設定");
  }

  const fixedNow = mode === "fixed" ? parseIso(input.fixedNow) : null;
  if (mode === "fixed" && !fixedNow) {
    throw new Error("後端固定業務時間無效");
  }

  return {
    mode,
    offsetMinutes: Number.isInteger(input.offsetMinutes) ? input.offsetMinutes : 0,
    fixedNow,
    simulated: mode !== "real",
    effectiveNow,
    realNow,
    updatedAt: parseIso(input.updatedAt),
    version: Number.isInteger(input.version) ? input.version : 0,
  };
}

function parseIso(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
