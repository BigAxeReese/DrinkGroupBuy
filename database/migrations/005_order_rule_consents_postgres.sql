CREATE TABLE order_rule_consents (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_user_id text NOT NULL REFERENCES users(id),
  rule_type text NOT NULL CHECK (rule_type IN ('pickup_overdue')),
  rule_version text NOT NULL,
  rule_content_snapshot text NOT NULL,
  consented_at timestamptz NOT NULL,
  UNIQUE (order_id, rule_type, rule_version)
);

CREATE INDEX idx_order_rule_consents_order ON order_rule_consents(order_id);
CREATE INDEX idx_order_rule_consents_customer ON order_rule_consents(customer_user_id);
CREATE INDEX idx_order_rule_consents_consented_at ON order_rule_consents(consented_at);
