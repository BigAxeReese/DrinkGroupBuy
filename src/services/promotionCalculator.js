function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isPromotionActive(promotion, now = new Date()) {
  if (!promotion || promotion.status !== "active") {
    return false;
  }

  const currentTime = now.getTime();
  const startsAt = promotion.startsAt ? new Date(promotion.startsAt).getTime() : null;
  const endsAt = promotion.endsAt ? new Date(promotion.endsAt).getTime() : null;

  if (startsAt && currentTime < startsAt) {
    return false;
  }

  if (endsAt && currentTime > endsAt) {
    return false;
  }

  return true;
}

function getProgressValue(promotion, orderSummary) {
  if (promotion.targetType === "cups") {
    return toNumber(orderSummary.totalCups);
  }

  if (promotion.targetType === "amount") {
    return toNumber(orderSummary.totalAmount);
  }

  return 0;
}

function getDiscountAmount(promotion, orderSummary) {
  if (promotion.rewardType !== "fixed_amount") {
    return 0;
  }

  const rewardValue = toNumber(promotion.rewardValue);
  const totalAmount = toNumber(orderSummary.totalAmount);

  return Math.max(0, Math.min(rewardValue, totalAmount));
}

function calculatePromotion(promotion, orderSummary, options = {}) {
  const now = options.now || new Date();
  const totalAmount = toNumber(orderSummary.totalAmount);
  const targetValue = toNumber(promotion && promotion.targetValue);
  const progressValue = getProgressValue(promotion || {}, orderSummary || {});
  const remainingTarget = Math.max(targetValue - progressValue, 0);
  const isActive = isPromotionActive(promotion, now);
  const isTargetReached = targetValue > 0 && progressValue >= targetValue;
  const isEligible = isActive && isTargetReached;
  const discountAmount = isEligible ? getDiscountAmount(promotion, { totalAmount }) : 0;

  return {
    promotionId: promotion ? promotion.id : null,
    title: promotion ? promotion.title : "",
    targetType: promotion ? promotion.targetType : "",
    targetValue,
    progressValue,
    remainingTarget,
    progressRate: targetValue > 0 ? Math.min(progressValue / targetValue, 1) : 0,
    isActive,
    isTargetReached,
    isEligible,
    discountAmount,
    originalAmount: totalAmount,
    finalAmount: Math.max(totalAmount - discountAmount, 0),
    currency: promotion && promotion.currency ? promotion.currency : "TWD"
  };
}

function calculateBestPromotion(promotions, orderSummary, options = {}) {
  const results = (promotions || []).map((promotion) =>
    calculatePromotion(promotion, orderSummary, options)
  );

  return results.reduce((best, result) => {
    if (!best) {
      return result;
    }

    if (result.discountAmount > best.discountAmount) {
      return result;
    }

    if (result.discountAmount === best.discountAmount && result.isEligible && !best.isEligible) {
      return result;
    }

    if (result.discountAmount === best.discountAmount && result.progressRate > best.progressRate) {
      return result;
    }

    if (
      result.discountAmount === best.discountAmount &&
      result.progressRate === best.progressRate &&
      result.remainingTarget < best.remainingTarget
    ) {
      return result;
    }

    return best;
  }, null);
}

module.exports = {
  calculatePromotion,
  calculateBestPromotion,
  isPromotionActive
};
