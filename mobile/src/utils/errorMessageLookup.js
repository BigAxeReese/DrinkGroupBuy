// Shared by orderWriteErrors.js and groupBuyActivityErrors.js -- both translate a backend error
// code into a fixed Traditional Chinese string via a flat lookup table, falling back when the
// code isn't recognized. Cases needing interpolated values (amounts, dates) stay in their own
// file as guard clauses before/after this call; only the flat code->string part is shared here.
export function lookupErrorMessage(code, table, fallback) {
  return table[code] ?? fallback;
}
