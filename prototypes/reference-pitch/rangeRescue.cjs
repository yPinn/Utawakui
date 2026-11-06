/* global module */
const WINDOW = 1280;
const FIRST_LAG = 20;
const LAST_LAG = 228;

const centsApart = (a, b) =>
  a > 0 && b > 0 ? Math.abs(1200 * Math.log2(a / b)) : Infinity;

function waveformPitch(guide, index) {
  if (guide.length < WINDOW) return 0;
  const last = Math.floor((guide.length - WINDOW) / 160);
  const frame = Math.max(0, Math.min(last, Math.round((index * 16 - 40) / 10)));
  const start = frame * 160;
  const samples = new Float64Array(WINDOW);
  const energy = new Float64Array(WINDOW + 1);
  let mean = 0;
  for (let i = 0; i < WINDOW; i++) {
    const at = start + i;
    samples[i] = at ? guide[at] - 0.95 * guide[at - 1] : 0;
    mean += samples[i] / WINDOW;
  }
  for (let i = 0; i < WINDOW; i++) {
    samples[i] -= mean;
    energy[i + 1] = energy[i] + samples[i] ** 2;
  }
  const correlations = new Float64Array(LAST_LAG + 1);
  let maximum = 0;
  for (let lag = FIRST_LAG; lag <= LAST_LAG; lag++) {
    const count = WINDOW - lag;
    let cross = 0;
    for (let i = 0; i < count; i++) cross += samples[i] * samples[i + lag];
    const norm = Math.sqrt(energy[count] * (energy[WINDOW] - energy[lag]));
    correlations[lag] = cross / Math.max(norm, 1e-12);
    if (lag > FIRST_LAG && lag < LAST_LAG)
      maximum = Math.max(maximum, correlations[lag]);
  }
  const threshold = Math.max(0.68, 0.92 * maximum);
  for (let lag = FIRST_LAG + 1; lag < LAST_LAG; lag++) {
    const left = correlations[lag - 1];
    const mid = correlations[lag];
    const right = correlations[lag + 1];
    if (mid >= threshold && mid > left && mid >= right) {
      const adjustment = (0.5 * (left - right)) / (left - 2 * mid + right);
      return 16000 / (lag + Math.max(-0.5, Math.min(0.5, adjustment)));
    }
  }
  return 0;
}

function rescueRangeVeto(
  pitches,
  guide,
  constrained,
  wide,
  original,
  eligible,
) {
  const result = pitches.slice();
  for (let left = 0; left < pitches.length;) {
    if (pitches[left]) {
      left++;
      continue;
    }
    let right = left + 1;
    while (right < pitches.length && !pitches[right]) right++;
    if (left > 0 && right < pitches.length && right - left <= 18) {
      for (let i = left; i < right; i++) {
        const candidate = constrained[i];
        if (
          eligible[i] &&
          centsApart(wide[i] / 4, candidate) <= 45 &&
          centsApart(original[i], candidate) <= 50 &&
          centsApart(pitches[left - 1], candidate) <= 50 &&
          centsApart(pitches[right], candidate) <= 50 &&
          centsApart(waveformPitch(guide, i), candidate) <= 50
        ) {
          result[i] = candidate;
        }
      }
    }
    left = right;
  }
  return result;
}

module.exports = { rescueRangeVeto };
