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
    remainingTimeText: "剩 25 分鐘",
    minutesUntilDeadline: 25,
    withdrawalLockMinutes: 30,
    endTime: "今日 15:30",
    pickupTime: "今日 16:30 - 17:00",
    canJoin: true,
    tiers: [
      { cups: 20, discountAmount: 400 },
      { cups: 35, discountAmount: 900 },
      { cups: 50, discountAmount: 1500 }
    ],
    notices: ["截止前 30 分鐘仍可加入，但不可退出", "未達門檻時依個人原價購買偏好處理"]
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
  },
  {
    id: "deal-005",
    storeId: "store-002",
    title: "鮮奶茶滿 15 杯折 300",
    status: "recruiting",
    currentCups: 9,
    targetCups: 15,
    maximumCups: 30,
    participantCount: 6,
    remainingTimeText: "剩 50 分鐘",
    minutesUntilDeadline: 50,
    withdrawalLockMinutes: 30,
    endTime: "今日 16:20",
    pickupTime: "今日 17:00 - 17:30",
    canJoin: true,
    tiers: [
      { cups: 15, discountAmount: 300 },
      { cups: 30, discountAmount: 700 }
    ],
    notices: ["只有預授權成功的杯數會計入門檻"]
  },
  {
    id: "deal-007",
    storeId: "store-004",
    title: "黑糖鮮奶滿 20 杯折 350",
    status: "recruiting",
    currentCups: 12,
    targetCups: 20,
    maximumCups: 35,
    participantCount: 9,
    remainingTimeText: "剩 45 分鐘",
    minutesUntilDeadline: 45,
    withdrawalLockMinutes: 30,
    endTime: "今日 17:10",
    pickupTime: "今日 17:40 - 18:10",
    canJoin: true,
    tiers: [
      { cups: 20, discountAmount: 350 },
      { cups: 35, discountAmount: 800 }
    ],
    notices: ["測試店家與座標皆為 prototype mock data"]
  },
  {
    id: "deal-008",
    storeId: "store-005",
    title: "純茶系列滿 15 杯折 250",
    status: "recruiting",
    currentCups: 6,
    targetCups: 15,
    maximumCups: 30,
    participantCount: 5,
    remainingTimeText: "剩 1 小時",
    minutesUntilDeadline: 60,
    withdrawalLockMinutes: 30,
    endTime: "今日 17:30",
    pickupTime: "今日 18:00 - 18:30",
    canJoin: true,
    tiers: [
      { cups: 15, discountAmount: 250 },
      { cups: 30, discountAmount: 650 }
    ],
    notices: ["測試店家與座標皆為 prototype mock data"]
  },
  {
    id: "deal-009",
    storeId: "store-006",
    title: "果茶滿 25 杯折 600",
    status: "recruiting",
    currentCups: 17,
    targetCups: 25,
    maximumCups: 40,
    participantCount: 11,
    remainingTimeText: "剩 1 小時 35 分",
    minutesUntilDeadline: 95,
    withdrawalLockMinutes: 30,
    endTime: "今日 18:20",
    pickupTime: "今日 18:50 - 19:20",
    canJoin: true,
    tiers: [
      { cups: 25, discountAmount: 600 },
      { cups: 40, discountAmount: 1100 }
    ],
    notices: ["測試店家與座標皆為 prototype mock data"]
  },
  {
    id: "deal-010",
    storeId: "store-007",
    title: "鮮乳茶滿 20 杯折 450",
    status: "recruiting",
    currentCups: 8,
    targetCups: 20,
    maximumCups: 40,
    participantCount: 6,
    remainingTimeText: "剩 2 小時",
    minutesUntilDeadline: 120,
    withdrawalLockMinutes: 30,
    endTime: "今日 19:00",
    pickupTime: "今日 19:30 - 20:00",
    canJoin: true,
    tiers: [
      { cups: 20, discountAmount: 450 },
      { cups: 40, discountAmount: 1000 }
    ],
    notices: ["測試店家與座標皆為 prototype mock data"]
  }
];
