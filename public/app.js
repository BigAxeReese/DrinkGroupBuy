const state = {
  role: "customer",
  merchantOrderList: "active",
  shops: [],
  groupBuys: [],
  currentGroupBuy: null,
  joinGroupBuy: null,
  joinOrigin: "campaigns",
  selectedMenuItem: null,
  promotionRows: [
    { targetValue: 15, rewardValue: 90 },
    { targetValue: 30, rewardValue: 240 },
    { targetValue: 50, rewardValue: 500 }
  ]
};

const elements = {
  pageTitle: document.querySelector("#pageTitle"),
  roleButtons: document.querySelectorAll("[data-role-target]"),
  merchantAccountSelect: document.querySelector("#merchantAccountSelect"),
  customerAccountSelect: document.querySelector("#customerAccountSelect"),
  viewButtons: document.querySelectorAll("[data-view-target]"),
  views: {
    home: document.querySelector("#homeView"),
    create: document.querySelector("#createView"),
    join: document.querySelector("#joinView"),
    orders: document.querySelector("#ordersView"),
    groups: document.querySelector("#groupsView")
  },
  form: document.querySelector("#groupBuyForm"),
  titleInput: document.querySelector("#titleInput"),
  shopSelect: document.querySelector("#shopSelect"),
  selectedShopName: document.querySelector("#selectedShopName"),
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
  cancelledNotice: document.querySelector("#cancelledNotice"),
  cancelledReason: document.querySelector("#cancelledReason"),
  cancelPanel: document.querySelector("#cancelPanel"),
  cancelForm: document.querySelector("#cancelForm"),
  cancelReasonInput: document.querySelector("#cancelReasonInput"),
  cancelMessage: document.querySelector("#cancelMessage"),
  testPanel: document.querySelector("#testPanel"),
  simulateDeadlineButton: document.querySelector("#simulateDeadlineButton"),
  simulateDeadlineMessage: document.querySelector("#simulateDeadlineMessage"),
  completePanel: document.querySelector("#completePanel"),
  completeOrderButton: document.querySelector("#completeOrderButton"),
  completeMessage: document.querySelector("#completeMessage"),
  backToGroupListButton: document.querySelector("#backToGroupListButton"),
  groupListPanel: document.querySelector("#groupListPanel"),
  groupListTitle: document.querySelector("#groupListTitle"),
  orderTabButtons: document.querySelectorAll("[data-order-list]"),
  joinCampaignPanel: document.querySelector("#joinCampaignPanel"),
  joinCampaignList: document.querySelector("#joinCampaignList"),
  joinOrderPanel: document.querySelector("#joinOrderPanel"),
  backToJoinCampaignButton: document.querySelector("#backToJoinCampaignButton"),
  joinShopName: document.querySelector("#joinShopName"),
  joinGroupTitle: document.querySelector("#joinGroupTitle"),
  drinkMenuList: document.querySelector("#drinkMenuList"),
  customizationModal: document.querySelector("#customizationModal"),
  closeCustomizationButton: document.querySelector("#closeCustomizationButton"),
  joinForm: document.querySelector("#joinForm"),
  selectedDrinkName: document.querySelector("#selectedDrinkName"),
  selectedDrinkPrice: document.querySelector("#selectedDrinkPrice"),
  sugarSelect: document.querySelector("#sugarSelect"),
  iceSelect: document.querySelector("#iceSelect"),
  quantityInput: document.querySelector("#quantityInput"),
  orderNoteInput: document.querySelector("#orderNoteInput"),
  orderSubtotal: document.querySelector("#orderSubtotal"),
  joinMessage: document.querySelector("#joinMessage"),
  detailJoinPanel: document.querySelector("#detailJoinPanel"),
  joinFromDetailButton: document.querySelector("#joinFromDetailButton"),
  participantList: document.querySelector("#participantList"),
  participantMessage: document.querySelector("#participantMessage"),
  groupList: document.querySelector("#groupList"),
  customerOrderList: document.querySelector("#customerOrderList")
};

const viewTitles = {
  home: "主頁",
  create: "建立團購",
  join: "加入團購",
  orders: "我的訂單",
  groups: "團購管理"
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
  elements.merchantAccountSelect.innerHTML = state.shops
    .map((shop) => `<option value="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</option>`)
    .join("");
  syncSelectedMerchant();
}

