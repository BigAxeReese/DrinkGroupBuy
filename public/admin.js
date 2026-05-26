const state = {
  shops: [],
  groupBuys: [],
  selectedId: null,
  promotionRows: []
};

const elements = {
  refreshButton: document.querySelector("#refreshButton"),
  metrics: document.querySelector("#metrics"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  groupList: document.querySelector("#groupList"),
  emptyDetail: document.querySelector("#emptyDetail"),
  detailLayout: document.querySelector("#detailLayout"),
  detailShop: document.querySelector("#detailShop"),
  detailTitle: document.querySelector("#detailTitle"),
  detailStatus: document.querySelector("#detailStatus"),
  detailTotals: document.querySelector("#detailTotals"),
  progressText: document.querySelector("#progressText"),
  discountText: document.querySelector("#discountText"),
  progressFill: document.querySelector("#progressFill"),
  recordMeta: document.querySelector("#recordMeta"),
  editForm: document.querySelector("#editForm"),
  titleInput: document.querySelector("#titleInput"),
  shopInput: document.querySelector("#shopInput"),
  shopEditHint: document.querySelector("#shopEditHint"),
  createdByInput: document.querySelector("#createdByInput"),
  deadlineInput: document.querySelector("#deadlineInput"),
  statusInput: document.querySelector("#statusInput"),
  cancelReasonField: document.querySelector("#cancelReasonField"),
  cancelReasonInput: document.querySelector("#cancelReasonInput"),
  noteInput: document.querySelector("#noteInput"),
  addPromotionButton: document.querySelector("#addPromotionButton"),
  promotionList: document.querySelector("#promotionList"),
  formMessage: document.querySelector("#formMessage"),
  participantList: document.querySelector("#participantList")
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toLocalDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "request failed");
  }
  return payload;
}

function getStatusKey(groupBuy) {
  return groupBuy.displayStatus || groupBuy.status;
}

function getStatusLabel(groupBuy) {
  const statusLabels = {
    open: "開放揪團",
    receiving: "接單中",
    completed: "已完成",
    cancelled: "已取消"
  };
  return statusLabels[getStatusKey(groupBuy)] || groupBuy.status;
}

function getFallbackPromotionRows(groupBuy) {
  const promotions = groupBuy.promotions && groupBuy.promotions.length
    ? groupBuy.promotions
    : groupBuy.shop && groupBuy.shop.promotions
      ? groupBuy.shop.promotions
      : [];

  return promotions
    .map((promotion) => ({
      targetType: promotion.targetType || "cups",
      targetValue: Number(promotion.targetValue),
      rewardValue: Number(promotion.rewardValue)
    }));
}

function renderMetrics() {
  const statusCounts = state.groupBuys.reduce(
    (counts, groupBuy) => {
      counts[getStatusKey(groupBuy)] += 1;
      return counts;
    },
    { open: 0, receiving: 0, completed: 0, cancelled: 0 }
  );

  elements.metrics.innerHTML = `
    <div><span>全部</span><strong>${state.groupBuys.length}</strong></div>
    <div><span>進行中</span><strong>${statusCounts.open + statusCounts.receiving}</strong></div>
    <div><span>已完成</span><strong>${statusCounts.completed}</strong></div>
    <div><span>已取消</span><strong>${statusCounts.cancelled}</strong></div>
  `;
}

function renderGroupList() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const groupBuys = state.groupBuys
    .filter((groupBuy) => status === "all" || getStatusKey(groupBuy) === status)
    .filter((groupBuy) => {
      if (!query) {
        return true;
      }
      return [groupBuy.title, groupBuy.shopName, groupBuy.createdBy]
        .some((value) => String(value || "").toLowerCase().includes(query));
    })
    .slice()
    .reverse();

  if (!groupBuys.length) {
    elements.groupList.innerHTML = '<p class="empty-copy">找不到符合條件的團購。</p>';
    return;
  }

  elements.groupList.innerHTML = groupBuys.map((groupBuy) => `
    <button class="group-row ${groupBuy.id === state.selectedId ? "is-selected" : ""}" type="button" data-group-id="${escapeHtml(groupBuy.id)}">
      <div class="row-heading">
        <strong>${escapeHtml(groupBuy.title)}</strong>
        <span class="status-pill status-${escapeHtml(getStatusKey(groupBuy))}">${escapeHtml(getStatusLabel(groupBuy))}</span>
      </div>
      <span>${escapeHtml(groupBuy.shopName)}</span>
      <small>${formatDateTime(groupBuy.deadline)} · ${Number(groupBuy.totals.participants)} 筆訂單</small>
    </button>
  `).join("");
}

