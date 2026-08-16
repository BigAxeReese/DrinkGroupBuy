"use strict";

const PICKUP_OVERDUE_RULE = Object.freeze({
  ruleType: "pickup_overdue",
  ruleVersion: "v1.0",
  title: "取餐與逾期未取規則",
  content: [
    "取餐代碼自取餐開始時間起保留 3 小時；若店家當日營業結束早於 3 小時，則保留至當日營業結束。",
    "逾期未取不會自動退款。逾期後若飲品仍在且店家判斷可安全交付，顧客可憑歷史訂單與店家協調領取；若因品質、衛生、保存時間或條件不適合交付，店家可以不再提供原飲品，且不得交付有食品安全疑慮的飲品。",
    "若因店家保存不當、製作錯誤或其他可歸責於店家的原因無法交付，不得視為顧客逾期未取，應另依退款、重做或補償流程處理。顧客在有效取餐期間內到店而店家無法交付時，也不得標記為逾期未取。"
  ].join("\n")
});

function getPickupOverdueRule() {
  return { ...PICKUP_OVERDUE_RULE };
}

function validatePickupOverdueRuleConsent(consent) {
  if (!consent || consent.accepted !== true) {
    return {
      statusCode: 400,
      payload: {
        error: "Pickup overdue rule consent is required",
        status: "rule_consent_required"
      }
    };
  }
  if (
    consent.ruleType !== PICKUP_OVERDUE_RULE.ruleType
    || consent.ruleVersion !== PICKUP_OVERDUE_RULE.ruleVersion
  ) {
    return {
      statusCode: 409,
      payload: {
        error: "Pickup overdue rule version is outdated",
        status: "rule_version_outdated",
        currentRule: getPickupOverdueRule()
      }
    };
  }
  return null;
}

function buildOrderRuleConsentRecord({ orderId, customerUserId, consentedAt }) {
  return {
    orderId,
    customerUserId,
    ruleType: PICKUP_OVERDUE_RULE.ruleType,
    ruleVersion: PICKUP_OVERDUE_RULE.ruleVersion,
    ruleContentSnapshot: PICKUP_OVERDUE_RULE.content,
    consentedAt: consentedAt || new Date().toISOString()
  };
}

module.exports = {
  buildOrderRuleConsentRecord,
  getPickupOverdueRule,
  validatePickupOverdueRuleConsent
};
