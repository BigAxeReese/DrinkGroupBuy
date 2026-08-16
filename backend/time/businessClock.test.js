const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_OFFSET_MINUTES, createBusinessClock } = require("./businessClock");

function createFixture() {
  let current = new Date("2026-08-15T04:00:00.000Z");
  return {
    clock: createBusinessClock({ realNow: () => current }),
    advance(minutes) {
      current = new Date(current.getTime() + minutes * 60_000);
    },
  };
}

test("real mode follows the real server clock", () => {
  const fixture = createFixture();
  assert.equal(fixture.clock.nowIso(), "2026-08-15T04:00:00.000Z");
  fixture.advance(5);
  assert.equal(fixture.clock.nowIso(), "2026-08-15T04:05:00.000Z");
});

test("offset mode follows real time with a positive or negative offset", () => {
  const fixture = createFixture();
  fixture.clock.configure({ mode: "offset", offsetMinutes: 90 });
  assert.equal(fixture.clock.nowIso(), "2026-08-15T05:30:00.000Z");
  fixture.advance(10);
  assert.equal(fixture.clock.nowIso(), "2026-08-15T05:40:00.000Z");

  fixture.clock.configure({ mode: "offset", offsetMinutes: -30 });
  assert.equal(fixture.clock.nowIso(), "2026-08-15T03:40:00.000Z");
});

test("fixed mode stays fixed until reset to real mode", () => {
  const fixture = createFixture();
  fixture.clock.configure({ mode: "fixed", fixedNow: "2026-08-16T12:00:00+08:00" });
  assert.equal(fixture.clock.nowIso(), "2026-08-16T04:00:00.000Z");
  fixture.advance(60);
  assert.equal(fixture.clock.nowIso(), "2026-08-16T04:00:00.000Z");

  const snapshot = fixture.clock.configure({ mode: "real" });
  assert.equal(snapshot.mode, "real");
  assert.equal(snapshot.effectiveNow, "2026-08-15T05:00:00.000Z");
  assert.equal(snapshot.version, 2);
});

test("invalid values and production changes are rejected", () => {
  const fixture = createFixture();
  assert.throws(() => fixture.clock.configure({ mode: "offset", offsetMinutes: 1.5 }), {
    code: "business_time_offset_invalid",
  });
  assert.throws(
    () => fixture.clock.configure({ mode: "offset", offsetMinutes: MAX_OFFSET_MINUTES + 1 }),
    { code: "business_time_offset_out_of_range" }
  );
  assert.throws(() => fixture.clock.configure({ mode: "fixed", fixedNow: "not-a-date" }), {
    code: "business_time_fixed_invalid",
  });
  assert.throws(
    () => fixture.clock.configure({ mode: "fixed", fixedNow: "2026-09-01T00:00:00.000Z" }),
    { code: "business_time_fixed_out_of_range" }
  );
  assert.throws(() => fixture.clock.configure({ mode: "other" }), {
    code: "business_time_mode_invalid",
  });
  assert.throws(() => fixture.clock.configure({ mode: "real" }, { nodeEnv: "production" }), {
    code: "business_time_disabled",
  });
});
