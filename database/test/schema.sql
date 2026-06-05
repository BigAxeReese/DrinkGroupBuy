-- Prototype test database only, not final production schema.

PRAGMA foreign_keys = ON;

CREATE TABLE test_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('customer', 'merchant', 'admin')),
  display_name TEXT NOT NULL
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  merchant_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_status TEXT NOT NULL CHECK (business_status IN ('open', 'closed', 'temporarily_closed')),
  distance_text TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  sweetness_options_json TEXT NOT NULL,
  ice_options_json TEXT NOT NULL,
  toppings_json TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recruiting', 'confirmed', 'failed', 'cancelled', 'completed')),
  current_cups INTEGER NOT NULL DEFAULT 0,
  target_cups INTEGER NOT NULL,
  maximum_cups INTEGER NOT NULL,
  deadline_at TEXT NOT NULL,
  pickup_time_text TEXT NOT NULL,
  withdrawal_lock_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL
);

CREATE TABLE deal_discount_tiers (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  target_cups INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id),
  customer_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'locked', 'cancelled', 'completed')),
  original_amount INTEGER NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  authorization_status TEXT NOT NULL CHECK (authorization_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  merchant_acceptance_status TEXT NOT NULL CHECK (merchant_acceptance_status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  pickup_status TEXT NOT NULL CHECK (pickup_status IN ('not_ready', 'ready', 'picked_up', 'cancelled', 'expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  drink_name TEXT NOT NULL,
  size TEXT NOT NULL,
  sweetness TEXT NOT NULL,
  ice TEXT NOT NULL,
  toppings_json TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

CREATE TABLE payment_authorizations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  original_amount INTEGER NOT NULL,
  authorized_amount INTEGER NOT NULL,
  capture_amount INTEGER,
  released_amount INTEGER,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pickup_credentials (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  pickup_code TEXT NOT NULL,
  visible_after_merchant_acceptance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