function renderPromotionRows() {
  elements.promotionList.innerHTML = state.promotionRows.map((promotion, index) => `
    <div class="promotion-row">
      <label>
        <span>門檻類型</span>
        <select class="promotion-target-type">
          <option value="cups" ${promotion.targetType !== "amount" ? "selected" : ""}>杯數</option>
          <option value="amount" ${promotion.targetType === "amount" ? "selected" : ""}>訂購金額</option>
        </select>
      </label>
      <label>
        <span>達標門檻</span>
        <input class="promotion-cups" type="number" min="1" step="1" value="${Number(promotion.targetValue)}" required>
      </label>
      <label>
        <span>折扣金額</span>
        <input class="promotion-reward" type="number" min="1" step="1" value="${Number(promotion.rewardValue)}" required>
      </label>
      <strong>${formatPromotionPreview(promotion)}</strong>
      ${state.promotionRows.length > 1 ? `<button class="remove-button" type="button" data-remove-promotion="${index}" aria-label="移除方案">×</button>` : ""}
    </div>
  `).join("");
}

function syncPromotionRows() {
  state.promotionRows = Array.from(elements.promotionList.querySelectorAll(".promotion-row")).map((row) => ({
    targetType: row.querySelector(".promotion-target-type").value,
    targetValue: Number(row.querySelector(".promotion-cups").value),
    rewardValue: Number(row.querySelector(".promotion-reward").value)
  }));
}

function formatPromotionPreview(promotion) {
  if (promotion.targetType === "amount") {
    return `滿 ${formatMoney(promotion.targetValue)} 折 ${formatMoney(promotion.rewardValue)}`;
  }

  return `平均每杯折 ${formatMoney(Number(promotion.targetValue) > 0 ? Number(promotion.rewardValue) / Number(promotion.targetValue) : 0)}`;
}

function renderParticipants(groupBuy) {
  const participants = groupBuy.participants || [];
  if (!participants.length) {
    elements.participantList.innerHTML = '<p class="empty-copy">此團購目前沒有參與訂單。</p>';
    return;
  }

  elements.participantList.innerHTML = participants.map((participant) => `
    <div class="participant-row">
      <div>
        <strong>${escapeHtml(participant.customerName)}</strong>
        <span>${escapeHtml(participant.itemName)} x ${Number(participant.quantity)}</span>
        <small>${escapeHtml(participant.sugar || "-")} / ${escapeHtml(participant.ice || "-")}${participant.note ? ` · ${escapeHtml(participant.note)}` : ""}</small>
      </div>
      <strong>${formatMoney(participant.subtotal)}</strong>
    </div>
  `).join("");
}

function renderDetail(groupBuy) {
  state.selectedId = groupBuy.id;
  elements.emptyDetail.hidden = true;
  elements.detailLayout.hidden = false;
  elements.detailShop.textContent = groupBuy.shopName;
  elements.detailTitle.textContent = groupBuy.title;
  elements.detailStatus.textContent = getStatusLabel(groupBuy);
  elements.detailStatus.className = `status-pill status-${getStatusKey(groupBuy)}`;
  elements.detailTotals.innerHTML = `
    <div><span>杯數</span><strong>${Number(groupBuy.totals.cups)}</strong></div>
    <div><span>訂單數</span><strong>${Number(groupBuy.totals.participants)}</strong></div>
    <div><span>訂購總額</span><strong>${formatMoney(groupBuy.totals.amount)}</strong></div>
    <div><span>優惠後金額</span><strong>${formatMoney(groupBuy.bestPromotion ? groupBuy.bestPromotion.finalAmount : groupBuy.totals.amount)}</strong></div>
  `;

  const promotion = groupBuy.bestPromotion || {};
  const unit = promotion.targetType === "amount" ? "元" : "杯";
  elements.progressText.textContent = promotion.targetValue
    ? `${promotion.progressValue} / ${promotion.targetValue} ${unit}`
    : "尚無可計算優惠";
  elements.discountText.textContent = promotion.isEligible
    ? `折抵 ${formatMoney(promotion.discountAmount)}`
    : promotion.targetValue
      ? `尚差 ${promotion.remainingTarget} ${unit}`
      : "-";
  elements.progressFill.style.width = `${Math.round((promotion.progressRate || 0) * 100)}%`;
  elements.recordMeta.innerHTML = `
    <div><dt>團購 ID</dt><dd>${escapeHtml(groupBuy.id)}</dd></div>
    <div><dt>建立時間</dt><dd>${formatDateTime(groupBuy.createdAt)}</dd></div>
    <div><dt>最後更新</dt><dd>${formatDateTime(groupBuy.updatedAt)}</dd></div>
    ${groupBuy.completedAt ? `<div><dt>完成時間</dt><dd>${formatDateTime(groupBuy.completedAt)}</dd></div>` : ""}
    ${groupBuy.cancelledAt ? `<div><dt>取消時間</dt><dd>${formatDateTime(groupBuy.cancelledAt)}</dd></div>` : ""}
  `;

  elements.titleInput.value = groupBuy.title;
  elements.shopInput.value = groupBuy.shopId;
  elements.shopInput.disabled = (groupBuy.participants || []).length > 0;
  elements.shopEditHint.textContent = elements.shopInput.disabled
    ? "已有訂單，為保留飲品歸屬不可變更店家。"
    : "";
  elements.createdByInput.value = groupBuy.createdBy || "";
  elements.deadlineInput.value = toLocalDateTimeInput(groupBuy.deadline);
  elements.statusInput.value = groupBuy.status;
  elements.cancelReasonInput.value = groupBuy.cancelReason || "";
  elements.noteInput.value = groupBuy.note || "";
  toggleCancelReason();

  state.promotionRows = getFallbackPromotionRows(groupBuy);
  if (!state.promotionRows.length) {
    state.promotionRows = [{ targetType: "cups", targetValue: 1, rewardValue: 1 }];
  }
  renderPromotionRows();
  renderParticipants(groupBuy);
  renderGroupList();
}

