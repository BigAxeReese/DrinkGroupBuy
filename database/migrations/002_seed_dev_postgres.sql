-- DrinkGroupBuy PostgreSQL development seed draft.
-- Planning draft only: do not run against production data.
-- Intended to be applied after 001_initial_postgres.sql in a fresh dev database.
--
-- Seed scope:
-- - 4 customer users
-- - 7 merchant account users
-- - 1 admin user
-- - private/public profile rows for seeded users
-- - 7 merchants
-- - 7 merchant_users store-account links
-- - 7 stores
-- - 8 current development menu_items
-- - 96 customization_options, 12 options for each menu item
--
-- Runtime data intentionally not seeded:
-- - group_buy_activities
-- - promotion_tiers
-- - orders
-- - payment_authorizations
-- - payment_captures
-- - pickup_credentials

BEGIN;

INSERT INTO users (
  id, login_name, phone_number, email, password_hash, firebase_uid, display_name, status,
  phone_verified_at, email_verified_at, last_login_at, created_at, updated_at
) VALUES
  ('user-customer-yinji', 'customera', '0911000001', NULL, 'scrypt:17d1254f2df99e16ea4d2df911a20725:ec192dad05c846d2820845199faece873ccc90b499a2709c6b12fcda30984dd3', NULL, 'A', 'active', '2026-06-05T00:00:00+08:00', NULL, NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-bolun', 'customerb', '0911000002', NULL, 'scrypt:51d3d2ddcd134dc8f957181393a1c2f1:b23d7e4b7f079db73dee3a4493dabb8723f6470190f4285a1d917430fc313612', NULL, 'B', 'active', '2026-06-05T00:00:00+08:00', NULL, NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-lixuan', 'customerc', '0911000003', NULL, 'scrypt:958103228365ce9c70455ccbb18648fb:ff35f59594f4d4566c7bdbce1ca107d6db2c1013c6bf07ba3d279a264367ad79', NULL, 'C', 'active', '2026-06-05T00:00:00+08:00', NULL, NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-jingwei', 'customerd', '0911000004', NULL, 'scrypt:1b4f4f7b6d50b63260f653fec8b7b383:be4683349b1854f2dfcbd5ea69ebf6a2aa53a8df24aca1bb8d033c642a6acf63', NULL, 'D', 'active', '2026-06-05T00:00:00+08:00', NULL, NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-001', 'merchant1', '0922000001', 'store1@example.com', 'scrypt:4f6e9b25d6a41d4974a03a99b6e2f873:7ebb0fbb088d5aaeb08d28eeb28527b44c8613df3b7341539d02129979a4b728', NULL, '青山手作茶商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-002', 'merchant2', '0922000002', 'store2@example.com', 'scrypt:d6d461684e303e08b946a0a487defffe:91423bf2bfc776e54433324883182dcda768dce07f595898f7d849ef80f0a91a', NULL, '晨露鮮奶茶商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-003', 'merchant3', '0922000003', 'store3@example.com', 'scrypt:a0875809bf8f27957612dd7b3e581a6d:f23a7774550408f1866165c25d6e71087f9b0c9542a8988bd3bdd10f8dced78f', NULL, '午後水果茶商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-004', 'merchant4', '0922000004', 'store4@example.com', 'scrypt:574f7e5730e707dab8e21feda3ccfbad:de10d308e1db7c982b2b3abf982a244418ece44c5b5268b3b363ebb25ccf1dac', NULL, '一中黑糖研究所商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-005', 'merchant5', '0922000005', 'store5@example.com', 'scrypt:3b3492a4ee03acaa69732fe4eaceef9b:8db16513e295f1562a58c7bb2f8126b561092854af3709421d6282d4d4e5fa1f', NULL, '北區茶作館商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-006', 'merchant6', '0922000006', 'store6@example.com', 'scrypt:8e0114f450dc3fdff9a5b48b03ce629c:92b13c8c6b27fe33eb7c584c24ffa6b5d86bc820093f94f8a752b20ed720e5ea', NULL, '柳川果茶室商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-007', 'merchant7', '0922000007', 'store7@example.com', 'scrypt:c3c1c89d25d9014195ff29ceb10a9bd0:4c4a84e5a01dcc600defff953a7c520593b04110a68b443cc5deebc3e305ee02', NULL, '雙十鮮乳坊商家', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-admin-001', 'admin', '0900000000', 'admin@example.com', 'scrypt:a3a7f306b3af7ea90c9925b4159ae07d:f0a213b755d24e63a065621b5dc6284edbb6d09fc22f5801c531b3e02415a494', NULL, 'Admin', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO user_private_profiles (user_id, real_name, contact_phone, contact_email, created_at, updated_at) VALUES
  ('user-customer-yinji', '顧客 A', '0911000001', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-bolun', '顧客 B', '0911000002', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-lixuan', '顧客 C', '0911000003', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-jingwei', '顧客 D', '0911000004', NULL, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-001', '青山手作茶商家', '0922000001', 'store1@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-002', '晨露鮮奶茶商家', '0922000002', 'store2@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-003', '午後水果茶商家', '0922000003', 'store3@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-004', '一中黑糖研究所商家', '0922000004', 'store4@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-005', '北區茶作館商家', '0922000005', 'store5@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-006', '柳川果茶室商家', '0922000006', 'store6@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-007', '雙十鮮乳坊商家', '0922000007', 'store7@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-admin-001', 'Admin', '0900000000', 'admin@example.com', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO user_public_profiles (user_id, display_alias, avatar_color, privacy_mode, created_at, updated_at) VALUES
  ('user-customer-yinji', '匿名顧客 A', '#4F46E5', 'anonymous', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-bolun', '匿名顧客 B', '#059669', 'anonymous', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-lixuan', '匿名顧客 C', '#D97706', 'anonymous', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-jingwei', '匿名顧客 D', '#DC2626', 'anonymous', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-001', '青山手作茶商家', '#166534', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-002', '晨露鮮奶茶商家', '#0F766E', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-003', '午後水果茶商家', '#BE123C', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-004', '一中黑糖研究所商家', '#92400E', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-005', '北區茶作館商家', '#0369A1', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-006', '柳川果茶室商家', '#7C3AED', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-007', '雙十鮮乳坊商家', '#0E7490', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-admin-001', 'Admin', '#334155', 'display_name', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO user_roles (id, user_id, role, status, granted_at) VALUES
  ('role-customer-yinji', 'user-customer-yinji', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-bolun', 'user-customer-bolun', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-lixuan', 'user-customer-lixuan', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-jingwei', 'user-customer-jingwei', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-001', 'user-merchant-001', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-002', 'user-merchant-002', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-003', 'user-merchant-003', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-004', 'user-merchant-004', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-005', 'user-merchant-005', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-006', 'user-merchant-006', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-007', 'user-merchant-007', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-admin-001', 'user-admin-001', 'admin', 'active', '2026-06-05T00:00:00+08:00');

INSERT INTO merchants (id, name, status, created_at, updated_at) VALUES
  ('merchant-001', '青山手作茶', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-002', '晨露鮮奶茶', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-003', '午後水果茶', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-004', '一中黑糖研究所', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-005', '北區茶作館', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-006', '柳川果茶室', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('merchant-007', '雙十鮮乳坊', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO stores (
  id, merchant_id, name, address, phone, business_status, latitude, longitude, created_at, updated_at
) VALUES
  ('store-001', 'merchant-001', '青山手作茶 中科店', '台中市北區三民路三段 150 號', '04-2233-0001', 'open', 24.1511, 120.6817, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-002', 'merchant-002', '晨露鮮奶茶 一中店', '台中市北區太平路 55 號', '04-2233-0002', 'open', 24.1481, 120.6862, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-003', 'merchant-003', '午後水果茶 雙十店', '台中市北區雙十路一段 18 號', '04-2233-0003', 'temporarily_closed', 24.1525, 120.6868, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-004', 'merchant-004', '一中黑糖研究所', '台中市北區太平路 38 號', '04-2233-0004', 'open', 24.1505, 120.6859, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-005', 'merchant-005', '北區茶作館', '台中市北區育才北路 22 號', '04-2233-0005', 'open', 24.1522, 120.6827, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-006', 'merchant-006', '柳川果茶室', '台中市北區中華路二段 88 號', '04-2233-0006', 'open', 24.1472, 120.6809, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('store-007', 'merchant-007', '雙十鮮乳坊', '台中市北區雙十路二段 35 號', '04-2233-0007', 'open', 24.1541, 120.6892, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO merchant_users (id, store_id, user_id, status, created_at) VALUES
  ('merchant-user-001', 'store-001', 'user-merchant-001', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-002', 'store-002', 'user-merchant-002', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-003', 'store-003', 'user-merchant-003', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-004', 'store-004', 'user-merchant-004', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-005', 'store-005', 'user-merchant-005', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-006', 'store-006', 'user-merchant-006', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-007', 'store-007', 'user-merchant-007', 'active', '2026-06-05T00:00:00+08:00');

INSERT INTO menu_items (
  id, store_id, name, category, description, base_price, is_available, created_at, updated_at
) VALUES
  ('drink-001', 'store-001', '青山烏龍拿鐵', 'milk_tea', '木質烏龍茶香，搭配濃厚鮮奶', 65, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-002', 'store-001', '四季春青茶', 'tea', '清香茶韻，入口回甘', 40, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-003', 'store-002', '晨露鮮奶茶', 'milk_tea', '經典鮮奶茶，茶香溫順', 70, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-004', 'store-003', '午後百香果茶', 'fruit', '百香果酸甜搭配清香綠茶', 55, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-005', 'store-004', '黑糖珍珠鮮奶', 'milk_tea', '黑糖香氣搭配鮮奶與珍珠', 70, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-006', 'store-005', '高山四季春', 'tea', '清香回甘的純茶', 40, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-007', 'store-006', '柳橙百香綠', 'fruit', '柳橙與百香果搭配清爽綠茶', 60, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-008', 'store-007', '雙十鮮乳茶', 'milk_tea', '濃郁鮮乳與熟香紅茶', 65, true, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO customization_options (
  id, menu_item_id, option_type, label, price_delta, sort_order, is_available
) VALUES
  ('drink-001-opt-sweet-regular', 'drink-001', 'sweetness', '正常糖', 0, 0, true),
  ('drink-001-opt-sweet-half', 'drink-001', 'sweetness', '半糖', 0, 1, true),
  ('drink-001-opt-sweet-light', 'drink-001', 'sweetness', '微糖', 0, 2, true),
  ('drink-001-opt-sweet-none', 'drink-001', 'sweetness', '無糖', 0, 3, true),
  ('drink-001-opt-ice-regular', 'drink-001', 'ice', '正常冰', 0, 0, true),
  ('drink-001-opt-ice-less', 'drink-001', 'ice', '少冰', 0, 1, true),
  ('drink-001-opt-ice-light', 'drink-001', 'ice', '微冰', 0, 2, true),
  ('drink-001-opt-ice-none', 'drink-001', 'ice', '去冰', 0, 3, true),
  ('drink-001-opt-size-medium', 'drink-001', 'size', '中杯', 0, 0, true),
  ('drink-001-opt-size-large', 'drink-001', 'size', '大杯', 10, 1, true),
  ('drink-001-opt-top-pearl', 'drink-001', 'topping', '珍珠', 10, 0, true),
  ('drink-001-opt-top-coconut', 'drink-001', 'topping', '椰果', 10, 1, true),
  ('drink-002-opt-sweet-regular', 'drink-002', 'sweetness', '正常糖', 0, 0, true),
  ('drink-002-opt-sweet-half', 'drink-002', 'sweetness', '半糖', 0, 1, true),
  ('drink-002-opt-sweet-light', 'drink-002', 'sweetness', '微糖', 0, 2, true),
  ('drink-002-opt-sweet-none', 'drink-002', 'sweetness', '無糖', 0, 3, true),
  ('drink-002-opt-ice-regular', 'drink-002', 'ice', '正常冰', 0, 0, true),
  ('drink-002-opt-ice-less', 'drink-002', 'ice', '少冰', 0, 1, true),
  ('drink-002-opt-ice-light', 'drink-002', 'ice', '微冰', 0, 2, true),
  ('drink-002-opt-ice-none', 'drink-002', 'ice', '去冰', 0, 3, true),
  ('drink-002-opt-size-medium', 'drink-002', 'size', '中杯', 0, 0, true),
  ('drink-002-opt-size-large', 'drink-002', 'size', '大杯', 10, 1, true),
  ('drink-002-opt-top-pearl', 'drink-002', 'topping', '珍珠', 10, 0, true),
  ('drink-002-opt-top-coconut', 'drink-002', 'topping', '椰果', 10, 1, true),
  ('drink-003-opt-sweet-regular', 'drink-003', 'sweetness', '正常糖', 0, 0, true),
  ('drink-003-opt-sweet-half', 'drink-003', 'sweetness', '半糖', 0, 1, true),
  ('drink-003-opt-sweet-light', 'drink-003', 'sweetness', '微糖', 0, 2, true),
  ('drink-003-opt-sweet-none', 'drink-003', 'sweetness', '無糖', 0, 3, true),
  ('drink-003-opt-ice-regular', 'drink-003', 'ice', '正常冰', 0, 0, true),
  ('drink-003-opt-ice-less', 'drink-003', 'ice', '少冰', 0, 1, true),
  ('drink-003-opt-ice-light', 'drink-003', 'ice', '微冰', 0, 2, true),
  ('drink-003-opt-ice-none', 'drink-003', 'ice', '去冰', 0, 3, true),
  ('drink-003-opt-size-medium', 'drink-003', 'size', '中杯', 0, 0, true),
  ('drink-003-opt-size-large', 'drink-003', 'size', '大杯', 10, 1, true),
  ('drink-003-opt-top-pearl', 'drink-003', 'topping', '珍珠', 10, 0, true),
  ('drink-003-opt-top-coconut', 'drink-003', 'topping', '椰果', 10, 1, true),
  ('drink-004-opt-sweet-regular', 'drink-004', 'sweetness', '正常糖', 0, 0, true),
  ('drink-004-opt-sweet-half', 'drink-004', 'sweetness', '半糖', 0, 1, true),
  ('drink-004-opt-sweet-light', 'drink-004', 'sweetness', '微糖', 0, 2, true),
  ('drink-004-opt-sweet-none', 'drink-004', 'sweetness', '無糖', 0, 3, true),
  ('drink-004-opt-ice-regular', 'drink-004', 'ice', '正常冰', 0, 0, true),
  ('drink-004-opt-ice-less', 'drink-004', 'ice', '少冰', 0, 1, true),
  ('drink-004-opt-ice-light', 'drink-004', 'ice', '微冰', 0, 2, true),
  ('drink-004-opt-ice-none', 'drink-004', 'ice', '去冰', 0, 3, true),
  ('drink-004-opt-size-medium', 'drink-004', 'size', '中杯', 0, 0, true),
  ('drink-004-opt-size-large', 'drink-004', 'size', '大杯', 10, 1, true),
  ('drink-004-opt-top-pearl', 'drink-004', 'topping', '珍珠', 10, 0, true),
  ('drink-004-opt-top-coconut', 'drink-004', 'topping', '椰果', 10, 1, true),
  ('drink-005-opt-sweet-regular', 'drink-005', 'sweetness', '正常糖', 0, 0, true),
  ('drink-005-opt-sweet-half', 'drink-005', 'sweetness', '半糖', 0, 1, true),
  ('drink-005-opt-sweet-light', 'drink-005', 'sweetness', '微糖', 0, 2, true),
  ('drink-005-opt-sweet-none', 'drink-005', 'sweetness', '無糖', 0, 3, true),
  ('drink-005-opt-ice-regular', 'drink-005', 'ice', '正常冰', 0, 0, true),
  ('drink-005-opt-ice-less', 'drink-005', 'ice', '少冰', 0, 1, true),
  ('drink-005-opt-ice-light', 'drink-005', 'ice', '微冰', 0, 2, true),
  ('drink-005-opt-ice-none', 'drink-005', 'ice', '去冰', 0, 3, true),
  ('drink-005-opt-size-medium', 'drink-005', 'size', '中杯', 0, 0, true),
  ('drink-005-opt-size-large', 'drink-005', 'size', '大杯', 10, 1, true),
  ('drink-005-opt-top-pearl', 'drink-005', 'topping', '珍珠', 10, 0, true),
  ('drink-005-opt-top-coconut', 'drink-005', 'topping', '椰果', 10, 1, true),
  ('drink-006-opt-sweet-regular', 'drink-006', 'sweetness', '正常糖', 0, 0, true),
  ('drink-006-opt-sweet-half', 'drink-006', 'sweetness', '半糖', 0, 1, true),
  ('drink-006-opt-sweet-light', 'drink-006', 'sweetness', '微糖', 0, 2, true),
  ('drink-006-opt-sweet-none', 'drink-006', 'sweetness', '無糖', 0, 3, true),
  ('drink-006-opt-ice-regular', 'drink-006', 'ice', '正常冰', 0, 0, true),
  ('drink-006-opt-ice-less', 'drink-006', 'ice', '少冰', 0, 1, true),
  ('drink-006-opt-ice-light', 'drink-006', 'ice', '微冰', 0, 2, true),
  ('drink-006-opt-ice-none', 'drink-006', 'ice', '去冰', 0, 3, true),
  ('drink-006-opt-size-medium', 'drink-006', 'size', '中杯', 0, 0, true),
  ('drink-006-opt-size-large', 'drink-006', 'size', '大杯', 10, 1, true),
  ('drink-006-opt-top-pearl', 'drink-006', 'topping', '珍珠', 10, 0, true),
  ('drink-006-opt-top-coconut', 'drink-006', 'topping', '椰果', 10, 1, true),
  ('drink-007-opt-sweet-regular', 'drink-007', 'sweetness', '正常糖', 0, 0, true),
  ('drink-007-opt-sweet-half', 'drink-007', 'sweetness', '半糖', 0, 1, true),
  ('drink-007-opt-sweet-light', 'drink-007', 'sweetness', '微糖', 0, 2, true),
  ('drink-007-opt-sweet-none', 'drink-007', 'sweetness', '無糖', 0, 3, true),
  ('drink-007-opt-ice-regular', 'drink-007', 'ice', '正常冰', 0, 0, true),
  ('drink-007-opt-ice-less', 'drink-007', 'ice', '少冰', 0, 1, true),
  ('drink-007-opt-ice-light', 'drink-007', 'ice', '微冰', 0, 2, true),
  ('drink-007-opt-ice-none', 'drink-007', 'ice', '去冰', 0, 3, true),
  ('drink-007-opt-size-medium', 'drink-007', 'size', '中杯', 0, 0, true),
  ('drink-007-opt-size-large', 'drink-007', 'size', '大杯', 10, 1, true),
  ('drink-007-opt-top-pearl', 'drink-007', 'topping', '珍珠', 10, 0, true),
  ('drink-007-opt-top-coconut', 'drink-007', 'topping', '椰果', 10, 1, true),
  ('drink-008-opt-sweet-regular', 'drink-008', 'sweetness', '正常糖', 0, 0, true),
  ('drink-008-opt-sweet-half', 'drink-008', 'sweetness', '半糖', 0, 1, true),
  ('drink-008-opt-sweet-light', 'drink-008', 'sweetness', '微糖', 0, 2, true),
  ('drink-008-opt-sweet-none', 'drink-008', 'sweetness', '無糖', 0, 3, true),
  ('drink-008-opt-ice-regular', 'drink-008', 'ice', '正常冰', 0, 0, true),
  ('drink-008-opt-ice-less', 'drink-008', 'ice', '少冰', 0, 1, true),
  ('drink-008-opt-ice-light', 'drink-008', 'ice', '微冰', 0, 2, true),
  ('drink-008-opt-ice-none', 'drink-008', 'ice', '去冰', 0, 3, true),
  ('drink-008-opt-size-medium', 'drink-008', 'size', '中杯', 0, 0, true),
  ('drink-008-opt-size-large', 'drink-008', 'size', '大杯', 10, 1, true),
  ('drink-008-opt-top-pearl', 'drink-008', 'topping', '珍珠', 10, 0, true),
  ('drink-008-opt-top-coconut', 'drink-008', 'topping', '椰果', 10, 1, true);

INSERT INTO menu_item_customization_rules (
  menu_item_id, option_type, min_selections, max_selections, created_at, updated_at
)
SELECT
  menu_item.id,
  rule.option_type,
  rule.min_selections,
  rule.max_selections,
  '2026-06-05T00:00:00+08:00',
  '2026-06-05T00:00:00+08:00'
FROM menu_items menu_item
CROSS JOIN (
  VALUES
    ('sweetness', 1, 1),
    ('ice', 1, 1),
    ('size', 1, 1),
    ('topping', 0, 2)
) AS rule(option_type, min_selections, max_selections);

COMMIT;
