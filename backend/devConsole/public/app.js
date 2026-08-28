const presets = {
  nutc: { name: "台中科大門口", latitude: 24.14972, longitude: 120.68393 },
  yizhong: { name: "一中商圈", latitude: 24.15091, longitude: 120.68536 },
  "taichung-station": { name: "台中火車站", latitude: 24.13683, longitude: 120.68501 },
  "far-away": { name: "遠離測試店家的位置", latitude: 24.1792, longitude: 120.6467 }
};
const presetOptions = [
  ["nutc", "台中科大門口"], ["yizhong", "一中商圈"],
  ["taichung-station", "台中火車站"], ["far-away", "遠離店家"], ["custom", "自訂座標"]
];
const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  consoleStatus: document.querySelector("#consoleStatus"), consoleMeta: document.querySelector("#consoleMeta"),
  backendStatus: document.querySelector("#backendStatus"), backendMeta: document.querySelector("#backendMeta"),
  appStatus: document.querySelector("#appStatus"), appMeta: document.querySelector("#appMeta"),
  message: document.querySelector("#message"), accountCount: document.querySelector("#accountCount"),
  accountsMessage: document.querySelector("#accountsMessage"), accountsTableWrap: document.querySelector("#accountsTableWrap"),
  accountsTableBody: document.querySelector("#accountsTableBody"), eventList: document.querySelector("#eventList"),
  businessTimeForm: document.querySelector("#businessTimeForm"),
  businessTimeBadge: document.querySelector("#businessTimeBadge"),
  offsetField: document.querySelector("#offsetField"), offsetMinutes: document.querySelector("#offsetMinutes"),
  fixedField: document.querySelector("#fixedField"), fixedNow: document.querySelector("#fixedNow"),
  effectiveBusinessTime: document.querySelector("#effectiveBusinessTime"),
  realBusinessTime: document.querySelector("#realBusinessTime"),
  resetBusinessTimeButton: document.querySelector("#resetBusinessTimeButton")
};
let defaultConfig = null;
let customerConfigs = {};

