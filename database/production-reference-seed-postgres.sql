-- DrinkGroupBuy production reference-data seed.
--
-- Run ONCE, manually, against a freshly-migrated production database -- NOT part of
-- database/migrations/ (database/migrate.js auto-applies every numbered file in that
-- directory in sequence, and this file must never be swept into that automatic chain
-- alongside real schema migrations, nor mixed with database/migrations/002_seed_dev_postgres.sql,
-- which is a *development-only* seed containing fake login accounts and must never touch
-- a production database).
--
-- Scope: merchants / stores / menu_items / customization_options /
-- menu_item_customization_rules only -- the catalog data confirmed on 2026-08-20 to be the
-- same content already used for local development (docs/AI-postgresql-migration-plan.md),
-- reused as-is as the production starting catalog per that confirmation.
--
-- Deliberately NOT included: users, user_private_profiles, user_public_profiles, user_roles,
-- merchant_users. The development seed's user rows use password-based dev login
-- (AUTH_DEV_MODE), which production does not use at all -- production login is Firebase Auth
-- + Google Sign-In only. A merchant_users row can only be created correctly once the real
-- merchant partner has actually signed in once with their own Google account and the backend
-- has a real firebase_uid for them. That linking step is manual (see the checklist in
-- docs/AI-postgresql-migration-plan.md), not something this seed can script ahead of time.
--
-- Usage:
--   psql "$DATABASE_URL" -f database/production-reference-seed-postgres.sql
-- (or set $env:DATABASE_URL and run the equivalent psql.exe command on Windows)

BEGIN;

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
) AS rule(option_type, min_selections, max_selections)
WHERE menu_item.id LIKE 'drink-00%';

COMMIT;
