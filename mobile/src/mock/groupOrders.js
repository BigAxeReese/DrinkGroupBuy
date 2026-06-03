// prototype only, not final API contract

export const groupOrders = [
  {
    dealId: "deal-001",
    targetCups: 20,
    authorizedCups: 14,
    remainingAuthorizedCups: 6,
    discountStatus: "not_yet_qualified",
    cupsUntilNextTier: 6,
    estimatedDiscountPerCup: 20,
    nextTierText: "再 6 杯達 20 杯折 400"
  },
  {
    dealId: "deal-002",
    targetCups: 30,
    authorizedCups: 33,
    remainingAuthorizedCups: 0,
    discountStatus: "qualified",
    cupsUntilNextTier: 12,
    estimatedDiscountPerCup: 22,
    nextTierText: "已成團，距下一級距差 12 杯"
  }
];
