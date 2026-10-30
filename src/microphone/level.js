export const MICROPHONE_LEVEL_DEFAULTS = Object.freeze({
  noiseFloor: -55,
  sensitivity: 1,
  smoothingMs: 150,
});

const bounded = (value, fallback, min, max) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeMicrophoneControls(input = {}) {
  return {
    noiseFloor: bounded(input.noiseFloor, -55, -90, -10),
    sensitivity: bounded(input.sensitivity, 1, 0.25, 4),
    smoothingMs: bounded(input.smoothingMs, 150, 0, 1000),
  };
}

export function measureMicrophoneLevel(samples) {
  let sum = 0;
  let peak = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return { dbfs: -100, peak: 0, clipped: false };
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  return {
    dbfs: Math.max(-100, Math.min(0, rms ? 20 * Math.log10(rms) : -100)),
    peak: Math.min(1, peak),
    clipped: peak >= 0.999,
  };
}

export function projectMicrophoneLevel(dbfs, previous, elapsedMs, input = {}) {
  const controls = normalizeMicrophoneControls(input);
  if (!Number.isFinite(dbfs) || dbfs <= controls.noiseFloor) return 0;
  const target = Math.min(
    1,
    Math.max(
      0,
      ((dbfs - controls.noiseFloor) / -controls.noiseFloor) *
        controls.sensitivity,
    ),
  );
  const alpha =
    controls.smoothingMs === 0
      ? 1
      : 1 - Math.exp(-bounded(elapsedMs, 0, 0, 1000) / controls.smoothingMs);
  return (
    bounded(previous, 0, 0, 1) + (target - bounded(previous, 0, 0, 1)) * alpha
  );
}