function toggleCancelReason() {
  const isCancelled = elements.statusInput.value === "cancelled";
  elements.cancelReasonField.hidden = !isCancelled;
  elements.cancelReasonInput.required = isCancelled;
}

async function selectGroupBuy(groupBuyId) {
  const groupBuy = await fetchJson(`/api/group-buys/${groupBuyId}`);
  renderDetail(groupBuy);
}

async function loadDashboard() {
  elements.formMessage.textContent = "";
  [state.shops, state.groupBuys] = await Promise.all([
    fetchJson("/api/shops"),
    fetchJson("/api/group-buys")
  ]);
  elements.shopInput.innerHTML = state.shops
    .map((shop) => `<option value="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</option>`)
    .join("");
  renderMetrics();
  renderGroupList();

  if (state.selectedId) {
    const selected = state.groupBuys.find((groupBuy) => groupBuy.id === state.selectedId);
    if (selected) {
      renderDetail(selected);
    }
  }
}

async function saveGroupBuy(event) {
  event.preventDefault();
  if (!state.selectedId) {
    return;
  }

  syncPromotionRows();
  const submitButton = elements.editForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  elements.formMessage.textContent = "";

  try {
    const groupBuy = await fetchJson(`/api/group-buys/${state.selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: elements.titleInput.value,
        shopId: elements.shopInput.value,
        createdBy: elements.createdByInput.value,
        deadline: elements.deadlineInput.value,
        status: elements.statusInput.value,
        cancelReason: elements.cancelReasonInput.value,
        note: elements.noteInput.value,
        promotionMatrix: state.promotionRows
      })
    });

    const index = state.groupBuys.findIndex((item) => item.id === groupBuy.id);
    state.groupBuys[index] = groupBuy;
    renderMetrics();
    renderDetail(groupBuy);
    elements.formMessage.textContent = "團購資訊已更新。";
  } catch (error) {
    elements.formMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

elements.refreshButton.addEventListener("click", () => {
  loadDashboard().catch((error) => {
    elements.formMessage.textContent = error.message;
  });
});
elements.searchInput.addEventListener("input", renderGroupList);
elements.statusFilter.addEventListener("change", renderGroupList);
elements.groupList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-group-id]");
  if (button) {
    selectGroupBuy(button.dataset.groupId).catch((error) => {
      elements.formMessage.textContent = error.message;
    });
  }
});
elements.statusInput.addEventListener("change", toggleCancelReason);
elements.addPromotionButton.addEventListener("click", () => {
  syncPromotionRows();
  state.promotionRows.push({ targetValue: 0, rewardValue: 0 });
  renderPromotionRows();
});
elements.promotionList.addEventListener("input", (event) => {
  if (event.target.matches(".promotion-cups, .promotion-reward")) {
    const row = event.target.closest(".promotion-row");
    row.querySelector("strong").textContent = formatPromotionPreview({
      targetType: row.querySelector(".promotion-target-type").value,
      targetValue: Number(row.querySelector(".promotion-cups").value),
      rewardValue: Number(row.querySelector(".promotion-reward").value)
    });
  }
});
elements.promotionList.addEventListener("change", (event) => {
  if (event.target.matches(".promotion-target-type")) {
    const row = event.target.closest(".promotion-row");
    row.querySelector("strong").textContent = formatPromotionPreview({
      targetType: event.target.value,
      targetValue: Number(row.querySelector(".promotion-cups").value),
      rewardValue: Number(row.querySelector(".promotion-reward").value)
    });
  }
});
elements.promotionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-promotion]");
  if (!button) {
    return;
  }
  syncPromotionRows();
  state.promotionRows.splice(Number(button.dataset.removePromotion), 1);
  renderPromotionRows();
});
elements.editForm.addEventListener("submit", saveGroupBuy);

loadDashboard().catch((error) => {
  elements.groupList.innerHTML = `<p class="empty-copy">${escapeHtml(error.message)}</p>`;
});
