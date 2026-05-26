const fs = require("fs");
const path = require("path");

const dataRoot = path.join(__dirname, "..", "..", "data");
const shopsPath = path.join(dataRoot, "shops", "shops.json");
const groupBuysPath = path.join(dataRoot, "group_buys", "group_buys.json");
const sugarOptions = new Set(["無糖", "微糖", "半糖", "少糖", "正常糖"]);
const iceOptions = new Set(["去冰", "微冰", "少冰", "正常冰", "熱飲"]);

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const content = fs.readFileSync(filePath, "utf8").trim();
  return content ? JSON.parse(content) : fallback;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function createId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
}

function assertFutureDate(value, fieldName, now = new Date()) {
  assertNonEmptyString(value, fieldName);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  if (date.getTime() <= now.getTime()) {
    throw new Error(`${fieldName} must be in the future`);
  }

  return date.toISOString();
}

function assertValidDate(value, fieldName) {
  assertNonEmptyString(value, fieldName);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return date.toISOString();
}

function findShop(shopId) {
  const shops = readJson(shopsPath, []);
  const shop = shops.find((item) => item.id === shopId);

  if (!shop) {
    throw new Error(`shop not found: ${shopId}`);
  }

  return shop;
}

function normalizePromotionMatrix(promotionMatrix) {
  if (!Array.isArray(promotionMatrix) || promotionMatrix.length === 0) {
    throw new Error("promotionMatrix is required");
  }

  const promotions = promotionMatrix.map((item, index) => {
    const targetType = item.targetType === "amount" ? "amount" : "cups";
    const targetValue = Number(item.targetValue);
    const rewardValue = Number(item.rewardValue);

    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      throw new Error("promotion target must be greater than 0");
    }

    if (!Number.isFinite(rewardValue) || rewardValue <= 0) {
      throw new Error("promotion discount amount must be greater than 0");
    }

    return {
      id: `promo_custom_${index + 1}`,
      title: targetType === "cups"
        ? `${targetValue} 杯折 ${rewardValue} 元`
        : `滿 ${targetValue} 元折 ${rewardValue} 元`,
      description: targetType === "cups"
        ? `預購團購累積達 ${targetValue} 杯，整筆訂單可折抵 ${rewardValue} 元，平均每杯折 ${(rewardValue / targetValue).toFixed(1)} 元。`
        : `預購團購金額達 ${targetValue} 元，整筆訂單可折抵 ${rewardValue} 元。`,
      targetType,
      targetValue,
      rewardType: "fixed_amount",
      rewardValue,
      currency: "TWD",
      status: "active"
    };
  });

  return promotions.sort((left, right) => left.targetValue - right.targetValue);
}

function assertOpenGroupBuy(groupBuy, now = new Date()) {
  if (groupBuy.status !== "open") {
    throw new Error("group buy is not open");
  }

  if (new Date(groupBuy.deadline).getTime() <= now.getTime()) {
    throw new Error("group buy deadline has passed");
  }
}

function recalculateTotals(groupBuy) {
  const participants = groupBuy.participants || [];
  groupBuy.totals = participants.reduce(
    (totals, participant) => ({
      cups: totals.cups + participant.quantity,
      amount: totals.amount + participant.subtotal,
      participants: totals.participants + 1
    }),
    { cups: 0, amount: 0, participants: 0 }
  );
}

