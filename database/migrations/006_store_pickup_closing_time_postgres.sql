-- Daily closing time as "HH:MM" (24-hour), NULL = 24-hour store / not configured yet.
-- Caps how late a merchant can set a group-buy's pickup start time -- the 3-hour pickup
-- window (backend/pickup/pickupWindow.js) must fit entirely before closing.
ALTER TABLE stores
  ADD COLUMN pickup_closing_time text
  CHECK (pickup_closing_time IS NULL OR pickup_closing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
