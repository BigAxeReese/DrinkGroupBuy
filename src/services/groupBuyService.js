const fs = require("fs");
const path = require("path");

const dataRoot = path.join(__dirname, "..", "..", "data");
const shopsPath = path.join(dataRoot, "shops", "shops.json");
const groupBuysPath = path.join(dataRoot, "group_buys", "group_buys.json");

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
    const targetValue = Number(item.targetValue);
    const rewardValue = Number(item.rewardValue);

    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      throw new Error("promotion cups must be greater than 0");
    }

    if (!Number.isFinite(rewardValue) || rewardValue <= 0) {
      throw new Error("promotion discount amount must be greater than 0");
    }

    return {
      id: `promo_custom_${index + 1}`,
      title: `${targetValue} 杯折 ${rewardValue} 元`,
      description: `預購團購累積達 ${targetValue} 杯，整筆訂單可折抵 ${rewardValue} 元，平均每杯折 ${(rewardValue / targetValue).toFixed(1)} 元。`,
      targetType: "cups",
      targetValue,
      rewardType: "fixed_amount",
      rewardValue,
      currency: "TWD",
      status: "active"
    };
  });

  return promotions.sort((left, right) => left.targetValue - right.targetValue);
}

function createGroupBuy(input, options = {}) {
  const now = options.now || new Date();

  assertNonEmptyString(input.title, "title");
  assertNonEmptyString(input.shopId, "shopId");
  assertNonEmptyString(input.createdBy, "createdBy");

  const deadline = assertFutureDate(input.deadline, "deadline", now);
  const shop = findShop(input.shopId);
  const promotions = normalizePromotionMatrix(input.promotionMatrix);
  const groupBuys = readJson(groupBuysPath, []);
  const createdAt = now.toISOString();
  const highestPromotion = promotions[promotions.length - 1];

  const groupBuy = {
    id: createId("gb"),
    title: input.title.trim(),
    shopId: shop.id,
    shopName: shop.name,
    promotionId: highestPromotion.id,
    promotionTitle: "自訂優惠矩陣",
    promotions,
    createdBy: input.createdBy.trim(),
    status: "open",
    deadline,
    note: typeof input.note === "string" ? input.note.trim() : "",
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

module.exports = {
  createGroupBuy,
  getGroupBuy,
  listGroupBuys
};
