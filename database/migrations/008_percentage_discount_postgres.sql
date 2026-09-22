-- Replaces flat-amount promotion tiers ("滿N杯折$X") with percentage-off tiers ("滿N杯打M折")
-- per product decision 2026-09-18. No backward-compat/dual-mode: the old discount_amount
-- semantics and migration 003's floor-per-cup activity-wide allocation model (discount_per_cup,
-- allocated_discount_amount, undistributed_discount_amount) are removed outright, not preserved.
-- See docs/payment-rules-and-flow.md for the new per-order percentage calculation.
--
-- PRECONDITION: all group_buy_activities (and everything that references them -- promotion_tiers,
-- orders, activity_settlements, etc.) must be deleted BEFORE running this migration, e.g.
-- `TRUNCATE TABLE group_buy_activities CASCADE;`. Otherwise existing flat-dollar tier rows would
-- silently be reinterpreted as percentages by the new application code. The guard below aborts
-- loudly instead of letting that happen if the cleanup step was skipped.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM promotion_tiers LIMIT 1) THEN
    RAISE EXCEPTION 'promotion_tiers is not empty; delete all group_buy_activities before running migration 008';
  END IF;
  IF EXISTS (SELECT 1 FROM activity_settlements LIMIT 1) THEN
    RAISE EXCEPTION 'activity_settlements is not empty; delete all group_buy_activities before running migration 008';
  END IF;
END $$;

-- promotion_tiers: flat NTD discount_amount -> percent-off discount_percent (1-99).
ALTER TABLE promotion_tiers
  DROP COLUMN discount_amount,
  ADD COLUMN discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 99);

-- activity_settlements: drop the floor-per-cup activity-wide allocation snapshot from migration
-- 003 (meaningless once discount is computed per order against that order's own original_amount
-- -- there is no single "total pool" to divide any more), rename discount_amount ->
-- total_discount_amount (now a derived sum of per-order discounts, not an upfront pool), and add
-- discount_percent (the tier's percent-off actually applied).
ALTER TABLE activity_settlements
  DROP CONSTRAINT activity_settlements_discount_total_consistent,
  DROP CONSTRAINT activity_settlements_discount_allocation_consistent,
  DROP CONSTRAINT activity_settlements_discount_per_cup_nonnegative,
  DROP CONSTRAINT activity_settlements_allocated_discount_nonnegative,
  DROP CONSTRAINT activity_settlements_undistributed_discount_nonnegative,
  DROP COLUMN discount_per_cup,
  DROP COLUMN allocated_discount_amount,
  DROP COLUMN undistributed_discount_amount;

ALTER TABLE activity_settlements
  RENAME COLUMN discount_amount TO total_discount_amount;

ALTER TABLE activity_settlements
  ADD COLUMN discount_percent integer
    CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 99);
