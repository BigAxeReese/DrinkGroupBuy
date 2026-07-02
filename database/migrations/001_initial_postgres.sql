-- DrinkGroupBuy PostgreSQL schema draft v1.
-- Planning draft only: this migration is not wired into backend runtime yet.
-- Decisions:
-- - Primary keys: text
-- - Time fields: timestamptz
-- - Boolean fields: boolean
-- - Raw event/audit payloads: jsonb
-- - Status fields: text check (...), not PostgreSQL enum

BEGIN;

CREATE TABLE users (
  id text PRIMARY KEY,
  login_name text UNIQUE,
  phone_number text UNIQUE,
  email text UNIQUE,
  password_hash text,
  google_subject_id text UNIQUE,
  display_name text NOT NULL,
  surname text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE user_roles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'merchant', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  granted_at timestamptz NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE merchant_users (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level text NOT NULL DEFAULT 'owner' CHECK (permission_level IN ('owner', 'manager', 'staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL,
  UNIQUE (merchant_id, user_id)
);

CREATE TABLE stores (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  phone text,
  business_status text NOT NULL DEFAULT 'open' CHECK (business_status IN ('open', 'closed', 'temporarily_closed')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_stores_location ON stores(latitude, longitude);

CREATE TABLE menu_items (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  base_price integer NOT NULL CHECK (base_price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_menu_items_store_available ON menu_items(store_id, is_available);

CREATE TABLE customization_options (
  id text PRIMARY KEY,
  menu_item_id text NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  option_type text NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
  label text NOT NULL,
  price_delta integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_customization_options_menu_item ON customization_options(menu_item_id);

CREATE TABLE group_buy_activities (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  created_by_user_id text NOT NULL REFERENCES users(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('draft', 'recruiting', 'confirmed', 'failed', 'ordering', 'ready_for_pickup', 'completed', 'cancelled')),
  start_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  pickup_start_at timestamptz NOT NULL,
  pickup_end_at timestamptz NOT NULL,
  maximum_cups integer,
  withdrawal_lock_minutes integer NOT NULL DEFAULT 30,
  cancellation_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (maximum_cups IS NULL OR maximum_cups > 0),
  CHECK (deadline_at > start_at),
  CHECK (pickup_end_at > pickup_start_at)
);

CREATE INDEX idx_group_buy_activities_store_status ON group_buy_activities(store_id, status);
CREATE INDEX idx_group_buy_activities_deadline ON group_buy_activities(deadline_at);

CREATE TABLE promotion_tiers (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  target_cups integer NOT NULL CHECK (target_cups > 0),
  discount_amount integer NOT NULL CHECK (discount_amount >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (activity_id, target_cups)
);

CREATE INDEX idx_promotion_tiers_activity ON promotion_tiers(activity_id, sort_order);

CREATE TABLE activity_notices (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_activity_notices_activity ON activity_notices(activity_id, sort_order);

CREATE TABLE cart_drafts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id text NOT NULL REFERENCES group_buy_activities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'expired', 'cancelled')),
  fallback_purchase_preference text NOT NULL DEFAULT 'decline_original_price'
    CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (user_id, activity_id, status)
);

CREATE INDEX idx_cart_drafts_user_activity ON cart_drafts(user_id, activity_id);

CREATE TABLE cart_draft_items (
  id text PRIMARY KEY,
  cart_draft_id text NOT NULL REFERENCES cart_drafts(id) ON DELETE CASCADE,
  menu_item_id text NOT NULL REFERENCES menu_items(id),
  item_name_snapshot text NOT NULL,
  unit_price_snapshot integer NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  subtotal integer NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_cart_draft_items_cart ON cart_draft_items(cart_draft_id);

CREATE TABLE cart_draft_item_customizations (
  id text PRIMARY KEY,
  cart_draft_item_id text NOT NULL REFERENCES cart_draft_items(id) ON DELETE CASCADE,
  customization_option_id text REFERENCES customization_options(id),
  option_type text NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
  label_snapshot text NOT NULL,
  price_delta_snapshot integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_cart_draft_item_customizations_item ON cart_draft_item_customizations(cart_draft_item_id);

CREATE TABLE orders (
  id text PRIMARY KEY,
  activity_id text NOT NULL REFERENCES group_buy_activities(id),
  customer_user_id text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'locked', 'cancelled', 'completed')),
  fallback_purchase_preference text NOT NULL DEFAULT 'decline_original_price'
    CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
  total_cups integer NOT NULL CHECK (total_cups > 0),
  original_amount integer NOT NULL CHECK (original_amount >= 0),
  final_amount integer CHECK (final_amount IS NULL OR final_amount >= 0),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed', 'refunded')),
  authorization_status text NOT NULL DEFAULT 'pending'
    CHECK (authorization_status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  merchant_acceptance_status text NOT NULL DEFAULT 'pending'
    CHECK (merchant_acceptance_status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  pickup_status text NOT NULL DEFAULT 'not_ready'
    CHECK (pickup_status IN ('not_ready', 'ready', 'picked_up', 'cancelled', 'expired')),
  submitted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_orders_activity ON orders(activity_id);
CREATE INDEX idx_orders_customer ON orders(customer_user_id);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

CREATE TABLE order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id text REFERENCES menu_items(id),
  item_name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_snapshot integer NOT NULL CHECK (unit_price_snapshot >= 0),
  subtotal integer NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_customizations (
  id text PRIMARY KEY,
  order_item_id text NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  customization_option_id text REFERENCES customization_options(id),
  option_type text NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
  label_snapshot text NOT NULL,
  price_delta_snapshot integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_order_item_customizations_item ON order_item_customizations(order_item_id);

CREATE TABLE payment_authorizations (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  provider text NOT NULL CHECK (provider IN ('line_pay', 'mock_line_pay')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'captured', 'authorization_voided', 'failed')),
  original_amount integer NOT NULL CHECK (original_amount >= 0),
  authorized_amount integer NOT NULL DEFAULT 0 CHECK (authorized_amount >= 0),
  provider_authorization_id text,
  expires_at timestamptz,
  authorized_at timestamptz,
  voided_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_payment_authorizations_order ON payment_authorizations(order_id);
CREATE INDEX idx_payment_authorizations_status ON payment_authorizations(status);

CREATE TABLE payment_captures (
  id text PRIMARY KEY,
  payment_authorization_id text NOT NULL REFERENCES payment_authorizations(id),
  order_id text NOT NULL REFERENCES orders(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'failed')),
  final_amount integer NOT NULL CHECK (final_amount >= 0),
  capture_amount integer NOT NULL CHECK (capture_amount >= 0),
  released_amount integer NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  provider_capture_id text,
  captured_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_payment_captures_authorization ON payment_captures(payment_authorization_id);
CREATE INDEX idx_payment_captures_order ON payment_captures(order_id);

CREATE TABLE payment_provider_events (
  id text PRIMARY KEY,
  provider text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('authorization', 'capture', 'refund')),
  resource_id text NOT NULL,
  event_type text NOT NULL,
  idempotency_key text UNIQUE,
  payload_json jsonb,
  received_at timestamptz NOT NULL,
  processed_at timestamptz
);

CREATE INDEX idx_payment_provider_events_resource ON payment_provider_events(resource_type, resource_id);

CREATE TABLE activity_settlements (
  id text PRIMARY KEY,
  activity_id text NOT NULL UNIQUE REFERENCES group_buy_activities(id),
  outcome text NOT NULL CHECK (outcome IN ('qualified', 'failed', 'cancelled')),
  authorized_cups integer NOT NULL DEFAULT 0 CHECK (authorized_cups >= 0),
  applied_tier_id text REFERENCES promotion_tiers(id),
  discount_amount integer NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  settled_at timestamptz NOT NULL,
  reason text
);

CREATE TABLE pickup_credentials (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES orders(id),
  pickup_code text NOT NULL,
  visible_after_merchant_acceptance boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
);

CREATE TABLE status_history (
  id text PRIMARY KEY,
  resource_type text NOT NULL CHECK (resource_type IN ('activity', 'order', 'payment_authorization', 'pickup')),
  resource_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_status_history_resource ON status_history(resource_type, resource_id);
CREATE INDEX idx_status_history_actor ON status_history(actor_user_id);

CREATE TABLE audit_logs (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id),
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);

COMMIT;
