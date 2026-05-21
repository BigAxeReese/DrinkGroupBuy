const state = {
  shops: [],
  groupBuys: [],
  currentGroupBuy: null,
  promotionRows: [
    { targetValue: 15, rewardValue: 90 },
    { targetValue: 30, rewardValue: 240 },
    { targetValue: 50, rewardValue: 500 }
  ]
};

const elements = {
  form: document.querySelector("#groupBuyForm"),
  titleInput: document.querySelector("#titleInput"),
  shopSelect: document.querySelector("#shopSelect"),
  promotionList: document.querySelector("#promotionList"),
  addPromotionButton: document.querySelector("#addPromotionButton"),
  createdByInput: document.querySelector("#createdByInput"),
  deadlineInput: document.querySelector("#deadlineInput"),
  noteInput: document.querySelector("#noteInput"),
  formMessage: document.querySelector("#formMessage"),
  refreshButton: document.querySelector("#refreshButton"),
  groupBuyPanel: document.querySelector("#groupBuyPanel"),
  groupTitle: document.querySelector("#groupTitle"),
  groupShop: document.querySelector("#groupShop"),
  groupPromotion: document.querySelector("#groupPromotion"),
  groupDeadline: document.querySelector("#groupDeadline"),
  groupStatus: document.querySelector("#groupStatus"),
  progressLabel: document.querySelector("#progressLabel"),
  discountLabel: document.querySelector("#discountLabel"),
  progressFill: document.querySelector("#progressFill"),
  totalCups: document.querySelector("#totalCups"),
  totalAmount: document.querySelector("#totalAmount"),
  totalParticipants: document.querySelector("#totalParticipants"),
  groupNote: document.querySelector("#groupNote"),
  groupList: document.querySelector("#groupList")
};

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "request failed");
  }

  return data;
}

function setDefaultDeadline() {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(15, 0, 0, 0);
  elements.deadlineInput.value = deadline.toISOString().slice(0, 16);
}

function renderShops() {
  elements.shopSelect.innerHTML = state.shops
    .map((shop) => `<option value="${shop.id}">${shop.name}</option>`)
    .join("");
}

function renderPromotionRows() {
  elements.promotionList.innerHTML = state.promotionRows
    .map((row, index) => {
      const average = row.targetValue > 0 ? row.rewardValue / row.targetValue : 0;
      const removeButton = state.promotionRows.length > 1
        ? `<button class="remove-button" type="button" data-remove-promotion="${index}" title="移除方案">×</button>`
        : "";

      return `
        <div class="promotion-row" data-promotion-index="${index}">
          <label>
            <span>杯數</span>
            <input class="promotion-cups" type="number" min="1" step="1" value="${row.targetValue}" inputmode="numeric" required>
          </label>
          <label>
            <span>折扣金額</span>
            <input class="promotion-discount" type="number" min="1" step="1" value="${row.rewardValue}" inputmode="numeric" required>
          </label>
          <div class="average-box">
            <span>平均每杯</span>
            <strong>${formatMoney(average)}</strong>
          </div>
          ${removeButton}
        </div>
      `;
    })
    .join("");
}

function syncPromotionRows() {
  const rows = Array.from(elements.promotionList.querySelectorAll(".promotion-row"));
  state.promotionRows = rows.map((row) => ({
    targetValue: Number(row.querySelector(".promotion-cups").value),
    rewardValue: Number(row.querySelector(".promotion-discount").value)
  }));
}

function getPromotionMatrix() {
  syncPromotionRows();

  return state.promotionRows
    .map((row) => ({
      targetValue: Number(row.targetValue),
      rewardValue: Number(row.rewardValue)
    }))
    .filter((row) => row.targetValue > 0 && row.rewardValue > 0);
}

function summarizePromotions(groupBuy) {
  const promotions = groupBuy.promotions || [];
  if (promotions.length === 0) {
    return groupBuy.promotionTitle || "-";
  }

  return promotions
    .slice()
    .sort((left, right) => left.targetValue - right.targetValue)
    .map((promotion) => `${promotion.targetValue}杯折${promotion.rewardValue}`)
    .join(" / ");
}

