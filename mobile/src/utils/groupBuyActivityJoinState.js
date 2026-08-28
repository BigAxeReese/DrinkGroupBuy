// Pure decision logic for the "join this group-buy activity" button, kept free of React
// Native imports so it can be unit tested directly under plain Node (see
// mobile/tests/groupBuyActivityJoinState.test.mjs).
export function getGroupBuyActivityJoinAction(groupBuyActivity, hasExistingOrder) {
  if (hasExistingOrder) {
    return { label: "前往我的訂單", target: "customerOrders" };
  }
  if (groupBuyActivity.canJoin) {
    return { label: "選擇飲料並加入", target: "drinkSelection" };
  }
  return { label: "目前不可加入", target: null };
}
