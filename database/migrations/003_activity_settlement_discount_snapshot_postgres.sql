-- Immutable discount allocation snapshot for each completed activity settlement.
-- Existing rows used the same floor-per-cup formula and were merchant funded.

ALTER TABLE activity_settlements
  ADD COLUMN discount_per_cup integer,
  ADD COLUMN allocated_discount_amount integer,
  ADD COLUMN undistributed_discount_amount integer,
  ADD COLUMN discount_funder text,
  ADD COLUMN calculation_version text;

UPDATE activity_settlements
SET discount_per_cup = CASE
      WHEN authorized_cups > 0 THEN discount_amount / authorized_cups
      ELSE 0
    END,
    allocated_discount_amount = CASE
      WHEN authorized_cups > 0 THEN (discount_amount / authorized_cups) * authorized_cups
      ELSE 0
    END,
    undistributed_discount_amount = CASE
      WHEN authorized_cups > 0 THEN discount_amount - ((discount_amount / authorized_cups) * authorized_cups)
      ELSE discount_amount
    END,
    discount_funder = 'merchant',
    calculation_version = 'floor_per_cup_v1';

ALTER TABLE activity_settlements
  ALTER COLUMN discount_per_cup SET NOT NULL,
  ALTER COLUMN allocated_discount_amount SET NOT NULL,
  ALTER COLUMN undistributed_discount_amount SET NOT NULL,
  ALTER COLUMN discount_funder SET NOT NULL,
  ALTER COLUMN calculation_version SET NOT NULL;

ALTER TABLE activity_settlements
  ADD CONSTRAINT activity_settlements_discount_per_cup_nonnegative
    CHECK (discount_per_cup >= 0),
  ADD CONSTRAINT activity_settlements_allocated_discount_nonnegative
    CHECK (allocated_discount_amount >= 0),
  ADD CONSTRAINT activity_settlements_undistributed_discount_nonnegative
    CHECK (undistributed_discount_amount >= 0),
  ADD CONSTRAINT activity_settlements_discount_funder_valid
    CHECK (discount_funder IN ('merchant', 'platform')),
  ADD CONSTRAINT activity_settlements_calculation_version_present
    CHECK (length(btrim(calculation_version)) > 0),
  ADD CONSTRAINT activity_settlements_discount_total_consistent
    CHECK (
      allocated_discount_amount::bigint + undistributed_discount_amount::bigint
      = discount_amount::bigint
    ),
  ADD CONSTRAINT activity_settlements_discount_allocation_consistent
    CHECK (
      allocated_discount_amount::bigint
      = discount_per_cup::bigint * authorized_cups::bigint
    );