function syncSelectedMerchant() {
  const selectedShopId = elements.merchantAccountSelect.value;
  const shop = state.shops.find((item) => item.id === selectedShopId);
  elements.shopSelect.value = selectedShopId;
  elements.selectedShopName.value = shop ? shop.name : "";
  renderGroupList();

  if (state.role === "merchant" && !elements.views.groups.hidden) {
    showGroupList();
  }
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

function getCupTarget(groupBuy) {
  const currentCups = Number(groupBuy.totals.cups) || 0;
  const cupPromotions = (groupBuy.promotions || [])
    .filter((promotion) => promotion.targetType === "cups")
    .map((promotion) => Number(promotion.targetValue) || 0)
    .filter((targetValue) => targetValue > 0)
    .sort((left, right) => left - right);

  if (cupPromotions.length > 0) {
    return cupPromotions.find((targetValue) => targetValue > currentCups)
      || cupPromotions[cupPromotions.length - 1];
  }

  if (groupBuy.selectedPromotion && groupBuy.selectedPromotion.targetType === "cups") {
    return Number(groupBuy.selectedPromotion.targetValue) || 0;
  }

  if (groupBuy.bestPromotion && groupBuy.bestPromotion.targetType === "cups") {
    return Number(groupBuy.bestPromotion.targetValue) || 0;
  }

  return 0;
}

function getStatusLabel(groupBuy) {
  if (groupBuy.status === "cancelled") {
    return "已取消";
  }

  if (groupBuy.status === "completed") {
    return "已完成";
  }

  return groupBuy.displayStatus === "receiving" ? "接單中" : "開放揪團";
}

function updateOrderSubtotal() {
  const unitPrice = state.selectedMenuItem ? Number(state.selectedMenuItem.price) : 0;
  const quantity = Math.max(Number(elements.quantityInput.value) || 0, 0);
  elements.orderSubtotal.textContent = formatMoney(unitPrice * quantity);
}

function renderJoinCampaigns() {
  const groupBuys = state.groupBuys.filter((groupBuy) => groupBuy.isJoinable);
  if (groupBuys.length === 0) {
    elements.joinCampaignList.innerHTML = '<p class="note-text">目前沒有開放加入的團購。</p>';
    return;
  }

  elements.joinCampaignList.innerHTML = groupBuys
    .slice()
    .reverse()
    .map((groupBuy) => `
        <button class="group-row" type="button" data-join-group-id="${escapeHtml(groupBuy.id)}">
          <div>
          <strong>${escapeHtml(groupBuy.shopName)}</strong>
          <span>${escapeHtml(groupBuy.title)}</span>
        </div>
        <b>杯數 (${Number(groupBuy.totals.cups)}/${getCupTarget(groupBuy) || "-"})</b>
      </button>
    `)
    .join("");
}

function showJoinCampaigns() {
  state.joinGroupBuy = null;
  state.joinOrigin = "campaigns";
  state.selectedMenuItem = null;
  elements.joinCampaignPanel.hidden = false;
  elements.joinOrderPanel.hidden = true;
  elements.customizationModal.hidden = true;
  renderJoinCampaigns();
}

function renderDrinkMenu(groupBuy) {
  const menu = groupBuy.shop ? groupBuy.shop.menu || [] : [];
  elements.joinShopName.textContent = groupBuy.shopName;
  elements.joinGroupTitle.textContent = groupBuy.title;
  elements.drinkMenuList.innerHTML = menu.length
    ? menu.map((item) => `
        <button class="drink-card" type="button" data-menu-item-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${formatMoney(item.price)}</span>
        </button>
      `).join("")
    : '<p class="note-text">此店家尚未建立菜單。</p>';
}

function openJoinOrder(groupBuy, origin = "campaigns") {
  state.joinGroupBuy = groupBuy;
  state.joinOrigin = origin;
  state.selectedMenuItem = null;
  elements.joinCampaignPanel.hidden = true;
  elements.joinOrderPanel.hidden = false;
  elements.customizationModal.hidden = true;
  elements.backToJoinCampaignButton.textContent = origin === "detail"
    ? "‹ 返回團購資訊"
    : "‹ 返回選擇團購";
  renderDrinkMenu(groupBuy);
}

async function selectJoinCampaign(event) {
  const button = event.target.closest("[data-join-group-id]");
  if (!button) {
    return;
  }

  const groupBuy = await fetchJson(`/api/group-buys/${button.dataset.joinGroupId}`);
  openJoinOrder(groupBuy);
}

function selectDrink(event) {
  const button = event.target.closest("[data-menu-item-id]");
  if (!button || !state.joinGroupBuy) {
    return;
  }

  const menu = state.joinGroupBuy.shop ? state.joinGroupBuy.shop.menu || [] : [];
  state.selectedMenuItem = menu.find((item) => item.id === button.dataset.menuItemId) || null;
  if (!state.selectedMenuItem) {
    return;
  }

  elements.drinkMenuList.querySelectorAll(".drink-card").forEach((card) => {
    card.classList.toggle("is-active", card === button);
  });
  elements.selectedDrinkName.textContent = state.selectedMenuItem.name;
  elements.selectedDrinkPrice.textContent = formatMoney(state.selectedMenuItem.price);
  elements.quantityInput.value = "1";
  elements.orderNoteInput.value = "";
  elements.joinMessage.textContent = "";
  updateOrderSubtotal();
  elements.customizationModal.hidden = false;
  elements.sugarSelect.focus();
}

function closeCustomizationModal() {
  elements.customizationModal.hidden = true;
}

function returnFromJoinOrder() {
  closeCustomizationModal();
  if (state.joinOrigin === "detail" && state.joinGroupBuy) {
    const groupBuy = state.joinGroupBuy;
    showView("groups");
    renderGroupBuy(groupBuy);
    elements.groupListPanel.hidden = true;
    return;
  }

  showJoinCampaigns();
}

function joinFromDetail() {
  if (!state.currentGroupBuy || !state.currentGroupBuy.isJoinable) {
    return;
  }

  const groupBuy = state.currentGroupBuy;
  showView("join");
  openJoinOrder(groupBuy, "detail");
}

function renderParticipants(groupBuy) {
  const participants = groupBuy.participants || [];
  if (participants.length === 0) {
    elements.participantList.innerHTML = '<p class="note-text">目前還沒有人加入。</p>';
    return;
  }

  elements.participantList.innerHTML = participants
    .map(
      (participant) => `
        <div class="participant-row">
          <div>
            <strong>${escapeHtml(participant.customerName)}</strong>
            <span>${escapeHtml(participant.itemName)} × ${Number(participant.quantity)} · ${formatMoney(participant.subtotal)}</span>
            ${participant.sugar || participant.ice ? `<span>${escapeHtml(participant.sugar || "-")} / ${escapeHtml(participant.ice || "-")}${participant.note ? ` · ${escapeHtml(participant.note)}` : ""}</span>` : ""}
          </div>
          <button class="leave-button customer-only" type="button" data-leave-id="${escapeHtml(participant.id)}" ${groupBuy.isJoinable ? "" : "disabled"}>退出</button>
        </div>
      `
    )
    .join("");
}

function getCustomerOrderEstimate(groupBuy, participants) {
  const originalAmount = participants.reduce((total, participant) => total + Number(participant.subtotal || 0), 0);
  const groupAmount = Number(groupBuy.totals && groupBuy.totals.amount) || 0;
  const groupDiscount = groupBuy.bestPromotion && groupBuy.bestPromotion.isEligible
    ? Number(groupBuy.bestPromotion.discountAmount) || 0
    : 0;
  const discountAmount = groupBuy.status === "cancelled" || groupAmount <= 0
    ? 0
    : Math.round((groupDiscount * originalAmount) / groupAmount);

  return {
    originalAmount,
    discountAmount,
    finalAmount: groupBuy.status === "cancelled" ? 0 : Math.max(originalAmount - discountAmount, 0)
  };
}

function renderCustomerOrders() {
  const customerName = elements.customerAccountSelect.value;
  const orders = state.groupBuys
    .map((groupBuy) => {
      const participants = (groupBuy.participants || [])
        .filter((participant) => participant.customerName === customerName);
      return {
        groupBuy,
        participants,
        estimate: getCustomerOrderEstimate(groupBuy, participants)
      };
    })
    .filter((order) => order.participants.length > 0)
    .reverse();

  if (orders.length === 0) {
    elements.customerOrderList.innerHTML = `
      <section class="panel empty-order-panel">
        <p class="note-text">目前帳號尚未加入任何團購訂單。</p>
      </section>
    `;
    return;
  }

  elements.customerOrderList.innerHTML = orders.map(({ groupBuy, participants, estimate }) => `
    <section class="panel customer-order-card">
      <div class="order-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(groupBuy.shopName)}</p>
          <h2>${escapeHtml(groupBuy.title)}</h2>
        </div>
        <em class="row-status">${escapeHtml(getStatusLabel(groupBuy))}</em>
      </div>
      <dl class="order-meta">
        <div><dt>截止時間</dt><dd>${formatDateTime(groupBuy.deadline)}</dd></div>
        <div><dt>優惠內容</dt><dd>${escapeHtml(summarizePromotions(groupBuy))}</dd></div>
      </dl>
      <div class="owned-order-items">
        ${participants.map((participant) => `
          <div class="owned-order-row">
            <div>
              <strong>${escapeHtml(participant.itemName)} x ${Number(participant.quantity)}</strong>
              <span>${escapeHtml(participant.sugar || "-")} / ${escapeHtml(participant.ice || "-")}${participant.note ? ` · ${escapeHtml(participant.note)}` : ""}</span>
            </div>
            <strong>${formatMoney(participant.subtotal)}</strong>
          </div>
        `).join("")}
      </div>
      ${groupBuy.status === "cancelled" ? `
        <p class="cancelled-order-copy">此團購已取消，不列入應付試算。</p>
      ` : `
        <div class="order-estimate">
          <div><span>訂購金額</span><strong>${formatMoney(estimate.originalAmount)}</strong></div>
          <div><span>預估分攤折扣</span><strong>-${formatMoney(estimate.discountAmount)}</strong></div>
          <div class="payable"><span>預估應付</span><strong>${formatMoney(estimate.finalAmount)}</strong></div>
        </div>
        <p class="estimate-note">折扣依整團訂購金額比例分攤試算，最終金額以店家結單結果為準。</p>
      `}
    </section>
  `).join("");
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
  elements.groupStatus.textContent = getStatusLabel(groupBuy);
  elements.totalCups.textContent = groupBuy.totals.cups;
  elements.totalAmount.textContent = formatMoney(groupBuy.totals.amount);
  elements.totalParticipants.textContent = groupBuy.totals.participants;
  elements.groupNote.textContent = groupBuy.note || "";
  elements.detailJoinPanel.hidden = !groupBuy.isJoinable;
  elements.cancelledNotice.hidden = groupBuy.status !== "cancelled";
  elements.cancelledReason.textContent = groupBuy.cancelReason || "";
  elements.cancelPanel.hidden = !groupBuy.isCancellable;
  elements.cancelReasonInput.value = "";
  elements.cancelMessage.textContent = "";
  elements.testPanel.hidden = !groupBuy.isJoinable;
  elements.simulateDeadlineMessage.textContent = "";
  elements.completePanel.hidden = !groupBuy.isCompletable;
  elements.completeMessage.textContent = "";
  elements.progressLabel.textContent = `${progress.progressValue} / ${progress.targetValue} ${unit}`;
  elements.discountLabel.textContent = progress.isEligible
    ? `已折 ${formatMoney(progress.discountAmount)}`
    : `尚差 ${progress.remainingTarget} ${unit}`;
  elements.progressFill.style.width = `${Math.round((progress.progressRate || 0) * 100)}%`;
  renderParticipants(groupBuy);
  elements.participantMessage.textContent = groupBuy.isJoinable
    ? ""
    : groupBuy.status === "cancelled"
      ? "此團購已取消，無法加入或退出。"
      : groupBuy.status === "completed"
        ? "此團購已完成，無法加入或退出。"
        : "此團購已進入接單狀態，無法加入或退出。";
}

function renderGroupList() {
  let groupBuys = state.role === "merchant"
    ? state.groupBuys.filter((groupBuy) => groupBuy.shopId === elements.merchantAccountSelect.value)
    : state.groupBuys.filter((groupBuy) => groupBuy.isJoinable);

  if (state.role === "merchant") {
    groupBuys = groupBuys.filter((groupBuy) => {
      const isHistorical = groupBuy.status === "completed" || groupBuy.status === "cancelled";
      return state.merchantOrderList === "history" ? isHistorical : !isHistorical;
    });
  }

  if (groupBuys.length === 0) {
    const message = state.role === "merchant" && state.merchantOrderList === "history"
      ? "目前沒有歷史訂單。"
      : state.role === "customer"
        ? "目前沒有可加入的團購。"
        : "還沒有團購。";
    elements.groupList.innerHTML = `<p class="note-text">${message}</p>`;
    return;
  }

  elements.groupList.innerHTML = groupBuys
    .slice()
    .reverse()
    .map(
      (groupBuy) => {
        const cupTarget = getCupTarget(groupBuy);
        const statusTag = state.role === "merchant"
          ? `<em class="row-status">${getStatusLabel(groupBuy)}</em>`
          : "";
        return `
        <button class="group-row" type="button" data-id="${escapeHtml(groupBuy.id)}">
          <div>
            <strong>${escapeHtml(groupBuy.shopName)}</strong>
            <span>${escapeHtml(groupBuy.title)}</span>
            ${statusTag}
          </div>
          <b>杯數 (${Number(groupBuy.totals.cups)}/${cupTarget || "-"})</b>
        </button>
      `;
      }
    )
    .join("");
}

function showGroupList() {
  state.currentGroupBuy = null;
  elements.groupBuyPanel.hidden = true;
  elements.groupListPanel.hidden = false;
}

function showView(viewName) {
  if (viewName === "create" && state.role !== "merchant") {
    viewName = "home";
  }
  if (viewName === "join" && state.role !== "customer") {
    viewName = "home";
  }
  if (viewName === "orders" && state.role !== "customer") {
    viewName = "home";
  }

  Object.entries(elements.views).forEach(([name, view]) => {
    view.hidden = name !== viewName;
  });

  elements.pageTitle.textContent = viewTitles[viewName] || "主頁";

  if (viewName === "groups") {
    showGroupList();
  }
  if (viewName === "join") {
    showJoinCampaigns();
  }
  if (viewName === "orders") {
    renderCustomerOrders();
  }
}

function setRole(role) {
  state.role = role;
  document.body.dataset.role = role;

  elements.roleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.roleTarget === role);
  });

  elements.groupListTitle.textContent = role === "merchant" ? "已建立團購" : "可瀏覽團購";
  if (role === "merchant") {
    state.merchantOrderList = "active";
    updateMerchantOrderTabs();
  }

  if (role === "customer" && !elements.views.create.hidden) {
    showView("home");
  } else if (role === "merchant" && (!elements.views.join.hidden || !elements.views.orders.hidden)) {
    showView("home");
  } else if (!elements.views.groups.hidden) {
    showGroupList();
  }
  renderGroupList();
  renderJoinCampaigns();
  renderCustomerOrders();
}

