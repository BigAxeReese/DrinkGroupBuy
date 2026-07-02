-- Development seed data only. Not production data.

INSERT INTO users (id, login_name, phone_number, email, password_hash, display_name, surname, status, created_at, updated_at) VALUES
  ('user-customer-yinji', 'customera', '0911000001', NULL, 'scrypt:17d1254f2df99e16ea4d2df911a20725:ec192dad05c846d2820845199faece873ccc90b499a2709c6b12fcda30984dd3', 'A', 'A', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-bolun', 'customerb', '0911000002', NULL, 'scrypt:51d3d2ddcd134dc8f957181393a1c2f1:b23d7e4b7f079db73dee3a4493dabb8723f6470190f4285a1d917430fc313612', 'B', 'B', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-lixuan', 'customerc', '0911000003', NULL, 'scrypt:958103228365ce9c70455ccbb18648fb:ff35f59594f4d4566c7bdbce1ca107d6db2c1013c6bf07ba3d279a264367ad79', 'C', 'C', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-jingwei', 'customerd', '0911000004', NULL, 'scrypt:1b4f4f7b6d50b63260f653fec8b7b383:be4683349b1854f2dfcbd5ea69ebf6a2aa53a8df24aca1bb8d033c642a6acf63', 'D', 'D', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-001', 'merchant1', '0922000001', 'store1@example.com', 'scrypt:4f6e9b25d6a41d4974a03a99b6e2f873:7ebb0fbb088d5aaeb08d28eeb28527b44c8613df3b7341539d02129979a4b728', '青山手作茶商家', '青', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-002', 'merchant2', '0922000002', 'store2@example.com', 'scrypt:d6d461684e303e08b946a0a487defffe:91423bf2bfc776e54433324883182dcda768dce07f595898f7d849ef80f0a91a', '晨露鮮奶茶商家', '晨', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-003', 'merchant3', '0922000003', 'store3@example.com', 'scrypt:a0875809bf8f27957612dd7b3e581a6d:f23a7774550408f1866165c25d6e71087f9b0c9542a8988bd3bdd10f8dced78f', '午後水果茶商家', '午', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-004', 'merchant4', '0922000004', 'store4@example.com', 'scrypt:574f7e5730e707dab8e21feda3ccfbad:de10d308e1db7c982b2b3abf982a244418ece44c5b5268b3b363ebb25ccf1dac', '一中黑糖研究所商家', '黑', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-005', 'merchant5', '0922000005', 'store5@example.com', 'scrypt:3b3492a4ee03acaa69732fe4eaceef9b:8db16513e295f1562a58c7bb2f8126b561092854af3709421d6282d4d4e5fa1f', '北區茶作館商家', '北', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-006', 'merchant6', '0922000006', 'store6@example.com', 'scrypt:8e0114f450dc3fdff9a5b48b03ce629c:92b13c8c6b27fe33eb7c584c24ffa6b5d86bc820093f94f8a752b20ed720e5ea', '柳川果茶室商家', '柳', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-007', 'merchant7', '0922000007', 'store7@example.com', 'scrypt:c3c1c89d25d9014195ff29ceb10a9bd0:4c4a84e5a01dcc600defff953a7c520593b04110a68b443cc5deebc3e305ee02', '雙十鮮乳坊商家', '雙', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-admin-001', 'admin', '0900000000', 'admin@example.com', 'scrypt:a3a7f306b3af7ea90c9925b4159ae07d:f0a213b755d24e63a065621b5dc6284edbb6d09fc22f5801c531b3e02415a494', 'Admin', 'A', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

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

INSERT INTO merchant_users (id, merchant_id, user_id, permission_level, status, created_at) VALUES
  ('merchant-user-001', 'merchant-001', 'user-merchant-001', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-002', 'merchant-002', 'user-merchant-002', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-003', 'merchant-003', 'user-merchant-003', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-004', 'merchant-004', 'user-merchant-004', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-005', 'merchant-005', 'user-merchant-005', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-006', 'merchant-006', 'user-merchant-006', 'owner', 'active', '2026-06-05T00:00:00+08:00'),
  ('merchant-user-007', 'merchant-007', 'user-merchant-007', 'owner', 'active', '2026-06-05T00:00:00+08:00');

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

INSERT INTO menu_items (
  id, store_id, name, category, description, base_price, is_available, created_at, updated_at
) VALUES
  ('drink-001', 'store-001', '青山烏龍拿鐵', 'milk_tea', '木質烏龍茶香，搭配濃厚鮮奶', 65, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-002', 'store-001', '四季春青茶', 'tea', '清香茶韻，入口回甘', 40, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-003', 'store-002', '晨露鮮奶茶', 'milk_tea', '經典鮮奶茶，茶香溫順', 70, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-004', 'store-003', '午後百香果茶', 'fruit', '百香果酸甜搭配清香綠茶', 55, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-005', 'store-004', '黑糖珍珠鮮奶', 'milk_tea', '黑糖香氣搭配鮮奶與珍珠', 70, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-006', 'store-005', '高山四季春', 'tea', '清香回甘的純茶', 40, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-007', 'store-006', '柳橙百香綠', 'fruit', '柳橙與百香果搭配清爽綠茶', 60, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-008', 'store-007', '雙十鮮乳茶', 'milk_tea', '濃郁鮮乳與熟香紅茶', 65, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');
