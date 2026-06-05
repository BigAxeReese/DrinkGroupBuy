-- Prototype test data only, not final API contract or production data.

INSERT INTO test_metadata (key, value) VALUES
  ('purpose', 'prototype only, not final production database'),
  ('created_for', 'mobile map, merchant, menu, and customer persistence testing'),
  ('map_center', 'National Taichung University of Science and Technology');

INSERT INTO users (id, role, display_name) VALUES
  ('user-customer-001', 'customer', 'Alice Wang'),
  ('user-merchant-001', 'merchant', '青山手作茶商家'),
  ('user-merchant-002', 'merchant', '晨露鮮奶茶商家'),
  ('user-merchant-003', 'merchant', '午後水果茶商家'),
  ('user-merchant-004', 'merchant', '一中黑糖研究所商家'),
  ('user-merchant-005', 'merchant', '北區茶作館商家'),
  ('user-merchant-006', 'merchant', '柳川果茶室商家'),
  ('user-merchant-007', 'merchant', '雙十鮮乳坊商家'),
  ('user-admin-001', 'admin', 'Prototype Admin');

INSERT INTO stores (
  id, merchant_user_id, name, address, phone, business_status,
  distance_text, latitude, longitude
) VALUES
  ('store-001', 'user-merchant-001', '青山手作茶 中科店', '台中市北區三民路三段 150 號', '04-2233-0001', 'open', '280m', 24.1511, 120.6817),
  ('store-002', 'user-merchant-002', '晨露鮮奶茶 一中店', '台中市北區太平路 55 號', '04-2233-0002', 'open', '420m', 24.1481, 120.6862),
  ('store-003', 'user-merchant-003', '午後水果茶 雙十店', '台中市北區雙十路一段 18 號', '04-2233-0003', 'temporarily_closed', '650m', 24.1525, 120.6868),
  ('store-004', 'user-merchant-004', '一中黑糖研究所', '台中市北區太平路 38 號', '04-2233-0004', 'open', '350m', 24.1505, 120.6859),
  ('store-005', 'user-merchant-005', '北區茶作館', '台中市北區育才北路 22 號', '04-2233-0005', 'open', '520m', 24.1522, 120.6827),
  ('store-006', 'user-merchant-006', '柳川果茶室', '台中市北區中華路二段 88 號', '04-2233-0006', 'open', '780m', 24.1472, 120.6809),
  ('store-007', 'user-merchant-007', '雙十鮮乳坊', '台中市北區雙十路二段 35 號', '04-2233-0007', 'open', '860m', 24.1541, 120.6892);

INSERT INTO menu_items (
  id, store_id, name, category, description, price,
  sweetness_options_json, ice_options_json, toppings_json
) VALUES
  ('drink-001', 'store-001', '青山烏龍拿鐵', 'milk_tea', '木質烏龍茶香，搭配濃厚鮮奶', 65, '["無糖","微糖","半糖","正常"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"pearl","name":"珍珠","price":10}]'),
  ('drink-002', 'store-001', '四季春青茶', 'tea', '清香茶韻，入口回甘', 40, '["無糖","微糖","半糖"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"aloe","name":"蘆薈","price":15}]'),
  ('drink-003', 'store-002', '晨露鮮奶茶', 'milk_tea', '經典鮮奶茶，茶香溫順', 70, '["微糖","半糖","正常"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"pudding","name":"布丁","price":15}]'),
  ('drink-004', 'store-003', '午後百香果茶', 'fruit', '百香果酸甜搭配清香綠茶', 55, '["微糖","半糖","正常"]', '["少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"coconut_jelly","name":"椰果","price":10}]'),
  ('drink-005', 'store-004', '黑糖珍珠鮮奶', 'milk_tea', '黑糖香氣搭配鮮奶與珍珠', 70, '["固定甜"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"pearl","name":"珍珠","price":10}]'),
  ('drink-006', 'store-005', '高山四季春', 'tea', '清香回甘的純茶', 40, '["無糖","微糖","半糖"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"jelly","name":"茶凍","price":12}]'),
  ('drink-007', 'store-006', '柳橙百香綠', 'fruit', '柳橙與百香果搭配清爽綠茶', 60, '["微糖","半糖","正常"]', '["少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"aloe","name":"蘆薈","price":15}]'),
  ('drink-008', 'store-007', '雙十鮮乳茶', 'milk_tea', '濃郁鮮乳與熟香紅茶', 65, '["無糖","微糖","半糖"]', '["去冰","少冰","正常冰"]', '[{"id":"none","name":"不加料","price":0},{"id":"pudding","name":"布丁","price":15}]');

