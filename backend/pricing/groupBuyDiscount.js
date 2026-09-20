"use strict";

const MIN_DISCOUNT_PERCENT = 1;
const MAX_DISCOUNT_PERCENT = 99;

// Resolves which tier (if any) a cup count currently qualifies for. Unlike the old flat-amount
// model this returns NO dollar amount -- a percentage discount has to be computed per order
// against that order's own original_amount (see calculatePercentageDiscount), since two orders
// at the same tier can owe different discounts if their items are priced differently.
function resolveAppliedDiscountTier(tiers, authorizedCups) {
  const normalizedCups = Number.isInteger(Number(authorizedCups))
    ? Math.max(Number(authorizedCups), 0)
    : 0;
  const normalizedTiers = normalizeDiscountTiers(tiers);
  const appliedTier = normalizedTiers
    .filter((tier) => normalizedCups >= tier.targetCups)
    .at(-1) || null;
  const nextTier = normalizedTiers.find((tier) => normalizedCups < tier.targetCups) || null;

  return {
    currentTierId: appliedTier?.id || null,
    currentTierTargetCups: appliedTier?.targetCups || null,
    currentTierDiscountPercent: appliedTier?.discountPercent || 0,
    nextTierTargetCups: nextTier?.targetCups || null,
    cupsToNextTier: nextTier ? Math.max(nextTier.targetCups - normalizedCups, 0) : 0
  };
}

// Computes ONE order's discount from ITS OWN original amount. Rounds the amount the CUSTOMER
// PAYS UP to the nearest whole NTD dollar (not the discount down), matching the product decision
// that rounding favors the merchant the same way the old floor-per-cup-with-remainder model did:
// $65 @ 7折 (discountPercent=30, pay 70%) -> 65*0.70=45.5 -> ceil -> pays $46, discount $19.
function calculatePercentageDiscount(originalAmount, discountPercent) {
  const originalAmt = Number(originalAmount);
  const percent = Number(discountPercent);
  if (!Number.isInteger(originalAmt) || originalAmt < 0) {
    throw new Error(`Invalid originalAmount for percentage discount: ${originalAmount}`);
  }
  if (!Number.isInteger(percent) || percent < MIN_DISCOUNT_PERCENT || percent > MAX_DISCOUNT_PERCENT) {
    throw new Error(`Invalid discountPercent for percentage discount: ${discountPercent}`);
  }
  const finalAmount = Math.ceil((originalAmt * (100 - percent)) / 100);
  return { finalAmount, discountAmount: originalAmt - finalAmount };
}

function validateDiscountTierConfiguration(input = {}) {
  const tiers = normalizeDiscountTiers(input.tiers, { preserveInvalid: true });
  const maximumCups = Number(input.maximumCups ?? tiers.at(-1)?.targetCups);

  if (tiers.length === 0) {
    return invalid("tiers_required");
  }
  if (!Number.isInteger(maximumCups) || maximumCups <= 0) {
    return invalid("maximum_cups_invalid", { maximumCups });
  }

  const seenTargets = new Set();
  for (const [index, tier] of tiers.entries()) {
    if (!Number.isInteger(tier.targetCups) || tier.targetCups <= 0) {
      return invalid("tier_target_cups_invalid", { tierIndex: index, targetCups: tier.targetCups });
    }
    if (!Number.isInteger(tier.discountPercent)
      || tier.discountPercent < MIN_DISCOUNT_PERCENT
      || tier.discountPercent > MAX_DISCOUNT_PERCENT) {
      return invalid("tier_discount_percent_invalid", {
        tierIndex: index,
        discountPercent: tier.discountPercent
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
    if (index > 0 && tier.discountPercent <= tiers[index - 1].discountPercent) {
      return invalid("tier_discount_percent_not_increasing", {
        tierIndex: index,
        targetCups: tier.targetCups,
        discountPercent: tier.discountPercent,
        previousDiscountPercent: tiers[index - 1].discountPercent
      });
    }
    ranges.push({ tierIndex: index, targetCups: tier.targetCups, reachableUpperCups });
  }

  return {
    valid: true,
    tiers,
    maximumCups,
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

function normalizeDiscountTiers(tiers, input = {}) {
  const normalized = (Array.isArray(tiers) ? tiers : [])
    .map((tier) => ({
      id: tier.id || null,
      targetCups: Number(tier.targetCups ?? tier.target_cups ?? tier.cups),
      discountPercent: Number(tier.discountPercent ?? tier.discount_percent),
      sortOrder: Number(tier.sortOrder ?? tier.sort_order ?? 0)
    }))
    .sort((left, right) => left.targetCups - right.targetCups);

  if (input.preserveInvalid) return normalized;
  return normalized.filter((tier) => Number.isInteger(tier.targetCups)
    && tier.targetCups > 0
    && Number.isInteger(tier.discountPercent)
    && tier.discountPercent >= MIN_DISCOUNT_PERCENT
    && tier.discountPercent <= MAX_DISCOUNT_PERCENT);
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
  MIN_DISCOUNT_PERCENT,
  MAX_DISCOUNT_PERCENT,
  calculateMinimumSellableUnitPrice,
  calculatePercentageDiscount,
  normalizeDiscountTiers,
  resolveAppliedDiscountTier,
  validateDiscountTierConfiguration
};
