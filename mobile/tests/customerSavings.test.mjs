import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/customerSavings.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const { normalizeCustomerSavings } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("normalizeCustomerSavings keeps a valid backend summary", () => {
  assert.deepEqual(
    normalizeCustomerSavings({ totalSavedAmount: 103, savedOrderCount: 3, savedCupCount: 6, extra: "x" }),
    { totalSavedAmount: 103, savedOrderCount: 3, savedCupCount: 6 }
  );
});

test("normalizeCustomerSavings accepts an all-zero summary", () => {
  assert.deepEqual(
    normalizeCustomerSavings({ totalSavedAmount: 0, savedOrderCount: 0, savedCupCount: 0 }),
    { totalSavedAmount: 0, savedOrderCount: 0, savedCupCount: 0 }
  );
});

test("normalizeCustomerSavings rejects anything that would render as NaN or a negative saving", () => {
  assert.equal(normalizeCustomerSavings(undefined), null);
  assert.equal(normalizeCustomerSavings(null), null);
  assert.equal(normalizeCustomerSavings("103"), null);
  assert.equal(normalizeCustomerSavings({}), null);
  assert.equal(normalizeCustomerSavings({ totalSavedAmount: 103, savedOrderCount: 3 }), null);
  assert.equal(normalizeCustomerSavings({ totalSavedAmount: "103", savedOrderCount: 3, savedCupCount: 6 }), null);
  assert.equal(normalizeCustomerSavings({ totalSavedAmount: -1, savedOrderCount: 3, savedCupCount: 6 }), null);
  assert.equal(normalizeCustomerSavings({ totalSavedAmount: 10.5, savedOrderCount: 3, savedCupCount: 6 }), null);
  assert.equal(normalizeCustomerSavings({ totalSavedAmount: NaN, savedOrderCount: 3, savedCupCount: 6 }), null);
});