INSERT INTO deals (
  id, store_id, title, status, current_cups, target_cups, maximum_cups,
  deadline_at, pickup_time_text, withdrawal_lock_minutes, created_at
) VALUES
  ('deal-001', 'store-001', '離峰滿 20 杯折 400', 'recruiting', 14, 20, 50, '2026-06-04T15:30:00+08:00', '2026-06-04 16:30 - 17:00', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-002', 'store-002', '滿 30 杯折 750', 'confirmed', 33, 30, 60, '2026-06-04T14:00:00+08:00', '2026-06-04 15:30 - 16:00', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-003', 'store-003', '晚間水果茶試賣', 'cancelled', 6, 20, 40, '2026-06-04T18:00:00+08:00', '2026-06-04 19:00 - 19:30', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-005', 'store-002', '鮮奶茶滿 15 杯折 300', 'recruiting', 9, 15, 30, '2026-06-04T16:20:00+08:00', '2026-06-04 17:00 - 17:30', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-007', 'store-004', '黑糖鮮奶滿 20 杯折 350', 'recruiting', 12, 20, 35, '2026-06-04T17:10:00+08:00', '2026-06-04 17:40 - 18:10', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-008', 'store-005', '純茶系列滿 15 杯折 250', 'recruiting', 6, 15, 30, '2026-06-04T17:30:00+08:00', '2026-06-04 18:00 - 18:30', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-009', 'store-006', '果茶滿 25 杯折 600', 'recruiting', 17, 25, 40, '2026-06-04T18:20:00+08:00', '2026-06-04 18:50 - 19:20', 30, '2026-06-04T12:00:00+08:00'),
  ('deal-010', 'store-007', '鮮乳茶滿 20 杯折 450', 'recruiting', 8, 20, 40, '2026-06-04T19:00:00+08:00', '2026-06-04 19:30 - 20:00', 30, '2026-06-04T12:00:00+08:00');

INSERT INTO deal_discount_tiers (id, deal_id, target_cups, discount_amount) VALUES
  ('tier-001-1', 'deal-001', 20, 400),
  ('tier-001-2', 'deal-001', 35, 900),
  ('tier-002-1', 'deal-002', 30, 750),
  ('tier-003-1', 'deal-003', 20, 300),
  ('tier-005-1', 'deal-005', 15, 300),
  ('tier-007-1', 'deal-007', 20, 350),
  ('tier-008-1', 'deal-008', 15, 250),
  ('tier-009-1', 'deal-009', 25, 600),
  ('tier-010-1', 'deal-010', 20, 450);

INSERT INTO orders (
  id, deal_id, customer_user_id, status, original_amount, payment_status,
  authorization_status, merchant_acceptance_status, pickup_status, created_at, updated_at
) VALUES (
  'order-test-001', 'deal-001', 'user-customer-001', 'submitted', 410, 'authorized',
  'authorized', 'pending', 'not_ready', '2026-06-04T12:10:00+08:00', '2026-06-04T12:10:00+08:00'
);

INSERT INTO order_items (
  id, order_id, drink_name, size, sweetness, ice, toppings_json, quantity, unit_price, subtotal
) VALUES
  ('item-test-001', 'order-test-001', '青山烏龍拿鐵', 'L', '微糖', '少冰', '["珍珠"]', 1, 75, 75),
  ('item-test-002', 'order-test-001', '四季春青茶', 'L', '無糖', '正常冰', '["不加料"]', 1, 40, 40),
  ('item-test-003', 'order-test-001', '白玉歐蕾', 'L', '半糖', '去冰', '["白玉"]', 1, 70, 70),
  ('item-test-004', 'order-test-001', '熟成紅茶', 'M', '微糖', '少冰', '["不加料"]', 1, 35, 35),
  ('item-test-005', 'order-test-001', '鮮柚綠茶', 'L', '微糖', '正常冰', '["蘆薈"]', 1, 65, 65),
  ('item-test-006', 'order-test-001', '黑糖珍珠鮮奶', 'L', '固定甜', '少冰', '["珍珠"]', 1, 80, 80),
  ('item-test-007', 'order-test-001', '檸檬冬瓜', 'M', '正常', '正常冰', '["椰果"]', 1, 45, 45);

INSERT INTO payment_authorizations (
  id, order_id, status, original_amount, authorized_amount, capture_amount,
  released_amount, provider, provider_reference, created_at, updated_at
) VALUES (
  'auth-test-001', 'order-test-001', 'authorized', 410, 410, NULL,
  NULL, 'mock_line_pay', 'prototype-auth-001', '2026-06-04T12:11:00+08:00', '2026-06-04T12:11:00+08:00'
);

INSERT INTO pickup_credentials (
  id, order_id, pickup_code, visible_after_merchant_acceptance, created_at
) VALUES (
  'pickup-test-001', 'order-test-001', 'A7924', 1, '2026-06-04T12:12:00+08:00'
);
