"use strict";

const PICKUP_WINDOW_MS = 3 * 60 * 60 * 1000;

// Combines a store's daily closing time ("HH:MM", interpreted in the server's local
// timezone -- this project has no explicit timezone handling anywhere else either) with
// pickupStartAt's own calendar date, to get "today's closing moment" as a real Date.
// Known limitation: doesn't handle a store whose closing time crosses midnight (e.g. "02:00"
// meaning 2am the next day) -- not needed for this project's current store roster.
function getClosingDateTimeForPickupDay(pickupStartAt, closingTime) {
  const pickupDate = new Date(pickupStartAt);
  const [closingHour, closingMinute] = closingTime.split(":").map(Number);
  const closingDateTime = new Date(pickupDate);
  closingDateTime.setHours(closingHour, closingMinute, 0, 0);
  return closingDateTime;
}

// A group-buy's pickup window is always exactly 3 hours (see computeActivityPickupEndAt in
// backend/server.js). If the store has a known daily closing time, that 3-hour window must
// fit entirely before closing -- pickupStartAt can't be set so late that pickup would still
// be open past closing. When closingTime is unset (24-hour store, or not configured yet),
// there's no cap.
function validatePickupWindowAgainstClosingTime(pickupStartAt, closingTime) {
  if (!closingTime) return null;

  const closingDateTime = getClosingDateTimeForPickupDay(pickupStartAt, closingTime);
  const latestPickupStartAt = new Date(closingDateTime.getTime() - PICKUP_WINDOW_MS);
  if (Date.parse(pickupStartAt) > latestPickupStartAt.getTime()) {
    return {
      error: "pickup_start_too_late_for_store_hours",
      closingTime,
      latestPickupStartAt: latestPickupStartAt.toISOString()
    };
  }
  return null;
}

module.exports = {
  validatePickupWindowAgainstClosingTime
};