async function requestJson(url, options = {}) {
  // This page used to be its own server at port 3100 with its own /api/* root; merged into the
  // main backend under /dev-console so every call here needs that prefix, but call sites below
  // still just pass their original path (e.g. "/api/status") -- adding the prefix here once
  // means none of them had to change.
  const response = await fetch(`/dev-console${url}`, { ...options, headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

async function refreshAll({ preserveDirtyForms = true } = {}) {
  elements.refreshButton.disabled = true;
  try {
    const [statusBody, accountsBody, configsBody, eventsBody, businessTimeBody] = await Promise.all([
      requestJson("/api/status"), requestJson("/api/accounts"), requestJson("/api/config"), requestJson("/api/events"),
      requestJson("/api/business-time")
    ]);
    renderStatus(statusBody);
    defaultConfig = configsBody.config;
    customerConfigs = configsBody.customerConfigs || {};
    if (!preserveDirtyForms || !document.querySelector(".account-location-form.is-dirty")) renderAccounts(accountsBody, statusBody.appReport);
    if (!preserveDirtyForms || !elements.businessTimeForm.classList.contains("is-dirty")) {
      renderBusinessTime(businessTimeBody.businessTime);
    }
    renderEvents(eventsBody.events);
  } catch (error) {
    showMessage(`無法更新控制台：${error.message}`, true);
    elements.consoleStatus.textContent = "無法連線";
    setStatusTone(elements.consoleStatus, "error");
  } finally { elements.refreshButton.disabled = false; }
}

function renderBusinessTime(businessTime) {
  if (!businessTime) return;
  const selectedMode = elements.businessTimeForm.querySelector(
    `input[name="businessTimeMode"][value="${businessTime.mode}"]`
  );
  if (selectedMode) selectedMode.checked = true;
  elements.offsetMinutes.value = businessTime.offsetMinutes || 60;
  elements.fixedNow.value = toDateTimeLocalValue(businessTime.fixedNow || businessTime.effectiveNow);
  elements.effectiveBusinessTime.textContent = formatFullDate(businessTime.effectiveNow);
  elements.realBusinessTime.textContent = formatFullDate(businessTime.realNow);
  elements.businessTimeBadge.textContent = businessTime.simulated
    ? `模擬中 · ${businessTime.mode === "fixed" ? "固定" : "位移"}`
    : "真實時間";
  elements.businessTimeBadge.classList.toggle("warning", businessTime.simulated);
  elements.businessTimeForm.classList.remove("is-dirty");
  updateBusinessTimeFields();
}

function updateBusinessTimeFields() {
  const mode = elements.businessTimeForm.querySelector('input[name="businessTimeMode"]:checked')?.value || "real";
  elements.offsetField.hidden = mode !== "offset";
  elements.fixedField.hidden = mode !== "fixed";
}

async function saveBusinessTime(event) {
  event.preventDefault();
  const mode = elements.businessTimeForm.querySelector('input[name="businessTimeMode"]:checked')?.value || "real";
  const payload = { mode };
  if (mode === "offset") payload.offsetMinutes = Number(elements.offsetMinutes.value);
  if (mode === "fixed") {
    const fixedDate = new Date(elements.fixedNow.value);
    if (Number.isNaN(fixedDate.getTime())) {
      showMessage("請輸入有效的固定日期時間", true);
      return;
    }
    payload.fixedNow = fixedDate.toISOString();
  }

  setBusinessTimeBusy(true);
  try {
    const result = await requestJson("/api/business-time", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    renderBusinessTime(result.businessTime);
    showMessage(`已套用全域業務時間：${formatFullDate(result.businessTime.effectiveNow)}`);
    await refreshAll({ preserveDirtyForms: false });
  } catch (error) {
    showMessage(`時間設定失敗：${error.message}`, true);
  } finally {
    setBusinessTimeBusy(false);
  }
}

async function resetBusinessTime() {
  setBusinessTimeBusy(true);
  try {
    const result = await requestJson("/api/business-time", {
      method: "PUT",
      body: JSON.stringify({ mode: "real" })
    });
    renderBusinessTime(result.businessTime);
    showMessage("已恢復真實時間");
    await refreshAll({ preserveDirtyForms: false });
  } catch (error) {
    showMessage(`恢復失敗：${error.message}`, true);
  } finally {
    setBusinessTimeBusy(false);
  }
}

function setBusinessTimeBusy(isBusy) {
  elements.businessTimeForm.querySelectorAll("button, input").forEach((control) => {
    control.disabled = isBusy;
  });
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatFullDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date);
}

function renderStatus(body) {
  elements.consoleStatus.textContent = body.console?.ok ? "運作中" : "異常";
  elements.consoleMeta.textContent = body.console ? `${body.console.host}:${body.console.port} · 僅限本機` : "無狀態資料";
  setStatusTone(elements.consoleStatus, body.console?.ok ? "ok" : "error");
  elements.backendStatus.textContent = body.backend?.ok ? "已連線" : "未連線";
  elements.backendMeta.textContent = body.backend?.ok ? `${body.backend.service || "Backend"} · ${body.backend.url}` : `${body.backend?.url || "Backend"} · ${body.backend?.error || "未知錯誤"}`;
  setStatusTone(elements.backendStatus, body.backend?.ok ? "ok" : "warning");
  renderAppReport(body.appReport, body.configVersion);
}

function renderAppReport(report, configVersion) {
  if (!report) {
    elements.appStatus.textContent = "尚未串接";
    elements.appMeta.textContent = "定位設定已依顧客分開；等待 Mobile 回報";
    setStatusTone(elements.appStatus, "warning");
    return;
  }
  const isCurrent = report.appliedVersion === configVersion;
  elements.appStatus.textContent = isCurrent ? "已套用" : "等待更新";
  elements.appMeta.textContent = `App ${report.appliedVersion}／帳號設定 ${configVersion} · ${formatDate(report.reportedAt)}`;
  setStatusTone(elements.appStatus, isCurrent ? "ok" : "warning");
}

function renderAccounts(body, appReport) {
  elements.accountsTableBody.replaceChildren();
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  elements.accountCount.textContent = `${accounts.length} 個帳號`;
  if (!body.ok || accounts.length === 0) {
    elements.accountsMessage.hidden = false;
    elements.accountsMessage.textContent = body.ok ? "目前沒有有效的測試帳號" : `目前無法讀取帳號：${body.error || "未知錯誤"}`;
    elements.accountsTableWrap.hidden = true;
    return;
  }
  elements.accountsMessage.hidden = true;
  elements.accountsTableWrap.hidden = false;
  accounts.forEach((account) => {
    const row = document.createElement("tr");
    const isCustomer = account.roles?.includes("customer");
    row.classList.add(`account-row-${account.primaryRole || "unknown"}`);
    if (appReport?.user?.id === account.id) row.classList.add("current-row");
    row.append(
      createAccountCell("模擬帳號名稱", account.label, account.id === appReport?.user?.id ? "目前 App" : null),
      createAccountCell("帳號資料", account.displayName || account.loginName || "未提供", account.email || account.id),
      createRolesCell(account.roles), createStoresCell(account.merchantStores),
      isCustomer ? createLocationCell(account, resolveCustomerConfig(account.id)) : createAccountCell("顧客定位方式", "—", account.roles?.includes("merchant") ? "商家不使用定位設定" : "不適用")
    );
    elements.accountsTableBody.append(row);
  });
}
function createAccountCell(label, primary, secondary) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  const strong = document.createElement("strong");
  strong.textContent = primary;
  cell.append(strong);
  if (secondary) {
    const small = document.createElement("small");
    small.textContent = secondary;
    cell.append(small);
  }
  return cell;
}

function createRolesCell(roles) {
  const cell = document.createElement("td");
  cell.dataset.label = "權限";
  const list = document.createElement("div");
  list.className = "role-list";
  (roles?.length ? roles : ["unknown"]).forEach((role) => {
    const tag = document.createElement("span");
    tag.className = `role-tag role-tag-${role}`;
    tag.textContent = roleLabel(role);
    list.append(tag);
  });
  cell.append(list);
  return cell;
}

function createStoresCell(stores) {
  const text = stores?.length
    ? stores.map((store) => `${store.name || store.id}${store.permissionLevel ? `（${store.permissionLevel}）` : ""}`).join("、")
    : "不適用";
  return createAccountCell("商家店家", text, null);
}

function createInput(type, ariaLabel) {
  const input = document.createElement("input");
  input.type = type;
  input.setAttribute("aria-label", ariaLabel);
  return input;
}

function createCompactField(labelText, control, extraClass = "") {
  const label = document.createElement("label");
  label.className = `compact-field ${extraClass}`.trim();
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function createLocationCell(account, config) {
  const cell = document.createElement("td");
  cell.dataset.label = "顧客定位方式";
  cell.className = "location-cell";
  const form = document.createElement("form");
  form.className = "account-location-form";
  form.dataset.userId = account.id;
  form.dataset.accountLabel = account.displayName || account.loginName || account.id;

  const modeSwitch = document.createElement("fieldset");
  modeSwitch.className = "inline-mode-switch";
  const legend = document.createElement("legend");
  legend.className = "sr-only";
  legend.textContent = `${form.dataset.accountLabel}定位方式`;
  modeSwitch.append(legend);
  [["fixed", "固定位置"], ["live", "即時位置"]].forEach(([value, text]) => {
    const label = document.createElement("label");
    label.className = "inline-mode-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `locationMode-${account.id}`;
    radio.value = value;
    radio.checked = config.locationMode === value;
    const span = document.createElement("span");
    span.textContent = text;
    label.append(radio, span);
    modeSwitch.append(label);
  });

  const presetSelect = document.createElement("select");
  presetSelect.className = "location-preset";
  presetSelect.setAttribute("aria-label", `${form.dataset.accountLabel}位置預設`);
  presetOptions.forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    presetSelect.append(option);
  });
  presetSelect.value = findPreset(config.fixedLocation);

  const nameInput = createInput("text", "位置名稱");
  nameInput.className = "location-name";
  nameInput.maxLength = 80;
  nameInput.required = true;
  nameInput.value = config.fixedLocation.name;
  const latitudeInput = createInput("number", "緯度");
  latitudeInput.className = "location-latitude";
  latitudeInput.min = "-90";
  latitudeInput.max = "90";
  latitudeInput.step = "0.000001";
  latitudeInput.required = true;
  latitudeInput.value = config.fixedLocation.latitude;
  const longitudeInput = createInput("number", "經度");
  longitudeInput.className = "location-longitude";
  longitudeInput.min = "-180";
  longitudeInput.max = "180";
  longitudeInput.step = "0.000001";
  longitudeInput.required = true;
  longitudeInput.value = config.fixedLocation.longitude;

  const customFields = document.createElement("div");
  customFields.className = "custom-location-fields";
  customFields.append(createCompactField("名稱", nameInput, "custom-location-name"), createCompactField("緯度", latitudeInput), createCompactField("經度", longitudeInput));
  const summary = document.createElement("div");
  summary.className = "inline-location-summary";
  const summaryText = document.createElement("span");
  const mapLink = document.createElement("a");
  mapLink.target = "_blank";
  mapLink.rel = "noreferrer";
  mapLink.textContent = "地圖";
  summary.append(summaryText, mapLink);

  const actions = document.createElement("div");
  actions.className = "inline-location-actions";
  const saveButton = document.createElement("button");
  saveButton.className = "button button-primary button-compact";
  saveButton.type = "submit";
  saveButton.textContent = "套用";
  const resetButton = document.createElement("button");
  resetButton.className = "button button-secondary button-compact";
  resetButton.type = "button";
  resetButton.textContent = "預設";
  actions.append(saveButton, resetButton);

  form.locationControls = { presetSelect, nameInput, latitudeInput, longitudeInput, customFields, summaryText, mapLink, saveButton, resetButton, version: config.version };
  form.append(modeSwitch, presetSelect, customFields, summary, actions);
  presetSelect.addEventListener("change", () => {
    const preset = presets[presetSelect.value];
    if (preset) {
      nameInput.value = preset.name;
      latitudeInput.value = preset.latitude;
      longitudeInput.value = preset.longitude;
    }
    updateLocationForm(form, true);
  });
  form.addEventListener("input", (event) => {
    if ([nameInput, latitudeInput, longitudeInput].includes(event.target)) presetSelect.value = "custom";
    updateLocationForm(form, true);
  });
  form.addEventListener("submit", (event) => saveLocationConfig(event, form));
  resetButton.addEventListener("click", () => resetLocationConfig(form));
  updateLocationForm(form, false);
  cell.append(form);
  return cell;
}

function resolveCustomerConfig(userId) {
  return customerConfigs[userId] || defaultConfig || { version: 1, locationMode: "fixed", fixedLocation: presets.nutc };
}

function findPreset(location) {
  const match = Object.entries(presets).find(([, preset]) => preset.name === location.name
    && preset.latitude === Number(location.latitude) && preset.longitude === Number(location.longitude));
  return match?.[0] || "custom";
}

function updateLocationForm(form, markDirty) {
  const controls = form.locationControls;
  const mode = form.querySelector('input[type="radio"]:checked')?.value || "fixed";
  controls.customFields.hidden = controls.presetSelect.value !== "custom";
  const locationName = controls.nameInput.value || "未命名位置";
  controls.summaryText.textContent = mode === "live"
    ? `即時 GPS · 備援：${locationName} · v${controls.version}`
    : `固定：${locationName} · v${controls.version}`;
  const latitude = Number(controls.latitudeInput.value);
  const longitude = Number(controls.longitudeInput.value);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    controls.mapLink.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
    controls.mapLink.removeAttribute("aria-disabled");
  } else {
    controls.mapLink.href = "#";
    controls.mapLink.setAttribute("aria-disabled", "true");
  }
  if (markDirty) form.classList.add("is-dirty");
}

