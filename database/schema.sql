-- DrinkGroupBuy development database schema draft.
-- This is an implementation-oriented draft for local development, not a production migration history.
-- Naming follows AGENTS.md database-style snake_case.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  google_subject_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  surname TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'merchant', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  granted_at TEXT NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE merchant_users (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL DEFAULT 'owner' CHECK (permission_level IN ('owner', 'manager', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  UNIQUE (merchant_id, user_id)
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  business_status TEXT NOT NULL DEFAULT 'open' CHECK (business_status IN ('open', 'closed', 'temporarily_closed')),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_stores_location ON stores(latitude, longitude);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customization_options (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  option_type TEXT NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
  label TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1))
);

CREATE TABLE group_buy_activities (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('draft', 'recruiting', 'confirmed', 'failed', 'ordering', 'ready_for_pickup', 'completed', 'cancelled')),
  start_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  pickup_start_at TEXT NOT NULL,
  pickup_end_at TEXT NOT NULL,
  maximum_cups INTEGER,
  withdrawal_lock_minutes INTEGER NOT NULL DEFAULT 30,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_group_buy_activities_store_status ON group_buy_activities(store_id, status);
CREATE INDEX idx_group_buy_activities_deadline ON group_buy_activities(deadline_at);

CREATE TABLE promotion_tiers (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  target_cups INTEGER NOT NULL CHECK (target_cups > 0),
  discount_amount INTEGER NOT NULL CHECK (discount_amount >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (activity_id, target_cups)
);

CREATE TABLE activity_notices (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cart_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'expired', 'cancelled')),
  fallback_purchase_preference TEXT NOT NULL DEFAULT 'decline_original_price'
    CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, activity_id, status)
);

CREATE TABLE cart_draft_items (
  id TEXT PRIMARY KEY,
  cart_draft_id TEXT NOT NULL REFERENCES cart_drafts(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  item_name_snapshot TEXT NOT NULL,
  unit_price_snapshot INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sweetness TEXT,
  ice TEXT,
  toppings_snapshot TEXT NOT NULL DEFAULT '[]',
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES group_buy_activities(id),
  customer_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'locked', 'cancelled', 'completed')),
  fallback_purchase_preference TEXT NOT NULL DEFAULT 'decline_original_price'
    CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
  total_cups INTEGER NOT NULL CHECK (total_cups > 0),
  original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
  final_amount INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed', 'refunded')),
  authorization_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (authorization_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  merchant_acceptance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (merchant_acceptance_status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  pickup_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (pickup_status IN ('not_ready', 'ready', 'picked_up', 'cancelled', 'expired')),
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_orders_activity ON orders(activity_id);
CREATE INDEX idx_orders_customer ON orders(customer_user_id);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES menu_items(id),
  item_name_snapshot TEXT NOT NULL,
  size_snapshot TEXT,
  sweetness_snapshot TEXT,
  ice_snapshot TEXT,
  toppings_snapshot TEXT NOT NULL DEFAULT '[]',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_snapshot INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE payment_authorizations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL CHECK (provider IN ('line_pay', 'mock_line_pay')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
  authorized_amount INTEGER NOT NULL DEFAULT 0 CHECK (authorized_amount >= 0),
  provider_authorization_id TEXT,
  expires_at TEXT,
  authorized_at TEXT,
  voided_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_payment_authorizations_order ON payment_authorizations(order_id);

CREATE TABLE payment_captures (
  id TEXT PRIMARY KEY,
  payment_authorization_id TEXT NOT NULL REFERENCES payment_authorizations(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'failed')),
  final_amount INTEGER NOT NULL CHECK (final_amount >= 0),
  capture_amount INTEGER NOT NULL CHECK (capture_amount >= 0),
  released_amount INTEGER NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  provider_capture_id TEXT,
  captured_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_provider_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('authorization', 'capture', 'refund')),
  resource_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  payload_json TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE activity_settlements (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL UNIQUE REFERENCES group_buy_activities(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('qualified', 'failed', 'cancelled')),
  authorized_cups INTEGER NOT NULL DEFAULT 0 CHECK (authorized_cups >= 0),
  applied_tier_id TEXT REFERENCES promotion_tiers(id),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  settled_at TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE pickup_credentials (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  pickup_code TEXT NOT NULL,
  visible_after_merchant_acceptance INTEGER NOT NULL DEFAULT 1 CHECK (visible_after_merchant_acceptance IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE status_history (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('activity', 'order', 'payment_authorization', 'pickup')),
  resource_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  actor_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_status_history_resource ON status_history(resource_type, resource_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
