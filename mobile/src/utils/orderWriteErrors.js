import { formatDeadlineLabel } from "./deadlineTime";
import { lookupErrorMessage } from "./errorMessageLookup";

// Shared by createOrder/updateOrder/createOrderRevision -- their error codes overlap (e.g.
// capacity_exceeded, activity_not_joinable) since all three go through the same order-write
// validation on the backend. Anything not listed here falls through to the raw backend error
// code instead of Traditional Chinese text -- see PROGRESS.md's "失敗提示細化" entry.
const ORDER_WRITE_ERROR_MESSAGES = {
  order_price_changed: "菜單價格已更新，請重新確認購物車金額後再送出。",
  order_items_invalid: "飲品、供應狀態或客製化選項已變更，請重新選擇後再送出。",
  order_discount_conflict: "部分品項的折扣後金額低於最低售價限制，請重新整理菜單後再試一次。",
  activity_not_found: "找不到這個團購活動，可能已被移除，請返回重新確認。",
  customer_not_found: "找不到顧客資料，請重新登入後再試一次。",
  order_already_exists: "這個團購已經有一筆進行中的訂單，請前往該筆訂單查看。",
  activity_not_joinable: "這個團購目前無法加入或修改，可能已截止或已取消。",
  order_not_found: "找不到這筆訂單，請重新整理後再試一次。",
  order_access_denied: "沒有權限修改這筆訂單。",
  order_not_editable: "這筆訂單的付款狀態剛好有變化，請重新整理後再試一次。",
  order_not_revisable: "訂單目前的狀態無法修改，請重新整理查看最新狀態。",
  order_revision_already_pending: "這筆訂單已經有一筆修改正在處理中，請先完成付款或稍後再試。",
  order_authorization_missing: "找不到這筆訂單的付款授權紀錄，請聯繫客服協助處理。"
};

export function getOrderWriteErrorMessage(payload, fallback) {
  if (payload?.error === "capacity_exceeded") {
    const { maximumCups, authorizedCups, requestedCups } = payload;
    return Number.isFinite(maximumCups) && Number.isFinite(authorizedCups) && Number.isFinite(requestedCups)
      ? `此團購最多 ${maximumCups} 杯，目前已有 ${authorizedCups} 杯，無法再加入 ${requestedCups} 杯。`
      : "此團購已達杯數上限，無法再加入或修改。";
  }
  if (payload?.error === "order_locked_by_deadline") {
    const deadlineLabel = payload.deadlineAt ? formatDeadlineLabel(payload.deadlineAt) : null;
    return deadlineLabel
      ? `團購即將於 ${deadlineLabel} 截止（截止前 ${payload.lockMinutes ?? 30} 分鐘起鎖定訂單），已無法修改。`
      : "團購即將截止，已無法修改訂單。";
  }
  return lookupErrorMessage(payload?.error, ORDER_WRITE_ERROR_MESSAGES, payload?.error ?? fallback);
}
