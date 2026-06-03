// prototype only, not final API contract

export const customerOrderDemo = {
  activeOrderId: "order-001",
  discountAmount: 100,
  minimumPayableAmount: 50,
  orderItems: [
    {
      id: "demo-item-001",
      drinkId: "drink-001",
      name: "青山烏龍拿鐵",
      size: "L",
      quantity: 1,
      sweetness: "微糖",
      ice: "少冰",
      toppings: ["珍珠"],
      unitPrice: 75,
      subtotal: 75
    },
    {
      id: "demo-item-002",
      drinkId: "drink-002",
      name: "四季春青茶",
      size: "L",
      quantity: 1,
      sweetness: "無糖",
      ice: "正常冰",
      toppings: ["不加料"],
      unitPrice: 40,
      subtotal: 40
    },
    {
      id: "demo-item-003",
      drinkId: "drink-004",
      name: "白玉歐蕾",
      size: "L",
      quantity: 1,
      sweetness: "半糖",
      ice: "去冰",
      toppings: ["白玉"],
      unitPrice: 70,
      subtotal: 70
    },
    {
      id: "demo-item-004",
      drinkId: "drink-005",
      name: "熟成紅茶",
      size: "M",
      quantity: 1,
      sweetness: "微糖",
      ice: "少冰",
      toppings: ["不加料"],
      unitPrice: 35,
      subtotal: 35
    },
    {
      id: "demo-item-005",
      drinkId: "drink-006",
      name: "鮮柚綠茶",
      size: "L",
      quantity: 1,
      sweetness: "微糖",
      ice: "正常冰",
      toppings: ["蘆薈"],
      unitPrice: 65,
      subtotal: 65
    },
    {
      id: "demo-item-006",
      drinkId: "drink-007",
      name: "黑糖珍珠鮮奶",
      size: "L",
      quantity: 1,
      sweetness: "固定甜",
      ice: "少冰",
      toppings: ["珍珠"],
      unitPrice: 80,
      subtotal: 80
    },
    {
      id: "demo-item-007",
      drinkId: "drink-008",
      name: "檸檬冬瓜",
      size: "M",
      quantity: 1,
      sweetness: "正常",
      ice: "正常冰",
      toppings: ["椰果"],
      unitPrice: 45,
      subtotal: 45
    }
  ],
  pickupPass: {
    label: "取貨憑證",
    code: "A7924",
    qrLabel: "QR"
  },
  historyOrders: []
};
