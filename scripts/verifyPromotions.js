const fs = require("fs");
const path = require("path");
const { calculateBestPromotion } = require("../src/services/promotionCalculator");

const shopsPath = path.join(__dirname, "..", "data", "shops", "shops.json");
const shops = JSON.parse(fs.readFileSync(shopsPath, "utf8"));
const now = new Date("2026-05-21T12:00:00+08:00");

const scenarios = [
  {
    shopId: "shop_001",
    totalCups: 49,
    totalAmount: 2450
  },
  {
    shopId: "shop_001",
    totalCups: 50,
    totalAmount: 2500
  },
  {
    shopId: "shop_003",
    totalCups: 15,
    totalAmount: 1000
  },
  {
    shopId: "shop_006",
    totalCups: 14,
    totalAmount: 700
  },
  {
    shopId: "shop_006",
    totalCups: 15,
    totalAmount: 750
  },
  {
    shopId: "shop_006",
    totalCups: 30,
    totalAmount: 1500
  },
  {
    shopId: "shop_006",
    totalCups: 50,
    totalAmount: 2500
  }
];

for (const scenario of scenarios) {
  const shop = shops.find((item) => item.id === scenario.shopId);
  const result = calculateBestPromotion(shop.promotions, scenario, { now });

  console.log(`${shop.name} - ${result.title}`);
  console.log(`  progress: ${result.progressValue}/${result.targetValue} ${result.targetType}`);
  console.log(`  eligible: ${result.isEligible}`);
  console.log(`  discount: ${result.discountAmount} ${result.currency}`);
  console.log(`  final amount: ${result.finalAmount} ${result.currency}`);
}
