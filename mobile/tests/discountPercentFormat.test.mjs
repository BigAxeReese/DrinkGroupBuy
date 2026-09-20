import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/discountPercentFormat.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const formatModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const {
  parseDealFactorToDiscountPercent,
  formatDiscountPercentAsDealFactor,
  formatDealFactorLabel
} = formatModule;

test("parseDealFactorToDiscountPercent converts a whole-number 折 to percent off", () => {
  assert.equal(parseDealFactorToDiscountPercent("7"), 30);
  assert.equal(parseDealFactorToDiscountPercent("9"), 10);
});

test("parseDealFactorToDiscountPercent converts a one-decimal 折 to percent off", () => {
  assert.equal(parseDealFactorToDiscountPercent("7.9"), 21);
  assert.equal(parseDealFactorToDiscountPercent("7.3"), 27);
  assert.equal(parseDealFactorToDiscountPercent("8.5"), 15);
});

test("parseDealFactorToDiscountPercent rejects out-of-range or malformed input", () => {
  assert.equal(parseDealFactorToDiscountPercent("10"), null);
  assert.equal(parseDealFactorToDiscountPercent("0"), null);
  assert.equal(parseDealFactorToDiscountPercent("7.99"), null);
  assert.equal(parseDealFactorToDiscountPercent("abc"), null);
  assert.equal(parseDealFactorToDiscountPercent(""), null);
});

test("formatDiscountPercentAsDealFactor round-trips whole and fractional 折", () => {
  assert.equal(formatDiscountPercentAsDealFactor(30), "7");
  assert.equal(formatDiscountPercentAsDealFactor(21), "7.9");
  assert.equal(formatDiscountPercentAsDealFactor(27), "7.3");
});

test("formatDiscountPercentAsDealFactor rejects out-of-range values", () => {
  assert.equal(formatDiscountPercentAsDealFactor(0), null);
  assert.equal(formatDiscountPercentAsDealFactor(100), null);
});

test("formatDealFactorLabel appends 折", () => {
  assert.equal(formatDealFactorLabel(30), "7折");
  assert.equal(formatDealFactorLabel(21), "7.9折");
});
