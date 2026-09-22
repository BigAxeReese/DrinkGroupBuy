"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateMinimumSellableUnitPrice,
  calculatePercentageDiscount,
  normalizeDiscountTiers,
  resolveAppliedDiscountTier,
  validateDiscountTierConfiguration
} = require("./groupBuyDiscount");

describe("calculatePercentageDiscount", () => {
  it("rounds the amount the customer pays up to the nearest dollar", () => {
    // $65 @ 7折 (discountPercent=30, pay 70%): 65*0.7=45.5 -> ceil -> 46
    assert.deepEqual(calculatePercentageDiscount(65, 30), { finalAmount: 46, discountAmount: 19 });
  });

  it("divides evenly when the discount produces a whole number", () => {
    // $100 @ 7折 (discountPercent=30): 100*0.7=70 exactly
    assert.deepEqual(calculatePercentageDiscount(100, 30), { finalAmount: 70, discountAmount: 30 });
  });

  it("never floors a positive amount to zero, even at 99% off", () => {
    assert.deepEqual(calculatePercentageDiscount(1, 99), { finalAmount: 1, discountAmount: 0 });
  });

  it("throws for a non-integer or negative originalAmount", () => {
    assert.throws(() => calculatePercentageDiscount(10.5, 30));
    assert.throws(() => calculatePercentageDiscount(-10, 30));
  });

  it("throws for a discountPercent outside 1-99", () => {
    assert.throws(() => calculatePercentageDiscount(100, 0));
    assert.throws(() => calculatePercentageDiscount(100, 100));
    assert.throws(() => calculatePercentageDiscount(100, 30.5));
  });
});

describe("resolveAppliedDiscountTier", () => {
  const tiers = [
    { id: 1, targetCups: 10, discountPercent: 10 },
    { id: 2, targetCups: 20, discountPercent: 30 }
  ];

  it("applies the highest reached tier and reports progress to the next one", () => {
    const summary = resolveAppliedDiscountTier(tiers, 15);
    assert.deepEqual(summary, {
      currentTierId: 1,
      currentTierTargetCups: 10,
      currentTierDiscountPercent: 10,
      nextTierTargetCups: 20,
      cupsToNextTier: 5
    });
  });

  it("reports no applied tier when cups fall below the lowest tier", () => {
    const summary = resolveAppliedDiscountTier(tiers, 5);
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.currentTierDiscountPercent, 0);
    assert.equal(summary.nextTierTargetCups, 10);
    assert.equal(summary.cupsToNextTier, 5);
  });

  it("reports no next tier once the highest tier is reached", () => {
    const summary = resolveAppliedDiscountTier(tiers, 25);
    assert.equal(summary.currentTierId, 2);
    assert.equal(summary.nextTierTargetCups, null);
    assert.equal(summary.cupsToNextTier, 0);
  });

  it("clamps negative authorizedCups to zero", () => {
    const summary = resolveAppliedDiscountTier(tiers, -5);
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.cupsToNextTier, 10);
  });

  it("treats non-numeric authorizedCups as zero", () => {
    const summary = resolveAppliedDiscountTier(tiers, "not-a-number");
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.cupsToNextTier, 10);
  });
});

describe("validateDiscountTierConfiguration", () => {
  const validInput = {
    tiers: [
      { targetCups: 10, discountPercent: 10 },
      { targetCups: 20, discountPercent: 30 }
    ],
    maximumCups: 20
  };

  it("accepts a well-formed tier configuration", () => {
    const result = validateDiscountTierConfiguration(validInput);
    assert.equal(result.valid, true);
    assert.equal(result.maximumCups, 20);
  });

  it("rejects an empty tier list", () => {
    const result = validateDiscountTierConfiguration({ tiers: [], maximumCups: 10 });
    assert.equal(result.valid, false);
    assert.equal(result.reason, "tiers_required");
  });

  it("rejects a non-positive maximumCups", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountPercent: 10 }],
      maximumCups: -1
    });
    assert.equal(result.reason, "maximum_cups_invalid");
  });

  it("rejects a tier with a non-positive targetCups", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 0, discountPercent: 10 }],
      maximumCups: 5
    });
    assert.equal(result.reason, "tier_target_cups_invalid");
  });

  it("rejects a tier with a discountPercent outside 1-99", () => {
    const zero = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountPercent: 0 }],
      maximumCups: 10
    });
    assert.equal(zero.reason, "tier_discount_percent_invalid");

    const tooHigh = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountPercent: 100 }],
      maximumCups: 10
    });
    assert.equal(tooHigh.reason, "tier_discount_percent_invalid");
  });

  it("rejects duplicate targetCups across tiers", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [
        { targetCups: 10, discountPercent: 10 },
        { targetCups: 10, discountPercent: 20 }
      ],
      maximumCups: 10
    });
    assert.equal(result.reason, "tier_target_cups_duplicate");
  });

  it("rejects maximumCups that does not match the highest tier", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountPercent: 10 }],
      maximumCups: 20
    });
    assert.equal(result.reason, "maximum_cups_must_equal_highest_tier");
  });

  it("rejects a higher cup tier with a discount that is not strictly better", () => {
    const same = validateDiscountTierConfiguration({
      tiers: [
        { targetCups: 10, discountPercent: 30 },
        { targetCups: 20, discountPercent: 30 }
      ],
      maximumCups: 20
    });
    assert.equal(same.reason, "tier_discount_percent_not_increasing");

    const worse = validateDiscountTierConfiguration({
      tiers: [
        { targetCups: 10, discountPercent: 30 },
        { targetCups: 20, discountPercent: 20 }
      ],
      maximumCups: 20
    });
    assert.equal(worse.reason, "tier_discount_percent_not_increasing");
  });
});

