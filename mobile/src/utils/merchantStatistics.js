// GET /api/merchant/stores/:storeId/statistics answers { statistics: { totalRevenue, orderCount,
// discountGivenTotal, settledActivityCount, qualifiedActivityCount, qualifiedRate, topDrinks } }.
// The screen shows these as money, counts and a percentage, so a reply that is not exactly that
// shape is treated as a failed load (null) instead of being rendered as "$NaN" or a negative sale.
const COUNT_FIELDS = ["totalRevenue", "orderCount", "discountGivenTotal", "settledActivityCount", "qualifiedActivityCount"];

const isCount = (value) => Number.isInteger(value) && value >= 0;

export function normalizeMerchantStatistics(statistics) {
  if (!statistics || typeof statistics !== "object") return null;
  const normalized = {};
  for (const field of COUNT_FIELDS) {
    if (!isCount(statistics[field])) return null;
    normalized[field] = statistics[field];
  }
  if (normalized.qualifiedActivityCount > normalized.settledActivityCount) return null;

  const { qualifiedRate, topDrinks } = statistics;
  const rateIsValid = qualifiedRate === null || (typeof qualifiedRate === "number" && qualifiedRate >= 0 && qualifiedRate <= 1);
  if (!rateIsValid) return null;
  if (!Array.isArray(topDrinks)) return null;
  const drinksAreValid = topDrinks.every((drink) => (
    drink && typeof drink.name === "string" && drink.name.length > 0 && Number.isInteger(drink.cups) && drink.cups > 0
  ));
  if (!drinksAreValid) return null;

  return {
    ...normalized,
    qualifiedRate,
    topDrinks: topDrinks.map((drink) => ({ name: drink.name, cups: drink.cups })),
  };
}

// 0.6667 -> "67%"; no settled group buy yet -> null rate -> "尚無資料".
export function formatQualifiedRate(rate) {
  return rate === null ? "尚無資料" : `${Math.round(rate * 100)}%`;
}
