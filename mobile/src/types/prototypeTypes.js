// Frontend/mobile prototype shapes only, not final API contract.

export const dealStatusLabels = {
  recruiting: "招募中",
  confirmed: "已成團",
  formed: "已成團",
  failed: "流團",
  cancelled: "已取消",
  full: "已額滿"
};

export const paymentStatusLabels = {
  pending: "待預授權",
  submitted: "付款回報已送出（舊流程）",
  confirmed: "付款已確認（舊流程）",
  not_required: "無需付款",
  authorized: "已預授權",
  captured: "已請款",
  authorization_voided: "授權已取消",
  released: "已釋放授權",
  failed: "付款失敗"
};

export const discountStatusLabels = {
  not_yet_qualified: "尚未達標",
  qualified: "優惠成立",
  failed: "未達標"
};

export const merchantAcceptanceStatusLabels = {
  pending: "等待店家確認接單",
  accepted: "店家已確認接單",
  rejected: "店家未接單",
  cancelled: "訂單已取消"
};

export const pickupStatusLabels = {
  not_ready: "尚未可取貨",
  ready: "可取貨",
  picked_up: "已取貨",
  cancelled: "已取消",
  expired: "已逾期"
};
