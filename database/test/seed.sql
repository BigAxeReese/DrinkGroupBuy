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

-- No initial deals, discount tiers, orders, payments, or pickup credentials.
-- The prototype starts empty so merchant-created group buys can be tested from a clean state.