function createGroupBuy(input, options = {}) {
  const now = options.now || new Date();

  assertNonEmptyString(input.shopId, "shopId");
  assertNonEmptyString(input.createdBy, "createdBy");

  const title = typeof input.title === "string" && input.title.trim()
    ? input.title.trim()
    : "飲料團購";
  const deadline = assertFutureDate(input.deadline, "deadline", now);
  const shop = findShop(input.shopId);
  const promotions = normalizePromotionMatrix(input.promotionMatrix);
  const groupBuys = readJson(groupBuysPath, []);
  const createdAt = now.toISOString();
  const highestPromotion = promotions[promotions.length - 1];

  const groupBuy = {
    id: createId("gb"),
    title,
    shopId: shop.id,
    shopName: shop.name,
    promotionId: highestPromotion.id,
    promotionTitle: "自訂優惠矩陣",
    promotions,
    createdBy: input.createdBy.trim(),
    status: "open",
    deadline,
    note: typeof input.note === "string" ? input.note.trim() : "",
    participants: [],
    totals: {
      cups: 0,
      amount: 0,
      participants: 0
    },
    createdAt,
    updatedAt: createdAt
  };

  groupBuys.push(groupBuy);
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function listGroupBuys() {
  return readJson(groupBuysPath, []);
}

function getGroupBuy(groupBuyId) {
  assertNonEmptyString(groupBuyId, "groupBuyId");
  const groupBuys = readJson(groupBuysPath, []);
  return groupBuys.find((groupBuy) => groupBuy.id === groupBuyId) || null;
}

function updateGroupBuy(groupBuyId, input, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  assertNonEmptyString(input.shopId, "shopId");
  assertNonEmptyString(input.createdBy, "createdBy");

  const shop = findShop(input.shopId);
  if ((groupBuy.participants || []).length > 0 && shop.id !== groupBuy.shopId) {
    throw new Error("shop cannot be changed after participants have joined");
  }

  const status = typeof input.status === "string" ? input.status.trim() : "";
  if (!["open", "completed", "cancelled"].includes(status)) {
    throw new Error("status is not a valid option");
  }

  const deadline = status === "open"
    ? assertFutureDate(input.deadline, "deadline", now)
    : assertValidDate(input.deadline, "deadline");
  const promotions = normalizePromotionMatrix(input.promotionMatrix);
  const highestPromotion = promotions[promotions.length - 1];
  const updatedAt = now.toISOString();

  groupBuy.title = typeof input.title === "string" && input.title.trim()
    ? input.title.trim()
    : "飲料團購";
  groupBuy.shopId = shop.id;
  groupBuy.shopName = shop.name;
  groupBuy.promotionId = highestPromotion.id;
  groupBuy.promotionTitle = "自訂優惠矩陣";
  groupBuy.promotions = promotions;
  groupBuy.createdBy = input.createdBy.trim();
  groupBuy.deadline = deadline;
  groupBuy.note = typeof input.note === "string" ? input.note.trim() : "";
  groupBuy.status = status;
  groupBuy.updatedAt = updatedAt;

  if (status === "open") {
    delete groupBuy.cancelReason;
    delete groupBuy.cancelledAt;
    delete groupBuy.completedAt;
    delete groupBuy.simulatedDeadlineAt;
  } else if (status === "cancelled") {
    assertNonEmptyString(input.cancelReason, "cancelReason");
    groupBuy.cancelReason = input.cancelReason.trim();
    groupBuy.cancelledAt = groupBuy.cancelledAt || updatedAt;
    delete groupBuy.completedAt;
  } else {
    groupBuy.completedAt = groupBuy.completedAt || updatedAt;
    delete groupBuy.cancelReason;
    delete groupBuy.cancelledAt;
  }

  recalculateTotals(groupBuy);
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function joinGroupBuy(groupBuyId, input, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  assertOpenGroupBuy(groupBuy, now);
  assertNonEmptyString(input.customerName, "customerName");
  assertNonEmptyString(input.menuItemId, "menuItemId");
  assertNonEmptyString(input.sugar, "sugar");
  assertNonEmptyString(input.ice, "ice");

  if (!sugarOptions.has(input.sugar)) {
    throw new Error("sugar is not a valid option");
  }

  if (!iceOptions.has(input.ice)) {
    throw new Error("ice is not a valid option");
  }

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  const shop = findShop(groupBuy.shopId);
  const menuItem = (shop.menu || []).find((item) => item.id === input.menuItemId);
  if (!menuItem) {
    throw new Error(`menu item not found for shop ${shop.id}: ${input.menuItemId}`);
  }

  const joinedAt = now.toISOString();
  const participant = {
    id: createId("entry"),
    customerName: input.customerName.trim(),
    menuItemId: menuItem.id,
    itemName: menuItem.name,
    unitPrice: Number(menuItem.price),
    quantity,
    subtotal: Number(menuItem.price) * quantity,
    sugar: input.sugar,
    ice: input.ice,
    note: typeof input.note === "string" ? input.note.trim() : "",
    joinedAt
  };

  groupBuy.participants = groupBuy.participants || [];
  groupBuy.participants.push(participant);
  groupBuy.updatedAt = joinedAt;
  recalculateTotals(groupBuy);
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function leaveGroupBuy(groupBuyId, participantId, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  assertOpenGroupBuy(groupBuy, now);
  assertNonEmptyString(participantId, "participantId");

  const participants = groupBuy.participants || [];
  const participantIndex = participants.findIndex((item) => item.id === participantId);
  if (participantIndex < 0) {
    throw new Error(`participant not found: ${participantId}`);
  }

  participants.splice(participantIndex, 1);
  groupBuy.participants = participants;
  groupBuy.updatedAt = now.toISOString();
  recalculateTotals(groupBuy);
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function cancelGroupBuy(groupBuyId, input, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  if (groupBuy.status !== "open") {
    throw new Error("only open group buys can be cancelled");
  }

  if (new Date(groupBuy.deadline).getTime() <= now.getTime()) {
    throw new Error("expired group buys cannot be cancelled");
  }

  assertNonEmptyString(input.cancelReason, "cancelReason");
  groupBuy.status = "cancelled";
  groupBuy.cancelReason = input.cancelReason.trim();
  groupBuy.cancelledAt = now.toISOString();
  groupBuy.updatedAt = groupBuy.cancelledAt;
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function completeGroupBuy(groupBuyId, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  if (groupBuy.status !== "open") {
    throw new Error("only receiving group buys can be completed");
  }

  if (new Date(groupBuy.deadline).getTime() > now.getTime()) {
    throw new Error("group buy is not receiving orders yet");
  }

  groupBuy.status = "completed";
  groupBuy.completedAt = now.toISOString();
  groupBuy.updatedAt = groupBuy.completedAt;
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

function simulateGroupBuyDeadline(groupBuyId, options = {}) {
  const now = options.now || new Date();
  const groupBuys = readJson(groupBuysPath, []);
  const groupBuy = groupBuys.find((item) => item.id === groupBuyId);

  if (!groupBuy) {
    throw new Error(`group buy not found: ${groupBuyId}`);
  }

  if (groupBuy.status !== "open") {
    throw new Error("only open group buys can simulate deadline");
  }

  groupBuy.deadline = now.toISOString();
  groupBuy.simulatedDeadlineAt = groupBuy.deadline;
  groupBuy.updatedAt = groupBuy.deadline;
  writeJson(groupBuysPath, groupBuys);

  return groupBuy;
}

module.exports = {
  cancelGroupBuy,
  completeGroupBuy,
  createGroupBuy,
  getGroupBuy,
  joinGroupBuy,
  leaveGroupBuy,
  listGroupBuys,
  simulateGroupBuyDeadline,
  updateGroupBuy
};
