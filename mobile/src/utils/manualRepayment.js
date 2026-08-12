export function getManualRepaymentStateInfo(manualRepayment) {
  if (!manualRepayment || manualRepayment.eligible) {
    return {
      statusText: "自動扣款已停止，這次將依結算後金額直接付款。",
      disabled: false,
      disabledLabel: null
    };
  }

  if (manualRepayment.reason === "automatic_capture_not_finished") {
    const attempt = manualRepayment.failedCapture?.attemptNumber;
    return {
      statusText: attempt
        ? `系統正在自動重試請款（已嘗試 ${attempt} / 3 次），請稍候，不需要手動操作。`
        : "系統正在自動請款，請稍候，不需要手動操作。",
      disabled: true,
      disabledLabel: "系統自動請款中"
    };
  }
  if (manualRepayment.reason === "manual_repayment_expired") {
    return {
      statusText: "已超過取餐前 15 分鐘的重新付款期限，不能再重新付款。",
      disabled: true,
      disabledLabel: "已超過重新付款期限"
    };
  }
  if (manualRepayment.reason === "repayment_already_pending") {
    return {
      statusText: "已有一筆重新付款正在處理中，請稍候或稍後刷新狀態。",
      disabled: true,
      disabledLabel: "重新付款處理中"
    };
  }
  if (manualRepayment.reason === "already_paid") {
    return {
      statusText: "這筆訂單其實已經付款完成，正在同步最新狀態。",
      disabled: true,
      disabledLabel: "已完成付款"
    };
  }
  if (manualRepayment.reason === "final_amount_missing") {
    return {
      statusText: "結算金額尚未確定，請稍後再試。",
      disabled: true,
      disabledLabel: "結算金額確認中"
    };
  }

  return {
    statusText: "自動扣款已停止，這次將依結算後金額直接付款。",
    disabled: false,
    disabledLabel: null
  };
}