function renderGroupBuy(groupBuy) {
  state.currentGroupBuy = groupBuy;
  elements.groupBuyPanel.hidden = !groupBuy;

  if (!groupBuy) {
    return;
  }

  const target = groupBuy.selectedPromotion || groupBuy.bestPromotion || {};
  const progress = groupBuy.bestPromotion || {
    progressValue: groupBuy.totals.cups,
    targetValue: target.targetValue || 0,
    remainingTarget: target.targetValue || 0,
    progressRate: 0,
    discountAmount: 0,
    isEligible: false,
    targetType: target.targetType || "cups"
  };

  const unit = progress.targetType === "cups" ? "杯" : "元";
  elements.groupTitle.textContent = groupBuy.title;
  elements.groupShop.textContent = groupBuy.shopName;
  elements.groupPromotion.textContent = summarizePromotions(groupBuy);
  elements.groupDeadline.textContent = formatDateTime(groupBuy.deadline);
  elements.groupStatus.textContent = groupBuy.status === "open" ? "開放中" : groupBuy.status;
  elements.totalCups.textContent = groupBuy.totals.cups;
  elements.totalAmount.textContent = formatMoney(groupBuy.totals.amount);
  elements.totalParticipants.textContent = groupBuy.totals.participants;
  elements.groupNote.textContent = groupBuy.note || "";
  elements.progressLabel.textContent = `${progress.progressValue} / ${progress.targetValue} ${unit}`;
  elements.discountLabel.textContent = progress.isEligible
    ? `已折 ${formatMoney(progress.discountAmount)}`
    : `尚差 ${progress.remainingTarget} ${unit}`;
  elements.progressFill.style.width = `${Math.round((progress.progressRate || 0) * 100)}%`;
}

function renderGroupList() {
  if (state.groupBuys.length === 0) {
    elements.groupList.innerHTML = '<p class="note-text">還沒有團購。</p>';
    return;
  }

  elements.groupList.innerHTML = state.groupBuys
    .slice()
    .reverse()
    .map(
      (groupBuy) => `
        <button class="group-row" type="button" data-id="${groupBuy.id}">
          <strong>${groupBuy.title}</strong>
          <span>${groupBuy.shopName} · ${formatDateTime(groupBuy.deadline)}</span>
        </button>
      `
    )
    .join("");
}

async function loadInitialData() {
  state.shops = await fetchJson("/api/shops");
  state.groupBuys = await fetchJson("/api/group-buys");
  renderShops();
  renderPromotionRows();
  renderGroupList();
  renderGroupBuy(state.groupBuys[state.groupBuys.length - 1] || null);
}

async function createGroupBuy(event) {
  event.preventDefault();
  elements.formMessage.textContent = "";

  const promotionMatrix = getPromotionMatrix();
  if (promotionMatrix.length === 0) {
    elements.formMessage.textContent = "請至少新增一個有效優惠方案。";
    return;
  }

  const submitButton = elements.form.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const groupBuy = await fetchJson("/api/group-buys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: elements.titleInput.value,
        shopId: elements.shopSelect.value,
        promotionMatrix,
        createdBy: elements.createdByInput.value,
        deadline: elements.deadlineInput.value,
        note: elements.noteInput.value
      })
    });

    state.groupBuys.push(groupBuy);
    renderGroupList();
    renderGroupBuy(groupBuy);
    elements.form.reset();
    setDefaultDeadline();
    state.promotionRows = [
      { targetValue: 15, rewardValue: 90 },
      { targetValue: 30, rewardValue: 240 },
      { targetValue: 50, rewardValue: 500 }
    ];
    renderPromotionRows();
    elements.formMessage.textContent = "團購已建立。";
  } catch (error) {
    elements.formMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function selectGroupBuy(event) {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }

  const groupBuy = await fetchJson(`/api/group-buys/${button.dataset.id}`);
  renderGroupBuy(groupBuy);
}

function handlePromotionInput(event) {
  if (!event.target.matches(".promotion-cups, .promotion-discount")) {
    return;
  }

  const row = event.target.closest(".promotion-row");
  const cups = Number(row.querySelector(".promotion-cups").value);
  const discount = Number(row.querySelector(".promotion-discount").value);
  const average = cups > 0 && discount > 0 ? discount / cups : 0;
  row.querySelector(".average-box strong").textContent = formatMoney(average);
}

function handlePromotionRemove(event) {
  const button = event.target.closest("[data-remove-promotion]");
  if (!button) {
    return;
  }

  syncPromotionRows();
  state.promotionRows.splice(Number(button.dataset.removePromotion), 1);
  renderPromotionRows();
}

elements.addPromotionButton.addEventListener("click", () => {
  syncPromotionRows();
  state.promotionRows.push({ targetValue: 0, rewardValue: 0 });
  renderPromotionRows();
});
elements.promotionList.addEventListener("input", handlePromotionInput);
elements.promotionList.addEventListener("click", handlePromotionRemove);
elements.form.addEventListener("submit", createGroupBuy);
elements.groupList.addEventListener("click", selectGroupBuy);
elements.refreshButton.addEventListener("click", loadInitialData);

setDefaultDeadline();
loadInitialData().catch((error) => {
  elements.formMessage.textContent = error.message;
});
