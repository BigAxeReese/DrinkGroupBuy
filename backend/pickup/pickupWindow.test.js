const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validatePickupWindowAgainstClosingTime,
  validateDeadlineAgainstClosingTime,
} = require("./pickupWindow");

// Built from local time components (not fixed UTC strings) so this test is correct
// regardless of the machine's timezone -- pickupWindow.js itself works in local time too
// (see its own comment on why), so the test has to match that, not fight it.
function localTime(hour, minute) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).toISOString();
}

test("no closing time configured means no cap", () => {
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(23, 30), null), null);
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(23, 30), undefined), null);
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(23, 30), ""), null);
});

test("pickup start that leaves a full 3-hour window before closing is allowed", () => {
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(19, 0), "22:00"), null);
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(12, 0), "22:00"), null);
});

test("pickup start that would leave the store open past closing is rejected", () => {
  const result = validatePickupWindowAgainstClosingTime(localTime(20, 0), "22:00");
  assert.equal(result.error, "pickup_start_too_late_for_store_hours");
  assert.equal(result.closingTime, "22:00");
  assert.equal(result.latestPickupStartAt, localTime(19, 0));
});

test("pickup start exactly 3 hours before closing is the allowed boundary, not the rejected one", () => {
  assert.equal(validatePickupWindowAgainstClosingTime(localTime(19, 0), "22:00"), null);
  const oneMinuteLater = validatePickupWindowAgainstClosingTime(localTime(19, 1), "22:00");
  assert.equal(oneMinuteLater.error, "pickup_start_too_late_for_store_hours");
});

test("no closing time configured means no cap on deadline either", () => {
  assert.equal(validateDeadlineAgainstClosingTime(localTime(23, 30), null), null);
  assert.equal(validateDeadlineAgainstClosingTime(localTime(23, 30), undefined), null);
  assert.equal(validateDeadlineAgainstClosingTime(localTime(23, 30), ""), null);
});

test("deadline that leaves a full 1-hour buffer before closing is allowed", () => {
  assert.equal(validateDeadlineAgainstClosingTime(localTime(20, 0), "22:00"), null);
  assert.equal(validateDeadlineAgainstClosingTime(localTime(12, 0), "22:00"), null);
});

test("deadline within the last hour before closing is rejected", () => {
  const result = validateDeadlineAgainstClosingTime(localTime(21, 30), "22:00");
  assert.equal(result.error, "deadline_too_close_to_store_closing");
  assert.equal(result.closingTime, "22:00");
  assert.equal(result.latestDeadlineAt, localTime(21, 0));
});

test("deadline exactly 1 hour before closing is the allowed boundary, not the rejected one", () => {
  assert.equal(validateDeadlineAgainstClosingTime(localTime(21, 0), "22:00"), null);
  const oneMinuteLater = validateDeadlineAgainstClosingTime(localTime(21, 1), "22:00");
  assert.equal(oneMinuteLater.error, "deadline_too_close_to_store_closing");
});