async function saveLocationConfig(event, form) {
  event.preventDefault();
  const controls = form.locationControls;
  setFormBusy(form, true);
  try {
    const body = await requestJson("/api/config", {
      method: "PUT",
      body: JSON.stringify({
        userId: form.dataset.userId,
        locationMode: form.querySelector('input[type="radio"]:checked')?.value,
        fixedLocation: { name: controls.nameInput.value, latitude: Number(controls.latitudeInput.value), longitude: Number(controls.longitudeInput.value) }
      })
    });
    form.classList.remove("is-dirty");
    showMessage(`已保存 ${form.dataset.accountLabel} 的定位設定，版本 ${body.config.version}`);
    await refreshAll({ preserveDirtyForms: false });
  } catch (error) { showMessage(`保存失敗：${error.message}`, true); }
  finally { setFormBusy(form, false); }
}

async function resetLocationConfig(form) {
  if (!window.confirm(`要將 ${form.dataset.accountLabel} 恢復為台中科大固定位置嗎？`)) return;
  setFormBusy(form, true);
  try {
    const body = await requestJson("/api/config/reset", { method: "POST", body: JSON.stringify({ userId: form.dataset.userId }) });
    form.classList.remove("is-dirty");
    showMessage(`已恢復 ${form.dataset.accountLabel} 的預設定位，版本 ${body.config.version}`);
    await refreshAll({ preserveDirtyForms: false });
  } catch (error) { showMessage(`恢復失敗：${error.message}`, true); }
  finally { setFormBusy(form, false); }
}

