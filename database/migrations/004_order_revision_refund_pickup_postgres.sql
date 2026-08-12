-- Adds the PostgreSQL tables/columns needed for order revision and refund-request
-- support, which existed in SQLite (database/schema.sql) but were never ported to
-- the 001 draft. Also widens two provider CHECK constraints that SQLite already
-- widened for ECPay (see backend/db.js widenPaymentProviderCheckConstraints) but
-- the Postgres draft never picked up, since ECPay postdates 001.
--
-- pickup_credentials needs no schema change here -- it already matches SQLite
-- column-for-column; only the read/write mapping (boolean vs 0/1) is a code-level
-- concern for the pickup PostgreSQL repository, not a schema one.

CREATE TABLE order_revisions (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_authorization'
    CHECK (status IN ('pending_authorization', 'applied', 'failed', 'cancelled')),
  original_payment_authorization_id text REFERENCES payment_authorizations(id),
  replacement_payment_authorization_id text REFERENCES payment_authorizations(id),
  fallback_purchase_preference text NOT NULL DEFAULT 'decline_original_price'
    CHECK (fallback_purchase_preference IN ('decline_original_price', 'accept_original_price')),
  previous_total_cups integer NOT NULL CHECK (previous_total_cups > 0),
  previous_original_amount integer NOT NULL CHECK (previous_original_amount >= 0),
  total_cups integer NOT NULL CHECK (total_cups > 0),
  original_amount integer NOT NULL CHECK (original_amount >= 0),
  failure_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  applied_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX idx_order_revisions_order ON order_revisions(order_id);
CREATE INDEX idx_order_revisions_status ON order_revisions(status);

CREATE TABLE order_revision_items (
  id text PRIMARY KEY,
  order_revision_id text NOT NULL REFERENCES order_revisions(id) ON DELETE CASCADE,
  menu_item_id text REFERENCES menu_items(id),
  item_name_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_snapshot integer NOT NULL CHECK (unit_price_snapshot >= 0),
  subtotal integer NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_order_revision_items_revision ON order_revision_items(order_revision_id);

CREATE TABLE order_revision_item_customizations (
  id text PRIMARY KEY,
  order_revision_item_id text NOT NULL REFERENCES order_revision_items(id) ON DELETE CASCADE,
  customization_option_id text REFERENCES customization_options(id),
  option_type text NOT NULL CHECK (option_type IN ('sweetness', 'ice', 'topping', 'size')),
  label_snapshot text NOT NULL,
  price_delta_snapshot integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_order_revision_item_customizations_item
ON order_revision_item_customizations(order_revision_item_id);

ALTER TABLE payment_authorizations
  ADD COLUMN order_revision_id text REFERENCES order_revisions(id);

CREATE INDEX idx_payment_authorizations_order_revision
ON payment_authorizations(order_revision_id);

CREATE TABLE refund_requests (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  payment_capture_id text NOT NULL REFERENCES payment_captures(id),
  store_id text NOT NULL REFERENCES stores(id),
  requested_by_user_id text NOT NULL REFERENCES users(id),
  requested_amount integer NOT NULL CHECK (requested_amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  idempotency_key text UNIQUE,
  reviewed_by_user_id text REFERENCES users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  resulting_payment_refund_id text REFERENCES payment_refunds(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_refund_requests_store ON refund_requests(store_id, status);
CREATE INDEX idx_refund_requests_order ON refund_requests(order_id);
CREATE UNIQUE INDEX idx_refund_requests_pending_per_capture
ON refund_requests(payment_capture_id)
WHERE status = 'pending';

ALTER TABLE payment_authorizations
  DROP CONSTRAINT payment_authorizations_provider_check,
  ADD CONSTRAINT payment_authorizations_provider_check
    CHECK (provider IN ('line_pay', 'mock_line_pay', 'ecpay', 'mock_ecpay'));

ALTER TABLE payment_refunds
  DROP CONSTRAINT payment_refunds_provider_check,
  ADD CONSTRAINT payment_refunds_provider_check
    CHECK (provider IN ('line_pay', 'mock_line_pay', 'ecpay', 'mock_ecpay'));
