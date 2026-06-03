// prototype only, not final API contract

export const orders = [
  {
    id: "order-001",
    dealId: "deal-001",
    customerSurname: "林",
    itemName: "青山烏龍拿鐵",
    quantity: 2,
    sweetness: "微糖",
    ice: "少冰",
    toppings: ["珍珠"],
    subtotal: 150,
    fallbackPurchasePreference: "decline_original_price",
    originalAmount: 150,
    authorizedAmount: 150,
    finalAmount: null,
    captureAmount: null,
    releasedAmount: null,
    paymentStatus: "authorized",
    authorizationStatus: "authorized",
    pickupStatus: "not_ready"
  },
  {
    id: "order-002",
    dealId: "deal-002",
    customerSurname: "陳",
    itemName: "晨露鮮奶茶",
    quantity: 1,
    sweetness: "半糖",
    ice: "去冰",
    toppings: ["布丁"],
    subtotal: 85,
    fallbackPurchasePreference: "accept_original_price",
    originalAmount: 85,
    authorizedAmount: 85,
    finalAmount: 63,
    captureAmount: 63,
    releasedAmount: 22,
    paymentStatus: "captured",
    authorizationStatus: "captured",
    pickupStatus: "ready"
  }
];
