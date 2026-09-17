"use strict";

const PICKUP_WINDOW_MS = 3 * 60 * 60 * 1000;
const DEADLINE_CLOSING_BUFFER_MS = 60 * 60 * 1000;

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

// Shared shape behind both checks below: "referenceAt can't be later than (closing - bufferMs)".
// Returns the latest allowed moment, or null when closingTime is unset (24-hour store, or not
// configured yet) and there's therefore no cap at all.
function computeLatestAllowedBeforeClosing(referenceAt, closingTime, bufferMs) {
  if (!closingTime) return null;
  const closingDateTime = getClosingDateTimeForPickupDay(referenceAt, closingTime);
  return new Date(closingDateTime.getTime() - bufferMs);
}

// A group-buy's pickup window is always exactly 3 hours (see computeActivityPickupEndAt in
// backend/server.js). If the store has a known daily closing time, that 3-hour window must
// fit entirely before closing -- pickupStartAt can't be set so late that pickup would still
// be open past closing.
function validatePickupWindowAgainstClosingTime(pickupStartAt, closingTime) {
  const latestPickupStartAt = computeLatestAllowedBeforeClosing(pickupStartAt, closingTime, PICKUP_WINDOW_MS);
  if (!latestPickupStartAt) return null;
  if (Date.parse(pickupStartAt) > latestPickupStartAt.getTime()) {
    return {
      error: "pickup_start_too_late_for_store_hours",
      closingTime,
      latestPickupStartAt: latestPickupStartAt.toISOString()
    };
  }
  return null;
}

// A group-buy's recruiting deadline can't land in the last hour before the store closes --
// merchants need that hour after recruiting ends to start preparing pickup. This is an
// independent check from the pickup window one above, not derived from it.
function validateDeadlineAgainstClosingTime(deadlineAt, closingTime) {
  const latestDeadlineAt = computeLatestAllowedBeforeClosing(deadlineAt, closingTime, DEADLINE_CLOSING_BUFFER_MS);
  if (!latestDeadlineAt) return null;
  if (Date.parse(deadlineAt) > latestDeadlineAt.getTime()) {
    return {
      error: "deadline_too_close_to_store_closing",
      closingTime,
      latestDeadlineAt: latestDeadlineAt.toISOString()
    };
  }
  return null;
}

module.exports = {
  validatePickupWindowAgainstClosingTime,
  validateDeadlineAgainstClosingTime
};
