"use strict";

// State management for the dev-only location/business-time test console (formerly a separate
// process at local-dev-console/, now mounted under /dev-console in backend/server.js -- see
// that file for the HTTP routing and the "why merged" note). Ported with minimal changes from
// local-dev-console/server.js; this module only holds pure state/validation logic, matching the
// rest of this codebase's pattern of keeping route dispatch in server.js and domain logic in a
// dedicated module.

const path = require("node:path");
const { promises: fs } = require("node:fs");
const { PaymentServiceError } = require("../payments/linePayService");

const DATA_DIRECTORY = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIRECTORY, "dev-console-state.json");
const MAX_EVENTS = 100;

let runtimeState;
let persistQueue = Promise.resolve();

function createDefaultConfig(now = new Date().toISOString()) {
  return {
    version: 1,
    locationMode: "fixed",
    fixedLocation: {
      name: "台中科大門口",
      latitude: 24.14972,
      longitude: 120.68393
    },
    updatedAt: now
  };
}

function createDefaultState() {
  const now = new Date().toISOString();
  return {
    config: createDefaultConfig(now),
    customerConfigs: {},
    appReport: null,
    events: [
      {
        id: `${Date.now()}-created`,
        type: "console_initialized",
        message: "建立本機控制台預設設定",
        createdAt: now
      }
    ]
  };
}

async function loadDevConsoleState() {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    runtimeState = {
      config: normalizeStoredConfig(parsed.config),
      customerConfigs: normalizeStoredCustomerConfigs(parsed.customerConfigs, parsed.config),
      appReport: parsed.appReport || null,
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_EVENTS) : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Unable to read dev console state; using defaults:", error.message);
    }
    runtimeState = createDefaultState();
    await fs.writeFile(STATE_FILE, `${JSON.stringify(runtimeState, null, 2)}\n`, "utf8");
  }
  return runtimeState;
}

function normalizeStoredConfig(input = {}) {
  const fallback = createDefaultConfig();
  const fixedLocation = input.fixedLocation || {};
  return {
    version: Number.isInteger(input.version) && input.version > 0 ? input.version : fallback.version,
    locationMode: input.locationMode === "live" ? "live" : "fixed",
    fixedLocation: {
      name: typeof fixedLocation.name === "string" && fixedLocation.name.trim()
        ? fixedLocation.name.trim()
        : fallback.fixedLocation.name,
      latitude: isCoordinate(fixedLocation.latitude, -90, 90)
        ? Number(fixedLocation.latitude)
        : fallback.fixedLocation.latitude,
      longitude: isCoordinate(fixedLocation.longitude, -180, 180)
        ? Number(fixedLocation.longitude)
        : fallback.fixedLocation.longitude
    },
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : fallback.updatedAt
  };
}

function normalizeCustomerId(value) {
  const userId = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:-]{1,100}$/.test(userId) ? userId : null;
}

function requireCustomerId(value) {
  const userId = normalizeCustomerId(value);
  if (!userId) throw new PaymentServiceError(400, { error: "userId 必須是有效的顧客帳號 ID" });
  return userId;
}

function normalizeStoredCustomerConfigs(input, fallbackInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const fallback = normalizeStoredConfig(fallbackInput);
  return Object.fromEntries(Object.entries(input).flatMap(([userId, config]) => {
    const normalizedUserId = normalizeCustomerId(userId);
    return normalizedUserId ? [[normalizedUserId, normalizeStoredConfig({ ...fallback, ...config })]] : [];
  }));
}

function getCustomerConfig(userId) {
  return userId && runtimeState.customerConfigs[userId]
    ? runtimeState.customerConfigs[userId]
    : runtimeState.config;
}

function validateConfigInput(input) {
  if (!input || typeof input !== "object") {
    throw new PaymentServiceError(400, { error: "設定內容必須是 JSON object" });
  }
  if (!new Set(["fixed", "live"]).has(input.locationMode)) {
    throw new PaymentServiceError(400, { error: "locationMode 只能是 fixed 或 live" });
  }

  const fixedLocation = input.fixedLocation;
  if (!fixedLocation || typeof fixedLocation !== "object") {
    throw new PaymentServiceError(400, { error: "fixedLocation 為必填" });
  }
  const name = typeof fixedLocation.name === "string" ? fixedLocation.name.trim() : "";
  if (!name || name.length > 80) {
    throw new PaymentServiceError(400, { error: "固定位置名稱必須是 1 至 80 個字元" });
  }
  if (!isCoordinate(fixedLocation.latitude, -90, 90)) {
    throw new PaymentServiceError(400, { error: "緯度必須介於 -90 到 90" });
  }
  if (!isCoordinate(fixedLocation.longitude, -180, 180)) {
    throw new PaymentServiceError(400, { error: "經度必須介於 -180 到 180" });
  }

  return {
    locationMode: input.locationMode,
    fixedLocation: {
      name,
      latitude: Number(fixedLocation.latitude),
      longitude: Number(fixedLocation.longitude)
    }
  };
}

function isCoordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

function configValuesEqual(left, right) {
  return left.locationMode === right.locationMode
    && left.fixedLocation.name === right.fixedLocation.name
    && left.fixedLocation.latitude === right.fixedLocation.latitude
    && left.fixedLocation.longitude === right.fixedLocation.longitude;
}

function addEvent(type, message) {
  runtimeState.events.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: new Date().toISOString()
  });
  runtimeState.events = runtimeState.events.slice(0, MAX_EVENTS);
}

function persistState() {
  persistQueue = persistQueue.then(() => fs.writeFile(
    STATE_FILE,
    `${JSON.stringify(runtimeState, null, 2)}\n`,
    "utf8"
  ));
  return persistQueue;
}

function getDevConsoleState() {
  return runtimeState;
}

async function updateCustomerConfig(input) {
  const userId = requireCustomerId(input.userId);
  const nextValues = validateConfigInput(input);
  const currentConfig = getCustomerConfig(userId);
  if (!configValuesEqual(currentConfig, nextValues)) {
    runtimeState.customerConfigs[userId] = {
      ...nextValues,
      version: currentConfig.version + 1,
      updatedAt: new Date().toISOString()
    };
    addEvent("config_updated", `顧客 ${userId}：${nextValues.locationMode}；固定位置：${nextValues.fixedLocation.name}`);
    await persistState();
  }
  return { userId, config: getCustomerConfig(userId) };
}

async function resetCustomerConfig(input) {
  const userId = requireCustomerId(input.userId);
  const currentConfig = getCustomerConfig(userId);
  runtimeState.customerConfigs[userId] = {
    ...createDefaultConfig(),
    version: currentConfig.version + 1,
    updatedAt: new Date().toISOString()
  };
  addEvent("config_reset", `顧客 ${userId} 的定位已恢復為台中科大固定位置`);
  await persistState();
  return { userId, config: runtimeState.customerConfigs[userId] };
}

function normalizeAppReport(input) {
  if (!input || typeof input !== "object") {
    throw new PaymentServiceError(400, { error: "App 回報內容必須是 JSON object" });
  }
  const appliedVersion = Number(input.appliedVersion);
  if (!Number.isInteger(appliedVersion) || appliedVersion < 0) {
    throw new PaymentServiceError(400, { error: "appliedVersion 必須是非負整數" });
  }
  const roles = Array.isArray(input.user?.roles)
    ? input.user.roles.filter((role) => ["customer", "merchant", "admin"].includes(role))
    : [];
  return {
    appliedVersion,
    locationMode: input.locationMode === "live" ? "live" : "fixed",
    locationPermission: typeof input.locationPermission === "string"
      ? input.locationPermission.slice(0, 40)
      : "unknown",
    user: input.user && typeof input.user === "object"
      ? {
          id: String(input.user.id || "").slice(0, 100),
          displayName: String(input.user.displayName || "").slice(0, 100),
          roles
        }
      : null,
    reportedAt: new Date().toISOString()
  };
}

async function recordAppReport(input) {
  const report = normalizeAppReport(input);
  runtimeState.appReport = report;
  addEvent(
    "app_reported",
    `App 回報帳號 ${report.user?.displayName || report.user?.id || "未知"}，已套用版本 ${report.appliedVersion}`
  );
  await persistState();
  return runtimeState.appReport;
}

async function recordBusinessTimeUpdate(businessTime) {
  addEvent("business_time_updated", `全域業務時間：${businessTime.mode}；目前 ${businessTime.effectiveNow}`);
  await persistState();
}

function toConsoleAccount(user) {
  const allowedRoles = ["customer", "merchant", "admin"];
  return {
    id: String(user?.id || "").slice(0, 100),
    label: String(user?.label || user?.displayName || user?.loginName || user?.id || "未命名帳號").slice(0, 160),
    loginName: String(user?.loginName || "").slice(0, 100),
    email: String(user?.email || "").slice(0, 160),
    displayName: String(user?.displayName || "").slice(0, 100),
    primaryRole: allowedRoles.includes(user?.primaryRole) ? user.primaryRole : "unknown",
    roles: Array.isArray(user?.roles)
      ? user.roles.filter((role) => allowedRoles.includes(role))
      : [],
    merchantStores: Array.isArray(user?.merchantStores)
      ? user.merchantStores.map((store) => ({
          id: String(store?.id || "").slice(0, 100),
          name: String(store?.name || "").slice(0, 120),
          permissionLevel: String(store?.permissionLevel || "").slice(0, 60)
        }))
      : []
  };
}

function normalizeCustomerIdOrNull(value) {
  return normalizeCustomerId(value);
}

module.exports = {
  loadDevConsoleState,
  getDevConsoleState,
  getCustomerConfig,
  updateCustomerConfig,
  resetCustomerConfig,
  recordAppReport,
  recordBusinessTimeUpdate,
  toConsoleAccount,
  normalizeCustomerId: normalizeCustomerIdOrNull
};