function updateMerchantOrderTabs() {
  elements.orderTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.orderList === state.merchantOrderList);
  });
}

function updateStoredGroupBuy(groupBuy, options = {}) {
  const index = state.groupBuys.findIndex((item) => item.id === groupBuy.id);
  if (index >= 0) {
    state.groupBuys[index] = groupBuy;
  } else {
    state.groupBuys.push(groupBuy);
  }

  renderGroupList();
  renderJoinCampaigns();
  renderCustomerOrders();
  if (options.renderDetail !== false) {
    renderGroupBuy(groupBuy);
  }
}

async function loadInitialData() {
  state.shops = await fetchJson("/api/shops");
  state.groupBuys = await fetchJson("/api/group-buys");
  renderShops();
  renderPromotionRows();
  renderGroupList();
  renderJoinCampaigns();
  renderCustomerOrders();
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

    updateStoredGroupBuy(groupBuy);
    showView("groups");
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
  if (state.role === "customer") {
    elements.groupListPanel.hidden = true;
  }
}

async function joinCurrentGroupBuy(event) {
  event.preventDefault();
  if (!state.joinGroupBuy || !state.selectedMenuItem) {
    elements.joinMessage.textContent = "請先選擇飲品。";
    return;
  }

  elements.joinMessage.textContent = "";
  const submitButton = elements.joinForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const groupBuy = await fetchJson(`/api/group-buys/${state.joinGroupBuy.id}/participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customerName: elements.customerAccountSelect.value,
        menuItemId: state.selectedMenuItem.id,
        sugar: elements.sugarSelect.value,
        ice: elements.iceSelect.value,
        quantity: Number(elements.quantityInput.value),
        note: elements.orderNoteInput.value
      })
    });

    state.joinGroupBuy = groupBuy;
    updateStoredGroupBuy(groupBuy, { renderDetail: false });
    closeCustomizationModal();
    showView("groups");
    renderGroupBuy(groupBuy);
    elements.groupListPanel.hidden = true;
    elements.participantMessage.textContent = "已加入團購。";
  } catch (error) {
    elements.joinMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function cancelCurrentGroupBuy(event) {
  event.preventDefault();
  if (!state.currentGroupBuy) {
    elements.cancelMessage.textContent = "請先選擇一筆團購。";
    return;
  }

  const submitButton = elements.cancelForm.querySelector("button[type='submit']");
  elements.cancelMessage.textContent = "";
  submitButton.disabled = true;

  try {
    const groupBuy = await fetchJson(`/api/group-buys/${state.currentGroupBuy.id}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cancelReason: elements.cancelReasonInput.value
      })
    });

    updateStoredGroupBuy(groupBuy);
    elements.cancelMessage.textContent = "團購已取消。";
  } catch (error) {
    elements.cancelMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function completeCurrentGroupBuy() {
  if (!state.currentGroupBuy) {
    return;
  }

  elements.completeMessage.textContent = "";
  elements.completeOrderButton.disabled = true;

  try {
    const groupBuy = await fetchJson(`/api/group-buys/${state.currentGroupBuy.id}/complete`, {
      method: "POST"
    });
    state.merchantOrderList = "history";
    updateMerchantOrderTabs();
    updateStoredGroupBuy(groupBuy);
    elements.completeMessage.textContent = "訂單已完成，已移至歷史訂單。";
  } catch (error) {
    elements.completeMessage.textContent = error.message;
  } finally {
    elements.completeOrderButton.disabled = false;
  }
}

async function simulateCurrentGroupBuyDeadline() {
  if (!state.currentGroupBuy) {
    return;
  }

  elements.simulateDeadlineMessage.textContent = "";
  elements.simulateDeadlineButton.disabled = true;

  try {
    const groupBuy = await fetchJson(`/api/group-buys/${state.currentGroupBuy.id}/simulate-deadline`, {
      method: "POST"
    });
    updateStoredGroupBuy(groupBuy);
    elements.completeMessage.textContent = "模擬截止完成，訂單已進入接單中。";
  } catch (error) {
    elements.simulateDeadlineMessage.textContent = error.message;
  } finally {
    elements.simulateDeadlineButton.disabled = false;
  }
}

async function leaveCurrentGroupBuy(event) {
  const button = event.target.closest("[data-leave-id]");
  if (!button || !state.currentGroupBuy) {
    return;
  }

  elements.participantMessage.textContent = "";
  try {
    const groupBuy = await fetchJson(
      `/api/group-buys/${state.currentGroupBuy.id}/participants/${button.dataset.leaveId}`,
      { method: "DELETE" }
    );
    updateStoredGroupBuy(groupBuy);
    elements.participantMessage.textContent = "已退出團購。";
  } catch (error) {
    elements.participantMessage.textContent = error.message;
  }
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
elements.roleButtons.forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.roleTarget));
});
elements.merchantAccountSelect.addEventListener("change", syncSelectedMerchant);
elements.customerAccountSelect.addEventListener("change", renderCustomerOrders);
elements.orderTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.merchantOrderList = button.dataset.orderList;
    updateMerchantOrderTabs();
    showGroupList();
    renderGroupList();
  });
});
elements.viewButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});
elements.promotionList.addEventListener("input", handlePromotionInput);
elements.promotionList.addEventListener("click", handlePromotionRemove);
elements.form.addEventListener("submit", createGroupBuy);
elements.cancelForm.addEventListener("submit", cancelCurrentGroupBuy);
elements.simulateDeadlineButton.addEventListener("click", simulateCurrentGroupBuyDeadline);
elements.completeOrderButton.addEventListener("click", completeCurrentGroupBuy);
elements.joinForm.addEventListener("submit", joinCurrentGroupBuy);
elements.quantityInput.addEventListener("input", updateOrderSubtotal);
elements.joinCampaignList.addEventListener("click", selectJoinCampaign);
elements.drinkMenuList.addEventListener("click", selectDrink);
elements.closeCustomizationButton.addEventListener("click", closeCustomizationModal);
elements.customizationModal.addEventListener("click", (event) => {
  if (event.target === elements.customizationModal) {
    closeCustomizationModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.customizationModal.hidden) {
    closeCustomizationModal();
  }
});
elements.backToJoinCampaignButton.addEventListener("click", returnFromJoinOrder);
elements.joinFromDetailButton.addEventListener("click", joinFromDetail);
elements.participantList.addEventListener("click", leaveCurrentGroupBuy);
elements.groupList.addEventListener("click", selectGroupBuy);
elements.backToGroupListButton.addEventListener("click", showGroupList);
elements.refreshButton.addEventListener("click", loadInitialData);

setDefaultDeadline();
setRole("customer");
showView("home");
loadInitialData().catch((error) => {
  elements.formMessage.textContent = error.message;
});
