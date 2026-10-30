export const MICROPHONE_ACTIVITY_DEFAULTS = Object.freeze({
  mode: 'calibration',
  openThreshold: -55,
  closeThreshold: -61,
  attackMs: 25,
  holdMs: 200,
  releaseMs: 150,
});
const bound = (value, fallback, min, max) =>
  Number.isFinite(value)
    ? Math.round(Math.max(min, Math.min(max, value)))
    : fallback;
export function normalizeMicrophoneActivityOptions(input = {}) {
  const defaults = MICROPHONE_ACTIVITY_DEFAULTS;
  const options = {
    mode: input.mode === 'manual' ? 'manual' : 'calibration',
    openThreshold: bound(input.openThreshold, defaults.openThreshold, -90, -10),
    closeThreshold: bound(
      input.closeThreshold,
      defaults.closeThreshold,
      -90,
      -10,
    ),
    attackMs: bound(input.attackMs, defaults.attackMs, 0, 500),
    holdMs: bound(input.holdMs, defaults.holdMs, 0, 2000),
    releaseMs: bound(input.releaseMs, defaults.releaseMs, 0, 2000),
  };
  return options.openThreshold > options.closeThreshold ? options : null;
}

// Numeric activity projection only. This never gates PCM or identifies speech.
export function createMicrophoneActivity() {
  let lastAt = null;
  let openAt = null;
  let belowAt = null;
  let releaseAt = null;
  let latched = false;
  const value = (phase, intensity = 0) => ({
    phase,
    active: intensity > 0,
    intensity,
  });
  function reset(phase = 'armed') {
    lastAt = openAt = belowAt = releaseAt = null;
    latched = false;
    return value(phase);
  }
  function observe(dbfs, at, options, enabled = true) {
    if (!enabled) return reset('uncalibrated');
    if (!Number.isFinite(dbfs) || !Number.isFinite(at)) return reset();
    if (lastAt !== null && at <= lastAt) return reset();
    if (lastAt !== null && at - lastAt > 500) reset();
    lastAt = at;
    if (latched) {
      if (dbfs > options.closeThreshold) {
        belowAt = null;
        return value('active', 1);
      }
      belowAt ??= at;
      if (at - belowAt < options.holdMs) return value('holding', 1);
      latched = false;
      releaseAt = belowAt + options.holdMs;
      openAt = null;
    }
    if (dbfs > options.openThreshold) {
      openAt ??= at;
      if (at - openAt >= options.attackMs) {
        latched = true;
        belowAt = releaseAt = null;
        return value('active', 1);
      }
    } else openAt = null;
    const intensity =
      releaseAt !== null && options.releaseMs > 0
        ? Math.max(0, 1 - (at - releaseAt) / options.releaseMs)
        : 0;
    if (intensity > 0) return value('releasing', intensity);
    releaseAt = null;
    return value(openAt === null ? 'armed' : 'confirming');
  }
  return { observe, reset };
}
