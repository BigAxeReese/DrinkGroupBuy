"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateDiscountPerCup,
  calculateGroupBuyDiscountSummary,
  calculateMinimumSellableUnitPrice,
  findOrderDiscountConflicts,
  normalizeDiscountTiers,
  validateDiscountTierConfiguration
} = require("./groupBuyDiscount");

describe("calculateDiscountPerCup", () => {
  it("divides evenly when the discount splits cleanly across cups", () => {
    assert.equal(calculateDiscountPerCup(100, 10), 10);
  });

  it("floors down when the discount does not divide evenly", () => {
    assert.equal(calculateDiscountPerCup(100, 3), 33);
  });

  it("returns 0 when cupCount is zero", () => {
    assert.equal(calculateDiscountPerCup(100, 0), 0);
  });

  it("returns 0 when cupCount is negative", () => {
    assert.equal(calculateDiscountPerCup(100, -5), 0);
  });

  it("returns 0 when discountAmount is negative", () => {
    assert.equal(calculateDiscountPerCup(-100, 10), 0);
  });

  it("returns 0 when discountAmount is not an integer", () => {
    assert.equal(calculateDiscountPerCup(10.5, 10), 0);
  });

  it("returns 0 when discountAmount is 0", () => {
    assert.equal(calculateDiscountPerCup(0, 10), 0);
  });
});

describe("calculateGroupBuyDiscountSummary", () => {
  const tiers = [
    { id: 1, targetCups: 10, discountAmount: 100 },
    { id: 2, targetCups: 20, discountAmount: 300 }
  ];

  it("applies the highest reached tier and reports progress to the next one", () => {
    const summary = calculateGroupBuyDiscountSummary(tiers, 15);
    assert.deepEqual(summary, {
      currentTierId: 1,
      currentTierTargetCups: 10,
      currentTierDiscountAmount: 100,
      estimatedDiscountPerCup: 6,
      estimatedAllocatedDiscountAmount: 90,
      estimatedUndistributedDiscountAmount: 10,
      nextTierTargetCups: 20,
      cupsToNextTier: 5
    });
  });

  it("reports no applied tier when cups fall below the lowest tier", () => {
    const summary = calculateGroupBuyDiscountSummary(tiers, 5);
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.estimatedDiscountPerCup, 0);
    assert.equal(summary.nextTierTargetCups, 10);
    assert.equal(summary.cupsToNextTier, 5);
  });

  it("reports no next tier once the highest tier is reached", () => {
    const summary = calculateGroupBuyDiscountSummary(tiers, 25);
    assert.equal(summary.currentTierId, 2);
    assert.equal(summary.nextTierTargetCups, null);
    assert.equal(summary.cupsToNextTier, 0);
  });

  it("clamps negative authorizedCups to zero", () => {
    const summary = calculateGroupBuyDiscountSummary(tiers, -5);
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.cupsToNextTier, 10);
  });

  it("treats non-numeric authorizedCups as zero", () => {
    const summary = calculateGroupBuyDiscountSummary(tiers, "not-a-number");
    assert.equal(summary.currentTierId, null);
    assert.equal(summary.cupsToNextTier, 10);
  });
});

describe("validateDiscountTierConfiguration", () => {
  const validInput = {
    tiers: [
      { targetCups: 10, discountAmount: 100 },
      { targetCups: 20, discountAmount: 300 }
    ],
    maximumCups: 20,
    minimumSellableUnitPrice: 20
  };

  it("accepts a well-formed tier configuration", () => {
    const result = validateDiscountTierConfiguration(validInput);
    assert.equal(result.valid, true);
    assert.equal(result.maximumDiscountPerCup, 15);
  });

  it("rejects an empty tier list", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [],
      maximumCups: 10,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.valid, false);
    assert.equal(result.reason, "tiers_required");
  });

  it("rejects a non-positive maximumCups", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: 100 }],
      maximumCups: -1,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "maximum_cups_invalid");
  });

  it("rejects a non-positive minimumSellableUnitPrice", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: 100 }],
      maximumCups: 10,
      minimumSellableUnitPrice: 0
    });
    assert.equal(result.reason, "minimum_sellable_unit_price_invalid");
  });

  it("rejects a tier with a non-positive targetCups", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 0, discountAmount: 100 }],
      maximumCups: 5,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "tier_target_cups_invalid");
  });

  it("rejects a tier with a negative discountAmount", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: -5 }],
      maximumCups: 10,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "tier_discount_amount_invalid");
  });

  it("rejects duplicate targetCups across tiers", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [
        { targetCups: 10, discountAmount: 100 },
        { targetCups: 10, discountAmount: 200 }
      ],
      maximumCups: 10,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "tier_target_cups_duplicate");
  });

  it("rejects maximumCups that does not match the highest tier", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: 100 }],
      maximumCups: 20,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "maximum_cups_must_equal_highest_tier");
  });

  it("rejects a discount that floors to less than 1 per cup at the top of its range", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: 5 }],
      maximumCups: 10,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "discount_per_cup_below_minimum");
  });

  it("rejects a discount per cup that exceeds the minimum sellable unit price", () => {
    const result = validateDiscountTierConfiguration({
      tiers: [{ targetCups: 10, discountAmount: 500 }],
      maximumCups: 10,
      minimumSellableUnitPrice: 20
    });
    assert.equal(result.reason, "discount_per_cup_exceeds_minimum_unit_price");
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

describe("findOrderDiscountConflicts", () => {
  it("returns items whose unit price is below the maximum discount per cup", () => {
    const conflicts = findOrderDiscountConflicts(
      [
        { menuItemId: "a", unitPrice: 5 },
        { menuItemId: "b", unitPrice: 20 }
      ],
      10
    );
    assert.deepEqual(conflicts, [
      { itemIndex: 0, menuItemId: "a", unitPrice: 5, maximumDiscountPerCup: 10 }
    ]);
  });

  it("flags items with a missing or non-integer unit price", () => {
    const conflicts = findOrderDiscountConflicts([{ menuItemId: "c" }], 10);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].menuItemId, "c");
  });

  it("returns an empty list when maximumDiscountPerCup is not a positive integer", () => {
    assert.deepEqual(findOrderDiscountConflicts([{ unitPrice: 1 }], 0), []);
    assert.deepEqual(findOrderDiscountConflicts([{ unitPrice: 1 }], -5), []);
  });
});

describe("normalizeDiscountTiers", () => {
  it("sorts tiers ascending by targetCups", () => {
    const normalized = normalizeDiscountTiers([
      { targetCups: 20, discountAmount: 300 },
      { targetCups: 10, discountAmount: 100 }
    ]);
    assert.deepEqual(normalized.map((tier) => tier.targetCups), [10, 20]);
  });

  it("filters out invalid tiers by default", () => {
    const normalized = normalizeDiscountTiers([
      { targetCups: 10, discountAmount: 100 },
      { targetCups: -1, discountAmount: 100 }
    ]);
    assert.equal(normalized.length, 1);
  });

  it("keeps invalid tiers when preserveInvalid is set", () => {
    const normalized = normalizeDiscountTiers(
      [{ targetCups: -1, discountAmount: 100 }],
      { preserveInvalid: true }
    );
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].targetCups, -1);
  });

  it("accepts snake_case field names", () => {
    const normalized = normalizeDiscountTiers([
      { target_cups: 10, discount_amount: 100 }
    ]);
    assert.deepEqual(normalized[0], {
      id: null,
      targetCups: 10,
      discountAmount: 100,
      sortOrder: 0
    });
  });
});
