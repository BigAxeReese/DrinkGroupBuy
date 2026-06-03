// prototype only, not final API contract

export const drinks = [
  {
    id: "drink-001",
    storeId: "store-001",
    name: "青山烏龍拿鐵",
    category: "milk_tea",
    description: "木質烏龍茶香，搭配濃厚鮮奶",
    price: 65,
    sweetnessOptions: ["無糖", "微糖", "半糖", "正常"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "pearl", name: "珍珠", price: 10 },
      { id: "jelly", name: "茶凍", price: 12 }
    ]
  },
  {
    id: "drink-002",
    storeId: "store-001",
    name: "四季春青茶",
    category: "tea",
    description: "清香茶韻，入口回甘",
    price: 40,
    sweetnessOptions: ["無糖", "微糖", "半糖"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "aloe", name: "蘆薈", price: 15 }
    ]
  },
  {
    id: "drink-003",
    storeId: "store-002",
    name: "晨露鮮奶茶",
    category: "milk_tea",
    description: "經典鮮奶茶，茶香溫順",
    price: 70,
    sweetnessOptions: ["微糖", "半糖", "正常"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "pudding", name: "布丁", price: 15 }
    ]
  }
];
