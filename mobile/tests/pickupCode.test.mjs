import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/pickupCode.js", import.meta.url), "utf8");
const { formatPickupCode } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("a six-digit code is split into two groups of three", () => {
  assert.equal(formatPickupCode("482917"), "482 917");
  assert.equal(formatPickupCode(482917), "482 917");
});

test("anything that is not exactly six digits is shown unchanged", () => {
  assert.equal(formatPickupCode("12345"), "12345");
  assert.equal(formatPickupCode("1234567"), "1234567");
  assert.equal(formatPickupCode("48A917"), "48A917");
});

test("a missing code becomes an empty string", () => {
  assert.equal(formatPickupCode(null), "");
  assert.equal(formatPickupCode(undefined), "");
});