describe("calculateMinimumSellableUnitPrice", () => {
  it("adds the cheapest required customization options to the base price", () => {
    const price = calculateMinimumSellableUnitPrice([
      {
        basePrice: 50,
        isAvailable: true,
        customizationGroups: [
          {
            minSelections: 1,
            options: [
              { priceDelta: 10, isAvailable: true },
              { priceDelta: 5, isAvailable: true }
            ]
          }
        ]
      }
    ]);
    assert.equal(price, 55);
  });

  it("returns the base price when there are no required customizations", () => {
    const price = calculateMinimumSellableUnitPrice([{ basePrice: 30, isAvailable: true }]);
    assert.equal(price, 30);
  });

  it("picks the cheapest item across the menu", () => {
    const price = calculateMinimumSellableUnitPrice([
      { basePrice: 80, isAvailable: true },
      { basePrice: 40, isAvailable: true }
    ]);
    assert.equal(price, 40);
  });

  it("skips unavailable items", () => {
    const price = calculateMinimumSellableUnitPrice([
      { basePrice: 10, isAvailable: false },
      { basePrice: 40, isAvailable: true }
    ]);
    assert.equal(price, 40);
  });

  it("skips items that cannot satisfy a required customization group", () => {
    const price = calculateMinimumSellableUnitPrice([
      {
        basePrice: 30,
        isAvailable: true,
        customizationGroups: [
          {
            minSelections: 2,
            options: [{ priceDelta: 5, isAvailable: true }]
          }
        ]
      }
    ]);
    assert.equal(price, null);
  });

  it("returns null for an empty or non-array menu", () => {
    assert.equal(calculateMinimumSellableUnitPrice([]), null);
    assert.equal(calculateMinimumSellableUnitPrice(null), null);
  });
});

describe("normalizeDiscountTiers", () => {
  it("sorts tiers ascending by targetCups", () => {
    const normalized = normalizeDiscountTiers([
      { targetCups: 20, discountPercent: 30 },
      { targetCups: 10, discountPercent: 10 }
    ]);
    assert.deepEqual(normalized.map((tier) => tier.targetCups), [10, 20]);
  });

  it("filters out invalid tiers by default", () => {
    const normalized = normalizeDiscountTiers([
      { targetCups: 10, discountPercent: 10 },
      { targetCups: -1, discountPercent: 10 }
    ]);
    assert.equal(normalized.length, 1);
  });

  it("filters out a discountPercent outside 1-99", () => {
    const normalized = normalizeDiscountTiers([
      { targetCups: 10, discountPercent: 0 },
      { targetCups: 20, discountPercent: 100 },
      { targetCups: 30, discountPercent: 50 }
    ]);
    assert.deepEqual(normalized.map((tier) => tier.targetCups), [30]);
  });

  it("keeps invalid tiers when preserveInvalid is set", () => {
    const normalized = normalizeDiscountTiers(
      [{ targetCups: -1, discountPercent: 10 }],
      { preserveInvalid: true }
    );
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].targetCups, -1);
  });

  it("accepts snake_case field names", () => {
    const normalized = normalizeDiscountTiers([
      { target_cups: 10, discount_percent: 30 }
    ]);
    assert.deepEqual(normalized[0], {
      id: null,
      targetCups: 10,
      discountPercent: 30,
      sortOrder: 0
    });
  });
});
