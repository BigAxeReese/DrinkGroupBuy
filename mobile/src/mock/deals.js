// prototype only, not final API contract

export const deals = [
  {
    id: "deal-001",
    storeId: "store-001",
    title: "離峰滿 20 杯折 400",
    status: "recruiting",
    currentCups: 14,
    targetCups: 20,
    maximumCups: 50,
    participantCount: 8,
    remainingTimeText: "剩 42 分鐘",
    endTime: "今日 15:30",
    pickupTime: "今日 16:30 - 17:00",
    canJoin: true,
    tiers: [
      { cups: 20, discountAmount: 400 },
      { cups: 35, discountAmount: 900 },
      { cups: 50, discountAmount: 1500 }
    ],
    notices: ["截止前可修改杯數或退出", "未達門檻時依個人原價購買偏好處理"]
  },
  {
    id: "deal-002",
    storeId: "store-002",
    title: "滿 30 杯折 750",
    status: "confirmed",
    currentCups: 33,
    targetCups: 30,
    maximumCups: 60,
    participantCount: 15,
    remainingTimeText: "已截止",
    endTime: "今日 14:00",
    pickupTime: "今日 15:30 - 16:00",
    canJoin: false,
    tiers: [
      { cups: 30, discountAmount: 750 },
      { cups: 45, discountAmount: 1200 }
    ],
    notices: ["已達成團門檻", "請依付款及取貨資訊完成流程"]
  },
  {
    id: "deal-003",
    storeId: "store-003",
    title: "晚間水果茶試賣",
    status: "cancelled",
    currentCups: 6,
    targetCups: 20,
    maximumCups: 40,
    participantCount: 4,
    remainingTimeText: "已取消",
    endTime: "今日 18:00",
    pickupTime: "今日 19:00 - 19:30",
    canJoin: false,
    cancellationReason: "商家臨時設備維修",
    tiers: [{ cups: 20, discountAmount: 300 }],
    notices: ["活動已取消，不會進行付款或取貨"]
  },
  {
    id: "deal-004",
    storeId: "store-001",
    title: "午后小團購未達門檻",
    status: "failed",
    currentCups: 8,
    targetCups: 20,
    maximumCups: 40,
    participantCount: 5,
    remainingTimeText: "已流團",
    endTime: "今日 13:00",
    pickupTime: "不適用",
    canJoin: false,
    tiers: [{ cups: 20, discountAmount: 400 }],
    notices: ["未達優惠門檻", "不接受原價購買者不付款"]
  }
];
