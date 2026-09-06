-- Simulated merchant payout (platform collects via a single LINE Pay account, then
-- settles a net amount to each store once per calendar month). "Simulated" means no
-- real bank transfer happens -- this is the system of record for the demo, not a
-- trigger for an actual money movement. See docs/payment-rules-and-flow.md.
CREATE TABLE merchant_payouts (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  gross_amount integer NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  refund_within_period_amount integer NOT NULL DEFAULT 0 CHECK (refund_within_period_amount >= 0),
  platform_commission_amount integer NOT NULL DEFAULT 0 CHECK (platform_commission_amount >= 0),
  carried_deduction_amount integer NOT NULL DEFAULT 0 CHECK (carried_deduction_amount >= 0),
  net_payout_amount integer NOT NULL CHECK (net_payout_amount >= 0),
  commission_rate_bp integer NOT NULL CHECK (commission_rate_bp >= 0 AND commission_rate_bp <= 10000),
  triggered_by_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, period_start, period_end)
);

CREATE INDEX idx_merchant_payouts_store_period ON merchant_payouts(store_id, period_start);

-- A refund that lands on a capture whose period was already paid out cannot be netted
-- into that closed period, so it is recorded here and deducted from the store's future
-- payouts (oldest adjustment first) until fully applied.
CREATE TABLE merchant_payout_adjustments (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  payment_refund_id text NOT NULL UNIQUE REFERENCES payment_refunds(id),
  source_merchant_payout_id text NOT NULL REFERENCES merchant_payouts(id),
  total_amount integer NOT NULL CHECK (total_amount > 0),
  remaining_amount integer NOT NULL CHECK (remaining_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fully_applied')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_merchant_payout_adjustments_store_status ON merchant_payout_adjustments(store_id, status);

-- Audit trail of which payout period consumed how much of which adjustment.
CREATE TABLE merchant_payout_adjustment_applications (
  id text PRIMARY KEY,
  merchant_payout_id text NOT NULL REFERENCES merchant_payouts(id),
  merchant_payout_adjustment_id text NOT NULL REFERENCES merchant_payout_adjustments(id),
  applied_amount integer NOT NULL CHECK (applied_amount > 0),
  created_at timestamptz NOT NULL,
  UNIQUE (merchant_payout_id, merchant_payout_adjustment_id)
);

CREATE INDEX idx_merchant_payout_adjustment_applications_payout
ON merchant_payout_adjustment_applications(merchant_payout_id);
CREATE INDEX idx_merchant_payout_adjustment_applications_adjustment
ON merchant_payout_adjustment_applications(merchant_payout_adjustment_id);
