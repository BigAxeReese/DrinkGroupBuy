const MAX_OFFSET_MINUTES = 7 * 24 * 60;

function createBusinessClock(options = {}) {
  const realNow = options.realNow || (() => new Date());
  let state = createRealState(realNow, 0);

  function now() {
    const currentRealNow = readValidRealNow(realNow);
    if (state.mode === "fixed") return new Date(state.fixedNow);
    if (state.mode === "offset") {
      return new Date(currentRealNow.getTime() + state.offsetMinutes * 60_000);
    }
    return currentRealNow;
  }

  function nowIso() {
    return now().toISOString();
  }

  function getSnapshot() {
    const currentRealNow = readValidRealNow(realNow);
    return {
      mode: state.mode,
      offsetMinutes: state.offsetMinutes,
      fixedNow: state.fixedNow,
      simulated: state.mode !== "real",
      effectiveNow: now().toISOString(),
      realNow: currentRealNow.toISOString(),
      updatedAt: state.updatedAt,
      version: state.version,
      maxOffsetMinutes: MAX_OFFSET_MINUTES,
    };
  }

  function configure(input = {}, context = {}) {
    if (context.nodeEnv === "production") {
      throw createClockError("business_time_disabled", "Business time cannot be changed in production.");
    }

    const mode = String(input.mode || "").trim().toLowerCase();
    if (!mode) {
      throw createClockError("business_time_mode_required", "mode is required.");
    }

    const currentRealNow = readValidRealNow(realNow);
    const nextVersion = state.version + 1;
    if (mode === "real") {
      state = createRealState(() => currentRealNow, nextVersion);
      return getSnapshot();
    }

    if (mode === "offset") {
      const offsetMinutes = Number(input.offsetMinutes);
      if (!Number.isInteger(offsetMinutes)) {
        throw createClockError("business_time_offset_invalid", "offsetMinutes must be an integer.");
      }
      if (Math.abs(offsetMinutes) > MAX_OFFSET_MINUTES) {
        throw createClockError(
          "business_time_offset_out_of_range",
          `offsetMinutes must be between -${MAX_OFFSET_MINUTES} and ${MAX_OFFSET_MINUTES}.`
        );
      }
      state = {
        mode,
        offsetMinutes,
        fixedNow: null,
        updatedAt: currentRealNow.toISOString(),
        version: nextVersion,
      };
      return getSnapshot();
    }

    if (mode === "fixed") {
      const fixedNow = parseIsoDate(input.fixedNow, "fixedNow");
      const differenceMinutes = Math.abs(fixedNow.getTime() - currentRealNow.getTime()) / 60_000;
      if (differenceMinutes > MAX_OFFSET_MINUTES) {
        throw createClockError(
          "business_time_fixed_out_of_range",
          "fixedNow must be within 7 days of the real server time."
        );
      }
      state = {
        mode,
        offsetMinutes: 0,
        fixedNow: fixedNow.toISOString(),
        updatedAt: currentRealNow.toISOString(),
        version: nextVersion,
      };
      return getSnapshot();
    }

    throw createClockError("business_time_mode_invalid", "mode must be real, offset, or fixed.");
  }

  return { configure, getSnapshot, now, nowIso };
}

function createRealState(realNow, version) {
  const currentRealNow = readValidRealNow(realNow);
  return {
    mode: "real",
    offsetMinutes: 0,
    fixedNow: null,
    updatedAt: currentRealNow.toISOString(),
    version,
  };
}

function readValidRealNow(realNow) {
  const value = realNow();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("realNow must return a valid date.");
  }
  return date;
}

function parseIsoDate(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw createClockError("business_time_fixed_invalid", `${fieldName} must be an ISO date string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createClockError("business_time_fixed_invalid", `${fieldName} must be a valid ISO date string.`);
  }
  return date;
}

function createClockError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const businessClock = createBusinessClock();

module.exports = {
  MAX_OFFSET_MINUTES,
  businessClock,
  createBusinessClock,
};
