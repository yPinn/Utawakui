const MIN_HZ = 65;
const MAX_HZ = 1050;
const MAX_NORMALIZED_DIFFERENCE = 0.15;

export function createMicrophonePitchEstimator(sampleRate, sampleCount) {
  const lastLag = Math.min(
    Math.ceil(sampleRate / MIN_HZ),
    Math.floor(sampleCount / 2) - 2,
  );
  const difference = new Float64Array(Math.max(0, lastLag + 2));
  const windowLength = sampleCount - lastLag - 1;

  return (samples) => {
    if (lastLag < 2) return null;
    let sum = 0;
    // YIN's cumulative mean uses the shorter lags too. Compare each lag
    // against the same part of the latest analyser window.
    for (let lag = 1; lag <= lastLag + 1; lag++) {
      let squared = 0;
      for (let i = 0; i < windowLength; i += 2) {
        const delta = samples[i] - samples[i + lag];
        squared += delta * delta;
      }
      sum += squared;
      difference[lag] = sum > 0 ? (squared * lag) / sum : 1;
      const candidate = lag - 1;
      if (
        candidate < 2 ||
        difference[candidate] >= MAX_NORMALIZED_DIFFERENCE ||
        difference[candidate] > difference[candidate - 1] ||
        difference[candidate] >= difference[lag]
      )
        continue;

      const left = difference[candidate - 1];
      const center = difference[candidate];
      const right = difference[lag];
      const offset = (left - right) / (2 * (left - 2 * center + right));
      const hz = sampleRate / (candidate + offset);
      return hz >= MIN_HZ && hz <= MAX_HZ ? hz : null;
    }
    return null;
  };
}
