// Frontend prototype shapes only, not final API contract.

/**
 * @typedef {"recruiting" | "confirmed" | "failed" | "cancelled"} DealStatus
 * @typedef {"pending" | "submitted" | "confirmed" | "not_required"} PaymentStatus
 * @typedef {"pending" | "ready" | "picked_up" | "cancelled"} PickupStatus
 */

export const dealStatusLabels = {
  recruiting: "??銝?,
  confirmed: "撌脫???,
  failed: "瘚?",
  cancelled: "撌脣?瘨?,
};

export const paymentStatusLabels = {
  pending: "敺?甈?,
  submitted: "撌脣??梧?敺Ⅱ隤?,
  confirmed: "隞狡撌脩Ⅱ隤?,
  not_required: "?⊿?隞狡",
};

export const pickupStatusLabels = {
  pending: "蝑???",
  ready: "?臭??挾?疏",
  picked_up: "撌脣?鞎?,
  cancelled: "撌脣?瘨?,
};
