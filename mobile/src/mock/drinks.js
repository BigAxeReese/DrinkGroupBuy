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
  },
  {
    id: "drink-004",
    storeId: "store-001",
    name: "白玉歐蕾",
    category: "milk_tea",
    description: "鮮奶香氣搭配軟Q白玉",
    price: 60,
    sweetnessOptions: ["微糖", "半糖", "正常"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "white_boba", name: "白玉", price: 10 }
    ]
  },
  {
    id: "drink-005",
    storeId: "store-001",
    name: "熟成紅茶",
    category: "tea",
    description: "厚實紅茶香，尾韻清爽",
    price: 35,
    sweetnessOptions: ["無糖", "微糖", "半糖", "正常"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "jelly", name: "茶凍", price: 12 }
    ]
  },
  {
    id: "drink-006",
    storeId: "store-001",
    name: "鮮柚綠茶",
    category: "fruit",
    description: "柚香果粒與清爽綠茶",
    price: 50,
    sweetnessOptions: ["無糖", "微糖", "半糖"],
    iceOptions: ["少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "aloe", name: "蘆薈", price: 15 }
    ]
  },
  {
    id: "drink-007",
    storeId: "store-001",
    name: "黑糖珍珠鮮奶",
    category: "milk_tea",
    description: "黑糖香氣與鮮奶厚度",
    price: 70,
    sweetnessOptions: ["固定甜"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "pearl", name: "珍珠", price: 10 }
    ]
  },
  {
    id: "drink-008",
    storeId: "store-001",
    name: "檸檬冬瓜",
    category: "fruit",
    description: "冬瓜甜感搭配檸檬酸香",
    price: 35,
    sweetnessOptions: ["微糖", "半糖", "正常"],
    iceOptions: ["少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "coconut_jelly", name: "椰果", price: 10 }
    ]
  },
  {
    id: "drink-009",
    storeId: "store-004",
    name: "黑糖珍珠鮮奶",
    category: "milk_tea",
    description: "黑糖香氣搭配鮮奶與珍珠",
    price: 70,
    sweetnessOptions: ["固定甜"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "pearl", name: "珍珠", price: 10 }
    ]
  },
  {
    id: "drink-010",
    storeId: "store-005",
    name: "高山四季春",
    category: "tea",
    description: "清香回甘的純茶",
    price: 40,
    sweetnessOptions: ["無糖", "微糖", "半糖"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "jelly", name: "茶凍", price: 12 }
    ]
  },
  {
    id: "drink-011",
    storeId: "store-006",
    name: "柳橙百香綠",
    category: "fruit",
    description: "柳橙與百香果搭配清爽綠茶",
    price: 60,
    sweetnessOptions: ["微糖", "半糖", "正常"],
    iceOptions: ["少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "aloe", name: "蘆薈", price: 15 }
    ]
  },
  {
    id: "drink-012",
    storeId: "store-007",
    name: "雙十鮮乳茶",
    category: "milk_tea",
    description: "濃郁鮮乳與熟香紅茶",
    price: 65,
    sweetnessOptions: ["無糖", "微糖", "半糖"],
    iceOptions: ["去冰", "少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "pudding", name: "布丁", price: 15 }
    ]
  },
  {
    id: "drink-013",
    storeId: "store-003",
    name: "午後百香果茶",
    category: "fruit",
    description: "百香果酸甜搭配清香綠茶",
    price: 55,
    sweetnessOptions: ["微糖", "半糖", "正常"],
    iceOptions: ["少冰", "正常冰"],
    toppings: [
      { id: "none", name: "不加料", price: 0 },
      { id: "coconut_jelly", name: "椰果", price: 10 }
    ]
  }
];
