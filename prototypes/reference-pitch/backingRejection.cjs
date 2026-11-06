/* global require, module */
const KissFFT = require('kissfft-js');

const SAMPLE_RATE = 16_000;
const MODEL_HOP = 256;
const ANALYSIS_HOP = 160;
const WINDOW_SIZE = 1024;
const FFT_SIZE = 4096;
const MINIMUM_RUN = 12;

function harmonicPower(fft, frame, samples, center, bins, window) {
  const start = center - WINDOW_SIZE / 2;
  for (let index = 0; index < WINDOW_SIZE; index++) {
    frame[index] = (samples[start + index] ?? 0) * window[index];
  }
  const spectrum = fft.forward(frame);
  let power = 0;
  for (const bin of bins) {
    for (let offset = bin - 2; offset <= bin + 2; offset++) {
      const real = spectrum[2 * offset];
      const imag = spectrum[2 * offset + 1];
      power += real * real + imag * imag;
    }
  }
  return power;
}

function sustainedRuns(eligible) {
  const sustained = new Uint8Array(eligible.length);
  let start = 0;
  for (let end = 0; end <= eligible.length; end++) {
    if (eligible[end]) continue;
    if (end - start >= MINIMUM_RUN) sustained.fill(1, start, end);
    start = end + 1;
  }
  return sustained;
}

function nearestModelFrame(center, last) {
  const position = center / SAMPLE_RATE / (MODEL_HOP / SAMPLE_RATE);
  const lower = Math.floor(position);
  // The frozen benchmark uses nearest, with exact halfway cases rounded to even.
  const nearest =
    position - lower === 0.5 ? lower + (lower % 2) : Math.round(position);
  return Math.min(nearest, last);
}

function rejectBacking(nativePitches, guide, backing) {
  if (guide.length < WINDOW_SIZE) return nativePitches;
  const fft = new KissFFT.FFTR(FFT_SIZE);
  try {
    const frame = new Float32Array(FFT_SIZE);
    const window = Float32Array.from(
      { length: WINDOW_SIZE },
      (_, index) =>
        0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (WINDOW_SIZE - 1)),
    );
    const count = 1 + Math.floor((guide.length - WINDOW_SIZE) / ANALYSIS_HOP);
    const eligible = new Uint8Array(count);
    const last = nativePitches.length - 1;
    for (let index = 0; index < count; index++) {
      const center = WINDOW_SIZE / 2 + index * ANALYSIS_HOP;
      const nearest = nearestModelFrame(center, last);
      const hz = nativePitches[nearest];
      if (!hz) continue;
      const bins = [1, 2, 3, 4].map((harmonic) =>
        Math.round((hz * harmonic * FFT_SIZE) / SAMPLE_RATE),
      );
      const guidePower = harmonicPower(fft, frame, guide, center, bins, window);
      const backingPower = harmonicPower(
        fft,
        frame,
        backing,
        center,
        bins,
        window,
      );
      eligible[index] = guidePower < backingPower;
    }
    const sustained = sustainedRuns(eligible);
    const observed = new Uint8Array(nativePitches.length);
    const preserve = new Uint8Array(nativePitches.length);
    for (let index = 0; index < count; index++) {
      const center = WINDOW_SIZE / 2 + index * ANALYSIS_HOP;
      const nearest = nearestModelFrame(center, last);
      observed[nearest] = 1;
      if (!sustained[index]) {
        preserve[nearest] = 1;
        // Protect both neighbours at halfway points on the player time grid.
        if (center % MODEL_HOP === MODEL_HOP / 2) {
          const lower = Math.floor(center / MODEL_HOP);
          preserve[Math.min(lower, last)] = 1;
          preserve[Math.min(lower + 1, last)] = 1;
        }
      }
    }
    const pitches = nativePitches.slice();
    for (let index = 0; index < pitches.length; index++) {
      if (observed[index] && !preserve[index]) pitches[index] = 0;
    }
    return pitches;
  } finally {
    fft.dispose();
  }
}

module.exports = { rejectBacking };
