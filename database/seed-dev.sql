-- Development seed data only. Not production data.

INSERT INTO users (id, email, display_name, surname, status, created_at, updated_at) VALUES
  ('user-customer-yinji', 'yinji@example.test', 'A', 'A', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-bolun', 'bolun@example.test', 'B', 'B', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-lixuan', 'lixuan@example.test', 'C', 'C', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-customer-jingwei', 'jingwei@example.test', 'D', 'D', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-merchant-001', 'merchant001@example.test', '青山手作茶商家', '青', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('user-admin-001', 'admin@example.test', 'Prototype Admin', '管', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO user_roles (id, user_id, role, status, granted_at) VALUES
  ('role-customer-yinji', 'user-customer-yinji', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-bolun', 'user-customer-bolun', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-lixuan', 'user-customer-lixuan', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-customer-jingwei', 'user-customer-jingwei', 'customer', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-merchant-001', 'user-merchant-001', 'merchant', 'active', '2026-06-05T00:00:00+08:00'),
  ('role-admin-001', 'user-admin-001', 'admin', 'active', '2026-06-05T00:00:00+08:00');

INSERT INTO merchants (id, name, status, created_at, updated_at) VALUES
  ('merchant-001', '青山手作茶', 'active', '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO merchant_users (id, merchant_id, user_id, permission_level, status, created_at) VALUES
  ('merchant-user-001', 'merchant-001', 'user-merchant-001', 'owner', 'active', '2026-06-05T00:00:00+08:00');

INSERT INTO stores (
  id, merchant_id, name, address, phone, business_status, latitude, longitude, created_at, updated_at
) VALUES
  ('store-001', 'merchant-001', '青山手作茶 中科店', '台中市北區三民路三段 150 號', '04-2233-0001', 'open', 24.1511, 120.6817, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');

INSERT INTO menu_items (
  id, store_id, name, category, description, base_price, is_available, created_at, updated_at
) VALUES
  ('drink-001', 'store-001', '青山烏龍拿鐵', 'milk_tea', '木質烏龍茶香，搭配濃厚鮮奶', 65, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00'),
  ('drink-002', 'store-001', '四季春青茶', 'tea', '清香茶韻，入口回甘', 40, 1, '2026-06-05T00:00:00+08:00', '2026-06-05T00:00:00+08:00');
