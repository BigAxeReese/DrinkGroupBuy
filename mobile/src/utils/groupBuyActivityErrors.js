export function validateGroupBuyActivityTierDrafts(tiers = []) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return {
      valid: false,
      message: "請至少設定一個優惠級距。",
      tierErrors: {}
    };
  }

  const tierErrors = {};
  const targetOwners = new Map();

  for (const tier of tiers) {
    const targetCups = Number(tier.cups);
    const discountAmount = Number(tier.discountAmount);

    if (!Number.isInteger(targetCups) || targetCups <= 0) {
      tierErrors[tier.id] = "杯數門檻必須是大於 0 的整數。";
      continue;
    }
    if (!Number.isInteger(discountAmount) || discountAmount <= 0) {
      tierErrors[tier.id] = "折扣金額必須是大於 0 的整數。";
      continue;
    }

    if (targetOwners.has(targetCups)) {
      tierErrors[targetOwners.get(targetCups)] = "杯數門檻不可重複。";
      tierErrors[tier.id] = "杯數門檻不可重複。";
    } else {
      targetOwners.set(targetCups, tier.id);
    }
  }

  return {
    valid: Object.keys(tierErrors).length === 0,
    message: Object.keys(tierErrors).length === 0 ? "" : "請修正標示的優惠級距。",
    tierErrors
  };
}

export function mapGroupBuyActivityCreateError(error, tiers = []) {
  const payload = error?.payload ?? {};
  const tierByTarget = payload.targetCups == null
    ? null
    : tiers.find((candidate) => Number(candidate.cups) === Number(payload.targetCups));
  const tier = tierByTarget
    ?? (Number.isInteger(payload.tierIndex) ? tiers[payload.tierIndex] : null);
  const tierErrors = {};
  const setTierError = (message) => {
    if (tier?.id) tierErrors[tier.id] = message;
    return message;
  };

  if (payload.error === "pickup_start_too_late_for_store_hours") {
    const latestTime = payload.latestPickupStartAt
      ? new Date(payload.latestPickupStartAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
      : null;
    const message = latestTime
      ? `取餐開始時間太晚：店家 ${payload.closingTime} 打烊，取餐需要完整 3 小時，取餐開始最晚要設在 ${latestTime}。`
      : `取餐開始時間太晚，超過店家 ${payload.closingTime} 打烊前預留的 3 小時取餐時段。`;
    return { message, tierErrors };
  }

  if (payload.error === "discount_menu_invalid") {
    if (payload.reason === "store_menu_empty") {
      return {
        message: "店家目前沒有可用菜單，請先上架至少一項飲品。",
        tierErrors
      };
    }
    return {
      message: "店家菜單缺少可計算的最低單杯價格，請先檢查飲品價格與必要客製化選項。",
      tierErrors
    };
  }

  const tierMessages = {
    tier_target_cups_invalid: "杯數門檻必須是大於 0 的整數。",
    tier_discount_amount_invalid: "折扣金額必須是大於 0 的整數。",
    tier_target_cups_duplicate: "杯數門檻不可重複。",
    maximum_cups_must_equal_highest_tier: "最高杯數必須等於最後一個優惠級距。",
    tier_reachable_range_invalid: "級距杯數必須由小到大排列，且不可重疊。"
  };

  if (payload.error === "discount_tier_invalid") {
    if (payload.reason === "discount_per_cup_below_minimum") {
      const message = `這個級距在最多 ${payload.reachableUpperCups ?? "目前設定的"} 杯時，每杯折扣會變成 0 元。請提高總折扣或降低下一級距杯數。`;
      return { message: setTierError(message), tierErrors };
    }
    if (payload.reason === "discount_per_cup_exceeds_minimum_unit_price") {
      const message = `這個級距每杯最多折 ${payload.maximumDiscountPerCup ?? "目前設定"} 元，超過店內最低可售單杯 ${payload.minimumSellableUnitPrice ?? "價格"} 元。請降低總折扣。`;
      return { message: setTierError(message), tierErrors };
    }
    if (tierMessages[payload.reason]) {
      const message = tierMessages[payload.reason];
      return { message: setTierError(message), tierErrors };
    }
    if (payload.reason === "tiers_required") {
      return { message: "請至少設定一個優惠級距。", tierErrors };
    }
  }

  return {
    message: `建立失敗：${payload.reason || payload.error || error?.message || "請稍後再試"}`,
    tierErrors
  };
}
