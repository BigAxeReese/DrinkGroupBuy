const { createGroupBuy, listGroupBuys } = require("../src/services/groupBuyService");

const groupBuy = createGroupBuy(
  {
    title: "台中科大下午茶團購",
    shopId: "shop_006",
    promotionMatrix: [
      { targetValue: 15, rewardValue: 90 },
      { targetValue: 30, rewardValue: 240 },
      { targetValue: 50, rewardValue: 500 }
    ],
    createdBy: "google_user_demo",
    deadline: "2026-05-22T15:00:00+08:00",
    note: "測試建立團購功能"
  },
  {
    now: new Date("2026-05-21T12:00:00+08:00")
  }
);

console.log("created group buy:");
console.log(JSON.stringify(groupBuy, null, 2));
console.log(`total group buys: ${listGroupBuys().length}`);
