// GET /api/customers/me/savings answers { savings: { totalSavedAmount, savedOrderCount,
// savedCupCount } }. The screen shows these as money and counts, so anything that isn't a
// non-negative whole number is treated as a failed load (null) instead of being rendered as
// "$NaN" or a negative saving.
const SAVINGS_FIELDS = ["totalSavedAmount", "savedOrderCount", "savedCupCount"];

export function normalizeCustomerSavings(savings) {
  if (!savings || typeof savings !== "object") return null;
  const normalized = {};
  for (const field of SAVINGS_FIELDS) {
    const value = savings[field];
    if (!Number.isInteger(value) || value < 0) return null;
    normalized[field] = value;
  }
  return normalized;
}
