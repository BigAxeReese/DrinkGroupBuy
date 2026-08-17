import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/distance.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const distanceModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { calculateDistanceKm, formatDistanceKm } = distanceModule;

test("calculateDistanceKm returns 0 for identical points", () => {
  const point = { latitude: 24.1511, longitude: 120.6817 };
  assert.equal(calculateDistanceKm(point, point), 0);
});

test("calculateDistanceKm computes a known real-world distance", () => {
  // Taipei 101 to Taichung HSR station, ~140km apart (great-circle distance).
  const taipei101 = { latitude: 25.0330, longitude: 121.5654 };
  const taichungHsr = { latitude: 24.1109, longitude: 120.6151 };
  const distanceKm = calculateDistanceKm(taipei101, taichungHsr);
  assert.ok(distanceKm > 135 && distanceKm < 145, `expected ~135-145km, got ${distanceKm}`);
});

test("calculateDistanceKm returns null when either point lacks finite coordinates", () => {
  const validPoint = { latitude: 24.1511, longitude: 120.6817 };
  assert.equal(calculateDistanceKm(null, validPoint), null);
  assert.equal(calculateDistanceKm(validPoint, {}), null);
  assert.equal(calculateDistanceKm(validPoint, { latitude: NaN, longitude: 120 }), null);
});

test("formatDistanceKm shows meters under 1km and rounded km otherwise", () => {
  assert.equal(formatDistanceKm(0.28), "280 公尺");
  assert.equal(formatDistanceKm(0.999), "999 公尺");
  assert.equal(formatDistanceKm(1), "1 公里");
  assert.equal(formatDistanceKm(4.96), "5 公里");
  assert.equal(formatDistanceKm(4.94), "4.9 公里");
});

test("formatDistanceKm returns null for non-finite input", () => {
  assert.equal(formatDistanceKm(null), null);
  assert.equal(formatDistanceKm(NaN), null);
});
