import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/pearlProgress.js", import.meta.url), "utf8");
const { getFilledPearls, getPearlTray } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("no cups ordered fills no pearl", () => {
  assert.equal(getFilledPearls(0, 10, 5), 0);
});

test("fills proportionally, rounding down", () => {
  assert.equal(getFilledPearls(7, 10, 5), 3);
  assert.equal(getFilledPearls(3, 10, 5), 1);
});

test("a full row only appears once the band is reached", () => {
  assert.equal(getFilledPearls(10, 10, 5), 5);
  assert.equal(getFilledPearls(12, 10, 5), 5);
  assert.equal(getFilledPearls(99, 100, 5), 4);
});

test("one order in a very large band still shows a pearl", () => {
  assert.equal(getFilledPearls(1, 100, 5), 1);
});

test("one pearl per cup stays exact when the division is not (29 of 100, 15 of 22)", () => {
  assert.equal(getFilledPearls(29, 100, 100), 29);
  assert.equal(getFilledPearls(15, 22, 22), 15);
  assert.equal(getFilledPearls(31, 39, 39), 31);
});

test("numeric strings from the API are accepted", () => {
  assert.equal(getFilledPearls("7", "10", 5), 3);
});

test("invalid input fills nothing instead of throwing", () => {
  assert.equal(getFilledPearls(Number.NaN, 10, 5), 0);
  assert.equal(getFilledPearls(undefined, 10, 5), 0);
  assert.equal(getFilledPearls(5, 0, 5), 0);
  assert.equal(getFilledPearls(-2, 10, 5), 0);
  assert.equal(getFilledPearls(5, 10, 0), 0);
  assert.equal(getFilledPearls(5, 10, 2.5), 0);
});

test("tray: a small band is one pearl per cup", () => {
  assert.deepEqual(getPearlTray(7, 10), { count: 10, cupsPerPearl: 1, filled: 7 });
  assert.deepEqual(getPearlTray(3, 6), { count: 6, cupsPerPearl: 1, filled: 3 });
  assert.deepEqual(getPearlTray(0, 10), { count: 10, cupsPerPearl: 1, filled: 0 });
});

test("tray: a band over ten cups packs whole cups into each pearl", () => {
  assert.deepEqual(getPearlTray(14, 15), { count: 8, cupsPerPearl: 2, filled: 7 });
  assert.deepEqual(getPearlTray(5, 25), { count: 9, cupsPerPearl: 3, filled: 1 });
  assert.deepEqual(getPearlTray(15, 30), { count: 10, cupsPerPearl: 3, filled: 5 });
});

test("tray: never empty once ordered, never full before the band is reached", () => {
  assert.equal(getPearlTray(1, 100).filled, 1);
  assert.equal(getPearlTray(99, 100).filled, 9);
  assert.equal(getPearlTray(9, 10).filled, 9);
  assert.equal(getPearlTray(10, 10).filled, 10);
  assert.equal(getPearlTray(12, 10).filled, 10);
});

test("tray: invalid input draws nothing instead of throwing", () => {
  assert.deepEqual(getPearlTray(3, 0), { count: 0, cupsPerPearl: 1, filled: 0 });
  assert.deepEqual(getPearlTray(3, undefined), { count: 0, cupsPerPearl: 1, filled: 0 });
  assert.deepEqual(getPearlTray(3, 10, 0), { count: 0, cupsPerPearl: 1, filled: 0 });
  assert.equal(getPearlTray(Number.NaN, 10).filled, 0);
  assert.equal(getPearlTray(-4, 10).filled, 0);
});
