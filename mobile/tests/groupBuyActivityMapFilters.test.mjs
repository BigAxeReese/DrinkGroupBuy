import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/utils/groupBuyActivityMapFilters.js", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
// Stub out the two dependencies so the data-URL import doesn't have to resolve a real module
// graph (mirrors the pattern in deadlineTime.test.mjs). getBusinessNow is replaced per-test via
// the `now` parameter instead, so the stub here is just a fallback default. calculateDistanceKm is
// spliced in from the real distance.js source (not a hand-copied reimplementation) so this test
// stays bound to the actual implementation instead of silently drifting from it.
source = source.replace('import { getBusinessNow } from "./businessTime";', "const getBusinessNow = () => new Date();");

const distanceSourceUrl = new URL("../src/utils/distance.js", import.meta.url);
const distanceSource = (await readFile(distanceSourceUrl, "utf8")).replace(/^export /gm, "");
source = source.replace('import { calculateDistanceKm } from "./distance";', distanceSource);

const mapFiltersModule = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const { DEFAULT_MAP_FILTERS, filterMapStores, describeAppliedFilters } = mapFiltersModule;

const userPosition = { latitude: 24.1511, longitude: 120.6817 };

function buildStore(overrides = {}) {
  return {
    id: "store-001",
    name: "測試店家",
    latitude: 24.1511,
    longitude: 120.6817,
    hasRecruitingGroupBuyActivity: false,
    joinableGroupBuyActivities: [],
    ...overrides
  };
}

test("recruitingOnly excludes stores without a recruiting activity", () => {
  const recruiting = buildStore({ id: "a", hasRecruitingGroupBuyActivity: true });
  const idle = buildStore({ id: "b", hasRecruitingGroupBuyActivity: false });
  const result = filterMapStores([recruiting, idle], { ...DEFAULT_MAP_FILTERS, recruitingOnly: true }, userPosition);
  assert.deepEqual(result.map((store) => store.id), ["a"]);
});

test("recruitingOnly defaults to false and keeps stores with no active group buy", () => {
  assert.equal(DEFAULT_MAP_FILTERS.recruitingOnly, false);
  const idle = buildStore({ id: "b", hasRecruitingGroupBuyActivity: false });
  const result = filterMapStores([idle], DEFAULT_MAP_FILTERS, userPosition);
  assert.deepEqual(result.map((store) => store.id), ["b"]);
});

test("radiusKm keeps only stores within the distance and null means unlimited", () => {
  const near = buildStore({ id: "near", latitude: 24.1511, longitude: 120.6817, hasRecruitingGroupBuyActivity: true });
  const far = buildStore({ id: "far", latitude: 25.0330, longitude: 121.5654, hasRecruitingGroupBuyActivity: true });
  const within1km = filterMapStores([near, far], { ...DEFAULT_MAP_FILTERS, radiusKm: 1 }, userPosition);
  assert.deepEqual(within1km.map((store) => store.id), ["near"]);

  const unlimited = filterMapStores([near, far], { ...DEFAULT_MAP_FILTERS, radiusKm: null }, userPosition);
  assert.deepEqual(unlimited.map((store) => store.id).sort(), ["far", "near"]);
});

test("minCups only matches stores with an activity that already reached the threshold", () => {
  const qualified = buildStore({
    id: "qualified",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [{ id: "act-1", currentCups: 22, pickupStartAt: null }]
  });
  const notYet = buildStore({
    id: "notYet",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [{ id: "act-2", currentCups: 5, pickupStartAt: null }]
  });
  const result = filterMapStores([qualified, notYet], { ...DEFAULT_MAP_FILTERS, minCups: 20 }, userPosition);
  assert.deepEqual(result.map((store) => store.id), ["qualified"]);
});

test("pickupWithinMinutes matches an activity starting soon but not one already past its pickup start", () => {
  const now = new Date("2026-08-25T10:00:00.000Z");
  const startingSoon = buildStore({
    id: "soon",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [{ id: "act-1", currentCups: 0, pickupStartAt: "2026-08-25T10:20:00.000Z" }]
  });
  const alreadyStarted = buildStore({
    id: "past",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [{ id: "act-2", currentCups: 0, pickupStartAt: "2026-08-25T09:50:00.000Z" }]
  });
  const tooFarOut = buildStore({
    id: "later",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [{ id: "act-3", currentCups: 0, pickupStartAt: "2026-08-25T12:00:00.000Z" }]
  });
  const result = filterMapStores(
    [startingSoon, alreadyStarted, tooFarOut],
    { ...DEFAULT_MAP_FILTERS, pickupWithinMinutes: 30 },
    userPosition,
    now
  );
  assert.deepEqual(result.map((store) => store.id), ["soon"]);
});

test("minCups + pickupWithinMinutes together require the same activity to satisfy both, not two different ones", () => {
  const now = new Date("2026-08-25T10:00:00.000Z");
  // Store has two activities: one meets the cup threshold but picks up late, the other picks up
  // soon but hasn't reached the threshold -- neither single activity satisfies both conditions.
  const noSingleActivityQualifies = buildStore({
    id: "split",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [
      { id: "act-high-cups-late-pickup", currentCups: 35, pickupStartAt: "2026-08-25T13:00:00.000Z" },
      { id: "act-low-cups-soon-pickup", currentCups: 5, pickupStartAt: "2026-08-25T10:15:00.000Z" }
    ]
  });
  // Store has one activity that alone satisfies both conditions.
  const oneActivityQualifies = buildStore({
    id: "combined",
    hasRecruitingGroupBuyActivity: true,
    joinableGroupBuyActivities: [
      { id: "act-both", currentCups: 35, pickupStartAt: "2026-08-25T10:15:00.000Z" }
    ]
  });

  const result = filterMapStores(
    [noSingleActivityQualifies, oneActivityQualifies],
    { ...DEFAULT_MAP_FILTERS, minCups: 30, pickupWithinMinutes: 30 },
    userPosition,
    now
  );
  assert.deepEqual(result.map((store) => store.id), ["combined"]);
});

test("describeAppliedFilters lists only the active criteria plus the match count", () => {
  assert.equal(describeAppliedFilters(DEFAULT_MAP_FILTERS, 3), "不限篩選條件・符合 3 間");
  assert.equal(
    describeAppliedFilters({ recruitingOnly: true, radiusKm: 1, minCups: 20, pickupWithinMinutes: 30 }, 2),
    "只看招募中・1 公里內・滿 20 杯・30 分鐘內・符合 2 間"
  );
  assert.equal(
    describeAppliedFilters({ recruitingOnly: false, radiusKm: null, minCups: null, pickupWithinMinutes: null }, 5),
    "不限篩選條件・符合 5 間"
  );
});
