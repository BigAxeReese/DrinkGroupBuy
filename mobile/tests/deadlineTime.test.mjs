import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/deadlineTime.js", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
// This module imports getBusinessNow from ./businessTime, which isn't needed by the pure
// formatting function under test here -- stub it out so the data-URL import doesn't have to
// resolve a real module graph (mirrors the pattern in distance.test.mjs for dependency-free
// utility files).
source = source.replace('import { getBusinessNow } from "./businessTime";', "const getBusinessNow = () => new Date();");
const deadlineTimeModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { formatPickupTimeRangeLabel } = deadlineTimeModule;

test("formatPickupTimeRangeLabel shows the date once and both times, not raw ISO strings", () => {
  // 2026-08-21 is a Friday; 06:56 UTC and 09:56 UTC are 2026-08-21 14:56 and 17:56 in the
  // machine's local time zone used by `new Date(isoString)` -- assert on the actual local
  // rendering rather than assuming a specific offset, mirroring how the source function itself
  // works entirely in local time (no explicit time zone handling anywhere in this project).
  const start = new Date("2026-08-21T06:56:09.000Z");
  const end = new Date("2026-08-21T09:56:09.000Z");
  const label = formatPickupTimeRangeLabel(start.toISOString(), end.toISOString());

  assert.ok(!label.includes("Z"), `expected no raw ISO marker in "${label}"`);
  assert.ok(!label.includes("T0") && !label.includes("T1") && !label.includes("T2"), `expected no raw ISO "T" separator in "${label}"`);
  assert.match(label, /^\d{2}\/\d{2}（[日一二三四五六]） (上午|下午)\d{2}:\d{2} - (上午|下午)\d{2}:\d{2}$/);
});

test("formatPickupTimeRangeLabel falls back to a plain join for unparseable input instead of throwing", () => {
  assert.equal(formatPickupTimeRangeLabel("not-a-date", "also-not-a-date"), "not-a-date - also-not-a-date");
});

test("formatPickupTimeRangeLabel shows both dates when the 3-hour window crosses midnight", () => {
  // Stores without a configured closing time have no cap on pickupStartAt, so a late-night
  // start can push pickupEndAt into the next local calendar day -- construct start/end purely
  // from local-time components (not a fixed UTC offset) so this holds regardless of the
  // machine's time zone, mirroring how the source function itself works entirely in local time.
  const start = new Date();
  start.setHours(23, 30, 0, 0);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  assert.notEqual(start.getDate(), end.getDate(), "test setup must actually cross midnight");

  const label = formatPickupTimeRangeLabel(start.toISOString(), end.toISOString());

  const dateMatches = label.match(/\d{2}\/\d{2}（[日一二三四五六]）/g) ?? [];
  assert.equal(dateMatches.length, 2, `expected both dates in "${label}"`);
  assert.notEqual(dateMatches[0], dateMatches[1], `expected the two dates to differ in "${label}"`);
});
