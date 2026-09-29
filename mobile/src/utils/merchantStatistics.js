// GET /api/merchant/stores/:storeId/statistics answers { statistics: { totalRevenue, orderCount,
// discountGivenTotal, settledActivityCount, qualifiedActivityCount, qualifiedRate, topDrinks,
// weeklyTrend } }. The screen shows these as money, counts and a percentage, so a reply that is not
// exactly that shape is treated as a failed load (null) instead of being rendered as "$NaN" or a
// negative sale.
const COUNT_FIELDS = ["totalRevenue", "orderCount", "discountGivenTotal", "settledActivityCount", "qualifiedActivityCount"];
const WEEK_COUNT_FIELDS = ["orderCount", "revenue", "discountAmount"];

const isCount = (value) => Number.isInteger(value) && value >= 0;

// Missing entirely (not present in the payload at all) is treated as "no trend data yet", not a
// validation failure -- this field can be absent for a short window if a mobile OTA update (which
// ships independently of the backend) reaches a device before the backend redeploy that started
// returning it, or if the backend gets rolled back afterwards. `null` gets the same treatment: the
// backend sends it deliberately when its own weeklyTrend query failed (server.js's
// `.catch(() => null)`, kept separate from the store's other statistics so one broken trend query
// doesn't blank out the revenue/order figures that did load) -- since the underlying SQL now always
// zero-fills every week on success, an empty result can otherwise only mean "the query failed", so
// treating `null` as ordinary empty data here would make a real backend error indistinguishable from
// a store that genuinely has no orders yet. A field that IS present but malformed some OTHER way
// still fails the whole load, same as every other field here.
// Returns { weeklyTrend, weeklyTrendUnavailable } on success, or null if the field is present but
// malformed some other way (rejecting the whole payload, same as every other field here). Returning
// the unavailable flag together with the array -- instead of the caller separately re-inspecting the
// raw field afterwards -- keeps the undefined/null distinction in the one place that already has to
// know it.
function normalizeWeeklyTrend(weeklyTrend) {
  if (weeklyTrend === undefined) return { weeklyTrend: [], weeklyTrendUnavailable: false };
  if (weeklyTrend === null) return { weeklyTrend: [], weeklyTrendUnavailable: true };
  if (!Array.isArray(weeklyTrend)) return null;
  const normalized = [];
  for (const week of weeklyTrend) {
    if (!week || typeof week.weekStart !== "string" || week.weekStart.length === 0) return null;
    const entry = { weekStart: week.weekStart };
    for (const field of WEEK_COUNT_FIELDS) {
      if (!isCount(week[field])) return null;
      entry[field] = week[field];
    }
    normalized.push(entry);
  }
  return { weeklyTrend: normalized, weeklyTrendUnavailable: false };
}

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

  const weeklyTrendResult = normalizeWeeklyTrend(statistics.weeklyTrend);
  if (weeklyTrendResult === null) return null;

  return {
    ...normalized,
    qualifiedRate,
    topDrinks: topDrinks.map((drink) => ({ name: drink.name, cups: drink.cups })),
    ...weeklyTrendResult,
  };
}

// 0.6667 -> "67%"; no settled group buy yet -> null rate -> "尚無資料".
export function formatQualifiedRate(rate) {
  return rate === null ? "尚無資料" : `${Math.round(rate * 100)}%`;
}