function setFormBusy(form, isBusy) {
  form.locationControls.saveButton.disabled = isBusy;
  form.locationControls.resetButton.disabled = isBusy;
}

function roleLabel(role) {
  return ({ customer: "顧客", merchant: "商家", admin: "管理員" })[role] || "未知";
}
function renderEvents(events) {
  elements.eventList.replaceChildren();
  if (!events?.length) {
    const item = document.createElement("li");
    item.className = "empty-state";
    item.textContent = "目前沒有操作紀錄";
    elements.eventList.append(item);
    return;
  }
  events.slice(0, 20).forEach((event) => {
    const item = document.createElement("li");
    item.className = "event-item";
    const time = document.createElement("div");
    time.className = "event-time";
    time.textContent = formatDate(event.createdAt);
    const message = document.createElement("div");
    message.className = "event-message";
    message.textContent = event.message;
    item.append(time, message);
    elements.eventList.append(item);
  });
}

function setStatusTone(element, tone) {
  element.classList.remove("ok", "warning", "error");
  element.classList.add(tone);
}

function showMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.hidden = false;
  elements.message.classList.toggle("error", isError);
  window.clearTimeout(showMessage.timeoutId);
  showMessage.timeoutId = window.setTimeout(() => { elements.message.hidden = true; }, 5000);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).format(date);
}

elements.refreshButton.addEventListener("click", () => refreshAll({ preserveDirtyForms: false }));
elements.businessTimeForm.addEventListener("input", () => {
  elements.businessTimeForm.classList.add("is-dirty");
  updateBusinessTimeFields();
});
elements.businessTimeForm.addEventListener("submit", saveBusinessTime);
elements.resetBusinessTimeButton.addEventListener("click", resetBusinessTime);
refreshAll({ preserveDirtyForms: false });
window.setInterval(() => refreshAll({ preserveDirtyForms: true }), 5000);
