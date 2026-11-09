/* global require, module */
const { isMainThread, parentPort, workerData } = require('node:worker_threads');
const { rejectBacking } = require('./backingRejection.cjs');

const HOP = 256;
const WINDOW_RADIUS = 512;
const MIN_ANCHOR_FRAMES = 4;
// SwiftF0 uses 16 ms frames. Round the 250 ms lead-in down to whole frames.
const LEAD_FRAMES = 15;
const TAIL_FRAMES = 25;

function guideDominates(guide, backing, center) {
  const end = Math.min(guide.length, center + WINDOW_RADIUS);
  let guidePower = 0;
  let backingPower = 0;
  for (let i = Math.max(0, center - WINDOW_RADIUS); i < end; i++) {
    guidePower += guide[i] ** 2;
    backingPower += backing[i] ** 2;
  }
  return guidePower > backingPower;
}

function maskGuideActivity(pitches, guide, backing) {
  const masked = rejectBacking(pitches, guide, backing);
  let start = 0;
  for (let end = 0; end <= pitches.length; end++) {
    if (pitches[end] > 0 && guideDominates(guide, backing, end * HOP)) continue;
    if (end - start >= MIN_ANCHOR_FRAMES) {
      // Restore nearby baseline frames, including weak tails after a pause.
      const from = Math.max(0, start - LEAD_FRAMES);
      const to = Math.min(pitches.length, end + TAIL_FRAMES);
      masked.set(pitches.subarray(from, to), from);
    }
    start = end + 1;
  }
  return masked;
}

if (!isMainThread && require.main === module) {
  const { pcm, pitches } = workerData;
  const bytes = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const guide = new Float32Array(pcm.length / 4);
  const backing = new Float32Array(guide.length);
  for (let i = 0; i < guide.length; i++) {
    guide[i] = bytes.getInt16(i * 4, true) / 32768;
    backing[i] = bytes.getInt16(i * 4 + 2, true) / 32768;
  }
  const result = maskGuideActivity(pitches, guide, backing);
  parentPort.postMessage(result, [result.buffer]);
  parentPort.close();
}

module.exports = { maskGuideActivity };
