import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/merchantStatistics.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const { normalizeMerchantStatistics, formatQualifiedRate } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const valid = () => ({
  totalRevenue: 351,
  orderCount: 4,
  discountGivenTotal: 104,
  settledActivityCount: 3,
  qualifiedActivityCount: 2,
  qualifiedRate: 2 / 3,
  topDrinks: [{ name: "烏龍拿鐵", cups: 5 }, { name: "紅茶", cups: 3 }],
});

test("normalizeMerchantStatistics keeps a valid summary and drops unknown fields", () => {
  assert.deepEqual(normalizeMerchantStatistics({ ...valid(), extra: "x" }), valid());
});

test("normalizeMerchantStatistics accepts a store with no data yet", () => {
  const empty = {
    totalRevenue: 0, orderCount: 0, discountGivenTotal: 0, settledActivityCount: 0,
    qualifiedActivityCount: 0, qualifiedRate: null, topDrinks: [],
  };
  assert.deepEqual(normalizeMerchantStatistics(empty), empty);
});

test("normalizeMerchantStatistics rejects anything that would render as NaN, negative or nonsense", () => {
  assert.equal(normalizeMerchantStatistics(undefined), null);
  assert.equal(normalizeMerchantStatistics(null), null);
  assert.equal(normalizeMerchantStatistics("351"), null);
  assert.equal(normalizeMerchantStatistics({}), null);

  const broken = (change) => normalizeMerchantStatistics({ ...valid(), ...change });
  assert.equal(broken({ totalRevenue: -1 }), null);
  assert.equal(broken({ totalRevenue: "351" }), null);
  assert.equal(broken({ orderCount: 4.5 }), null);
  assert.equal(broken({ discountGivenTotal: NaN }), null);
  assert.equal(broken({ settledActivityCount: undefined }), null);
  assert.equal(broken({ qualifiedActivityCount: 4, settledActivityCount: 3 }), null);
  assert.equal(broken({ qualifiedRate: 1.5 }), null);
  assert.equal(broken({ qualifiedRate: "0.5" }), null);
  assert.equal(broken({ qualifiedRate: undefined }), null);
  assert.equal(broken({ topDrinks: undefined }), null);
  assert.equal(broken({ topDrinks: "紅茶" }), null);
  assert.equal(broken({ topDrinks: [{ name: "", cups: 2 }] }), null);
  assert.equal(broken({ topDrinks: [{ name: "紅茶", cups: 0 }] }), null);
  assert.equal(broken({ topDrinks: [{ name: "紅茶", cups: "2" }] }), null);
  assert.equal(broken({ topDrinks: [null] }), null);
});

test("formatQualifiedRate rounds to a whole percent and explains a missing rate", () => {
  assert.equal(formatQualifiedRate(2 / 3), "67%");
  assert.equal(formatQualifiedRate(1), "100%");
  assert.equal(formatQualifiedRate(0), "0%");
  assert.equal(formatQualifiedRate(0.125), "13%");
  assert.equal(formatQualifiedRate(null), "尚無資料");
});
