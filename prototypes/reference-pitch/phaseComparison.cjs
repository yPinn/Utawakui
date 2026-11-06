/* global require, module */
const { isMainThread, parentPort, workerData } = require('node:worker_threads');
const KissFFT = require('kissfft-js');

const RATE = 16_000;
const HOP = 256;
const WINDOW_SIZE = 1024;
const FFT_SIZE = 4096;
const MIN_RUN = 8;
const WINDOW = Float32Array.from(
  { length: WINDOW_SIZE },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW_SIZE - 1)),
);

function roundToEven(value) {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
}

function inversePhaseBands(guide, backing, hz) {
  let matched = 0;
  for (let harmonic = 1; harmonic <= 6; harmonic++) {
    const bin = roundToEven((hz * harmonic * FFT_SIZE) / RATE);
    let guidePower = 0;
    let backingPower = 0;
    let dot = 0;
    for (let i = 2 * (bin - 2); i <= 2 * (bin + 2) + 1; i++) {
      guidePower += guide[i] ** 2;
      backingPower += backing[i] ** 2;
      dot += guide[i] * backing[i];
    }
    const ratio = 10 * Math.log10((guidePower + 1e-8) / (backingPower + 1e-8));
    const cosine = dot / Math.sqrt((guidePower + 1e-8) * (backingPower + 1e-8));
    if (ratio <= -6 && cosine <= -0.95) matched++;
  }
  return matched;
}

function comparePhase(pitches, guide, backing) {
  const result = pitches.slice();
  const fft = new KissFFT.FFTR(FFT_SIZE);
  const frame = new Float32Array(FFT_SIZE);
  const guideBins = new Float32Array(FFT_SIZE + 2);
  function spectrum(samples, index) {
    const start = index * HOP - WINDOW_SIZE / 2;
    for (let i = 0; i < WINDOW_SIZE; i++)
      frame[i] = (samples[start + i] ?? 0) * WINDOW[i];
    return fft.forward(frame);
  }
  let start = 0;
  try {
    for (let index = 0; index <= pitches.length; index++) {
      const hz = pitches[index];
      if (hz > 0) {
        guideBins.set(spectrum(guide, index));
        if (inversePhaseBands(guideBins, spectrum(backing, index), hz) >= 5)
          continue;
      }
      if (index - start >= MIN_RUN) result.fill(0, start, index);
      start = index + 1;
    }
    return result;
  } finally {
    fft.dispose();
  }
}

if (!isMainThread && require.main === module) {
  const { pcm, pitches } = workerData;
  const bytes = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const guide = new Float32Array(pcm.length / 4);
  const backing = new Float32Array(guide.length);
  for (let index = 0; index < guide.length; index++) {
    guide[index] = bytes.getInt16(index * 4, true) / 32768;
    backing[index] = bytes.getInt16(index * 4 + 2, true) / 32768;
  }
  const result = comparePhase(pitches, guide, backing);
  parentPort.postMessage(result, [result.buffer]);
  parentPort.close();
}

module.exports = { comparePhase };
