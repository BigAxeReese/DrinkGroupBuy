"use strict";

function calculateDiscountPerCup(discountAmount, cupCount) {
  const normalizedDiscount = Number(discountAmount);
  const normalizedCups = Number(cupCount);
  if (!Number.isInteger(normalizedDiscount) || normalizedDiscount < 0) return 0;
  if (!Number.isInteger(normalizedCups) || normalizedCups <= 0) return 0;
  return Math.floor(normalizedDiscount / normalizedCups);
}

function calculateGroupBuyDiscountSummary(tiers, authorizedCups) {
  const normalizedCups = Number.isInteger(Number(authorizedCups))
    ? Math.max(Number(authorizedCups), 0)
    : 0;
  const normalizedTiers = normalizeDiscountTiers(tiers);
  const appliedTier = normalizedTiers
    .filter((tier) => normalizedCups >= tier.targetCups)
    .at(-1) || null;
  const nextTier = normalizedTiers.find((tier) => normalizedCups < tier.targetCups) || null;
  const discountPerCup = appliedTier
    ? calculateDiscountPerCup(appliedTier.discountAmount, normalizedCups)
    : 0;
  const allocatedDiscountAmount = discountPerCup * normalizedCups;
  const undistributedDiscountAmount = appliedTier
    ? appliedTier.discountAmount - allocatedDiscountAmount
    : 0;

  return {
    currentTierId: appliedTier?.id || null,
    currentTierTargetCups: appliedTier?.targetCups || null,
    currentTierDiscountAmount: appliedTier?.discountAmount || 0,
    estimatedDiscountPerCup: discountPerCup,
    estimatedAllocatedDiscountAmount: allocatedDiscountAmount,
    estimatedUndistributedDiscountAmount: undistributedDiscountAmount,
    nextTierTargetCups: nextTier?.targetCups || null,
    cupsToNextTier: nextTier ? Math.max(nextTier.targetCups - normalizedCups, 0) : 0
  };
}

function validateDiscountTierConfiguration(input = {}) {
  const tiers = normalizeDiscountTiers(input.tiers, { preserveInvalid: true });
  const maximumCups = Number(input.maximumCups ?? tiers.at(-1)?.targetCups);
  const minimumSellableUnitPrice = Number(input.minimumSellableUnitPrice);

  if (tiers.length === 0) {
    return invalid("tiers_required");
  }
  if (!Number.isInteger(maximumCups) || maximumCups <= 0) {
    return invalid("maximum_cups_invalid", { maximumCups });
  }
  if (!Number.isInteger(minimumSellableUnitPrice) || minimumSellableUnitPrice <= 0) {
    return invalid("minimum_sellable_unit_price_invalid", { minimumSellableUnitPrice });
  }

  const seenTargets = new Set();
  for (const [index, tier] of tiers.entries()) {
    if (!Number.isInteger(tier.targetCups) || tier.targetCups <= 0) {
      return invalid("tier_target_cups_invalid", { tierIndex: index, targetCups: tier.targetCups });
    }
    if (!Number.isInteger(tier.discountAmount) || tier.discountAmount < 0) {
      return invalid("tier_discount_amount_invalid", {
        tierIndex: index,
        discountAmount: tier.discountAmount
      });
    }
    if (seenTargets.has(tier.targetCups)) {
      return invalid("tier_target_cups_duplicate", { tierIndex: index, targetCups: tier.targetCups });
    }
    seenTargets.add(tier.targetCups);
  }

  if (maximumCups !== tiers.at(-1).targetCups) {
    return invalid("maximum_cups_must_equal_highest_tier", {
      maximumCups,
      highestTargetCups: tiers.at(-1).targetCups
    });
  }

  let maximumDiscountPerCup = 0;
  const ranges = [];
  for (const [index, tier] of tiers.entries()) {
    const nextTier = tiers[index + 1];
    const reachableUpperCups = nextTier ? nextTier.targetCups - 1 : maximumCups;
    if (reachableUpperCups < tier.targetCups) {
      return invalid("tier_reachable_range_invalid", {
        tierIndex: index,
        targetCups: tier.targetCups,
        reachableUpperCups
      });
    }

    const minimumDiscountPerCup = calculateDiscountPerCup(
      tier.discountAmount,
      reachableUpperCups
    );
    const tierMaximumDiscountPerCup = calculateDiscountPerCup(
      tier.discountAmount,
      tier.targetCups
    );
    if (minimumDiscountPerCup < 1) {
      return invalid("discount_per_cup_below_minimum", {
        tierIndex: index,
        targetCups: tier.targetCups,
        reachableUpperCups,
        discountAmount: tier.discountAmount,
        minimumDiscountPerCup
      });
    }
    if (tierMaximumDiscountPerCup > minimumSellableUnitPrice) {
      return invalid("discount_per_cup_exceeds_minimum_unit_price", {
        tierIndex: index,
        targetCups: tier.targetCups,
        discountAmount: tier.discountAmount,
        maximumDiscountPerCup: tierMaximumDiscountPerCup,
        minimumSellableUnitPrice
      });
    }

    maximumDiscountPerCup = Math.max(maximumDiscountPerCup, tierMaximumDiscountPerCup);
    ranges.push({
      tierIndex: index,
      targetCups: tier.targetCups,
      reachableUpperCups,
      minimumDiscountPerCup,
      maximumDiscountPerCup: tierMaximumDiscountPerCup
    });
  }

  return {
    valid: true,
    tiers,
    maximumCups,
    minimumSellableUnitPrice,
    maximumDiscountPerCup,
    ranges
  };
}

function calculateMinimumSellableUnitPrice(menuItems) {
  const prices = [];
  for (const item of Array.isArray(menuItems) ? menuItems : []) {
    if (item.isAvailable === false) continue;
    const basePrice = Number(item.basePrice);
    if (!Number.isInteger(basePrice) || basePrice < 0) continue;

    let minimumUnitPrice = basePrice;
    let valid = true;
    for (const group of Array.isArray(item.customizationGroups) ? item.customizationGroups : []) {
      const minimumSelections = Number(group.minSelections || 0);
      if (!Number.isInteger(minimumSelections) || minimumSelections < 0) {
        valid = false;
        break;
      }
      if (minimumSelections === 0) continue;

      const availablePrices = (Array.isArray(group.options) ? group.options : [])
        .filter((option) => option.isAvailable !== false)
        .map((option) => Number(option.priceDelta))
        .filter((price) => Number.isInteger(price) && price >= 0)
        .sort((left, right) => left - right);
      if (availablePrices.length < minimumSelections) {
        valid = false;
        break;
      }
      minimumUnitPrice += availablePrices
        .slice(0, minimumSelections)
        .reduce((sum, price) => sum + price, 0);
    }
    if (valid) prices.push(minimumUnitPrice);
  }
  return prices.length > 0 ? Math.min(...prices) : null;
}

function findOrderDiscountConflicts(items, maximumDiscountPerCup) {
  const normalizedMaximum = Number(maximumDiscountPerCup);
  if (!Number.isInteger(normalizedMaximum) || normalizedMaximum <= 0) return [];

  return (Array.isArray(items) ? items : [])
    .map((item, itemIndex) => ({
      itemIndex,
      menuItemId: item.menuItemId || null,
      unitPrice: Number(item.unitPrice),
      maximumDiscountPerCup: normalizedMaximum
    }))
    .filter((item) => !Number.isInteger(item.unitPrice) || item.unitPrice < normalizedMaximum);
}

function normalizeDiscountTiers(tiers, input = {}) {
  const normalized = (Array.isArray(tiers) ? tiers : [])
    .map((tier) => ({
      id: tier.id || null,
      targetCups: Number(tier.targetCups ?? tier.target_cups ?? tier.cups),
      discountAmount: Number(tier.discountAmount ?? tier.discount_amount),
      sortOrder: Number(tier.sortOrder ?? tier.sort_order ?? 0)
    }))
    .sort((left, right) => left.targetCups - right.targetCups);

  if (input.preserveInvalid) return normalized;
  return normalized.filter((tier) => Number.isInteger(tier.targetCups)
    && tier.targetCups > 0
    && Number.isInteger(tier.discountAmount)
    && tier.discountAmount >= 0);
}

function invalid(reason, details = {}) {
  return {
    valid: false,
    error: "discount_tier_invalid",
    reason,
    ...details
  };
}

module.exports = {
  calculateDiscountPerCup,
  calculateGroupBuyDiscountSummary,
  calculateMinimumSellableUnitPrice,
  findOrderDiscountConflicts,
  normalizeDiscountTiers,
  validateDiscountTierConfiguration
};
