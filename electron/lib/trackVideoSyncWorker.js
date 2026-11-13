'use strict';

const { setImmediate: yieldToWorker } = require('node:timers/promises');
const { parentPort, workerData } = require('node:worker_threads');
const { FFTR } = require('kissfft-js');
const {
  MAX_OFFSET_MS,
  MAX_ALIGNMENT_SECONDS,
} = require('./library/trackVideo');
const { SAMPLE_RATE } = require('./trackVideoSync');

const MAX_SAMPLES = SAMPLE_RATE * MAX_ALIGNMENT_SECONDS;
const WINDOW = SAMPLE_RATE * 2;
const FFT_SIZE = 65_536;
const MIN_ENERGY = WINDOW * 0.0001 ** 2;
const SEARCH_RADIUS = (MAX_OFFSET_MS * SAMPLE_RATE) / 1000;
const INDEPENDENT_PEAK = Math.round(SAMPLE_RATE * 0.15);
const POSITIONS = [0.03, 0.18, 0.33, 0.48, 0.63, 0.78, 0.93];
const FIXED_RECHECK_WINDOW = SAMPLE_RATE / 2;
const FIXED_MIN_SCORE = 0.8;
const FIXED_MAX_WEAK_RUN = 1.5 * SAMPLE_RATE;
const FIXED_MAX_WEAK_RATIO = 0.05;
const FIXED_REVIEW_MAX_WEAK_RATIO = 0.1;
const BOUNDARY_WINDOW = SAMPLE_RATE / 2;
const BOUNDARY_STEP = SAMPLE_RATE / 4;
const OFFSET_TOLERANCE = SAMPLE_RATE * 0.012;
const AUTO_SEGMENT_COVERAGE = 0.9;
const AUTO_SEGMENT_MAX_GAP = 5 * SAMPLE_RATE;

const toMs = (samples) => Math.round((samples * 1000) / SAMPLE_RATE);

function energy(samples) {
  let sum = 0;
  let squares = 0;
  for (const sample of samples) {
    sum += sample;
    squares += sample * sample;
  }
  return { sum, variance: squares - (sum * sum) / samples.length };
}

async function findAnchor(source, target, start, fft, signal) {
  const clip = source.subarray(start, start + WINDOW);
  const { sum, variance } = energy(clip);
  if (!(variance > MIN_ENERGY)) return null;
  const first = Math.max(0, start - SEARCH_RADIUS);
  const last = Math.min(target.length - WINDOW, start + SEARCH_RADIUS);
  if (last < first) return null;
  const scores = new Float32Array(last - first + 1);
  const input = new Float32Array(FFT_SIZE);
  for (let i = 0; i < WINDOW; i++) input[i] = clip[i] - sum / WINDOW;
  const spectrum = fft.forward(input).slice();
  let best = 0;

  for (let at = first; at <= last; at += FFT_SIZE - WINDOW + 1) {
    await yieldToWorker(undefined, { signal });
    const count = Math.min(FFT_SIZE - WINDOW + 1, last - at + 1);
    input.fill(0);
    input.set(target.subarray(at, at + count + WINDOW - 1));
    const product = fft.forward(input);
    for (let i = 0; i < product.length; i += 2) {
      const real = product[i];
      const imaginary = product[i + 1];
      product[i] = real * spectrum[i] + imaginary * spectrum[i + 1];
      product[i + 1] = imaginary * spectrum[i] - real * spectrum[i + 1];
    }
    const correlation = fft.inverse(product);
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < WINDOW; i++) {
      sum += input[i];
      squares += input[i] * input[i];
    }
    for (let i = 0; i < count; i++) {
      const index = at - first + i;
      const varianceAt = squares - (sum * sum) / WINDOW;
      if (varianceAt > MIN_ENERGY) {
        scores[index] =
          Math.abs(correlation[i]) /
          (FFT_SIZE * Math.sqrt(variance * varianceAt));
        if (scores[index] > scores[best]) best = index;
      }
      if (i === count - 1) break;
      const outgoing = input[i];
      const incoming = input[i + WINDOW];
      sum += incoming - outgoing;
      squares += incoming * incoming - outgoing * outgoing;
    }
  }

  const score = scores[best];
  if (score < 0.86) return null;
  // A strong match to two different occurrences is ambiguous.
  for (let i = 0; i < scores.length; i++) {
    if (Math.abs(i - best) > INDEPENDENT_PEAK && scores[i] > score - 0.08)
      return null;
  }
  return first + best - start;
}

function windowScore(source, target, start, offset, length) {
  const clip = source.subarray(start, start + length);
  const { sum, variance } = energy(clip);
  if (variance <= MIN_ENERGY) return null;
  const at = start + offset;
  if (at < 0 || at + length > target.length) return 0;
  const other = target.subarray(at, at + length);
  const reference = energy(other);
  if (reference.variance <= MIN_ENERGY) return 0;
  let dot = 0;
  for (let i = 0; i < length; i++) dot += clip[i] * other[i];
  const covariance = dot - (sum * reference.sum) / length;
  return Math.abs(covariance) / Math.sqrt(variance * reference.variance);
}

async function verifyFixedOffset(source, target, offset, signal) {
  let checked = 0;
  let weak = 0;
  let weakRun = 0;
  let longestWeakRun = 0;
  let longestWeakEnd = 0;
  for (let start = 0; start < source.length; start += WINDOW) {
    await yieldToWorker(undefined, { signal });
    const end = Math.min(start + WINDOW, source.length);
    const score = windowScore(source, target, start, offset, end - start);
    if (score === null || score >= FIXED_MIN_SCORE) {
      if (score !== null) checked += end - start;
      weakRun = 0;
      continue;
    }

    // A short overlap with effects can obscure a full window at the right offset.
    for (let at = start; at < end; at += FIXED_RECHECK_WINDOW) {
      const length = Math.min(FIXED_RECHECK_WINDOW, end - at);
      const localScore = windowScore(source, target, at, offset, length);
      if (localScore !== null) checked += length;
      if (localScore === null || localScore >= FIXED_MIN_SCORE) {
        weakRun = 0;
      } else {
        weak += length;
        weakRun += length;
        if (weakRun > longestWeakRun) {
          longestWeakRun = weakRun;
          longestWeakEnd = at + length;
        }
      }
    }
  }
  if (checked === 0 || weak > checked * FIXED_REVIEW_MAX_WEAK_RATIO)
    return null;
  if (
    weak <= checked * FIXED_MAX_WEAK_RATIO &&
    longestWeakRun <= FIXED_MAX_WEAK_RUN
  )
    return { autoApply: true };
  return {
    autoApply: false,
    reviewRange: {
      startMs: toMs(longestWeakEnd - longestWeakRun),
      endMs: toMs(longestWeakEnd),
    },
  };
}

async function estimateFixedOffset(source, target, signal) {
  if (
    !source ||
    !target ||
    source.length < SAMPLE_RATE * 6 ||
    target.length < WINDOW ||
    source.length > MAX_SAMPLES ||
    target.length > MAX_SAMPLES
  )
    return null;
  const offsets = [];
  let first;
  let last;
  const fft = new FFTR(FFT_SIZE);
  try {
    for (const position of POSITIONS) {
      const start = Math.round((source.length - WINDOW) * position);
      const offset = await findAnchor(source, target, start, fft, signal);
      if (offset === null) continue;
      first ??= position;
      last = position;
      offsets.push(offset);
    }
  } finally {
    fft.dispose();
  }
  if (offsets.length < 3 || first > 0.33 || last < 0.63 || last - first < 0.5)
    return null;
  offsets.sort((a, b) => a - b);
  if (offsets.at(-1) - offsets[0] > OFFSET_TOLERANCE) return null;
  const offset = offsets[Math.floor(offsets.length / 2)];
  const verification = await verifyFixedOffset(source, target, offset, signal);
  return (
    verification && { offsetMs: toMs(offset), segments: null, ...verification }
  );
}

function supportedBounds(source, target, offset, first, last) {
  const start = Math.max(0, -offset, first);
  const end = Math.min(source.length, target.length - offset, last);
  let streak = 0;
  let matches = 0;
  let earliest;
  let latest;
  const firstCheck = Math.ceil(start / BOUNDARY_STEP) * BOUNDARY_STEP;
  for (let at = firstCheck; at + BOUNDARY_WINDOW <= end; at += BOUNDARY_STEP) {
    if (
      !(
        (windowScore(source, target, at, offset, BOUNDARY_WINDOW) ?? 0) >= 0.66
      ) ||
      !(
        (windowScore(source, target, at, offset, BOUNDARY_STEP) ?? 0) >= 0.58
      ) ||
      !(
        (windowScore(
          source,
          target,
          at + BOUNDARY_STEP,
          offset,
          BOUNDARY_STEP,
        ) ?? 0) >= 0.58
      )
    ) {
      streak = 0;
      continue;
    }
    matches += 1;
    streak += 1;
    if (streak >= 3) {
      earliest ??= at - 2 * BOUNDARY_STEP;
      latest = at + BOUNDARY_WINDOW;
    }
  }
  return earliest === undefined ||
    matches * BOUNDARY_STEP < (latest - earliest) * 0.7
    ? null
    : { start: earliest, end: latest, offset };
}

async function estimateSegments(source, target, signal) {
  if (
    !source ||
    !target ||
    source.length < 12 * SAMPLE_RATE ||
    target.length < WINDOW ||
    source.length > MAX_SAMPLES ||
    target.length > MAX_SAMPLES
  )
    return null;
  const groups = [];
  const fft = new FFTR(FFT_SIZE);
  try {
    for (let i = 0; i < 24; i++) {
      const at = Math.round(((i + 0.5) / 24) * (source.length - WINDOW));
      const offset = await findAnchor(source, target, at, fft, signal);
      if (offset === null) continue;
      let group = groups.find(
        (entry) => Math.abs(entry.offset - offset) <= OFFSET_TOLERANCE,
      );
      if (!group) {
        group = { offset, first: at, last: at, offsets: [] };
        groups.push(group);
      }
      group.last = at;
      group.offsets.push(offset);
    }
  } finally {
    fft.dispose();
  }
  const reliable = groups.filter(
    (group) =>
      group.offsets.length >= 2 &&
      group.last - group.first >= 2 * SAMPLE_RATE &&
      Math.max(...group.offsets) - Math.min(...group.offsets) <=
        OFFSET_TOLERANCE,
  );
  if (reliable.length < 2 || reliable.length > 8) return null;
  const segments = [];
  for (const [i, group] of reliable.entries()) {
    const previous = reliable[i - 1];
    const next = reliable[i + 1];
    if (previous && previous.last >= group.first) return null;
    const sorted = group.offsets.toSorted((a, b) => a - b);
    const offset = sorted[Math.floor(sorted.length / 2)];
    const bounds = supportedBounds(
      source,
      target,
      offset,
      previous?.last ?? 0,
      next?.first ?? source.length,
    );
    if (!bounds || bounds.end - bounds.start < 4 * SAMPLE_RATE) return null;
    const old = segments.at(-1);
    if (old) {
      const gap = bounds.start - old.end;
      if (Math.abs(gap) <= BOUNDARY_STEP && offset >= old.offset) {
        // Adjacent windows can disagree by one scan step at a hard cut.
        const boundary = Math.round((bounds.start + old.end) / 2);
        old.end = boundary;
        bounds.start = boundary;
      }
      if (
        bounds.start < old.end ||
        bounds.start + offset < old.end + old.offset
      )
        return null;
    }
    segments.push(bounds);
  }
  const covered = segments.reduce(
    (sum, { start, end }) => sum + end - start,
    0,
  );
  const coverage = covered / source.length;
  if (coverage < 0.75) return null;
  const autoApply =
    coverage >= AUTO_SEGMENT_COVERAGE &&
    source.length - segments.at(-1).end <= AUTO_SEGMENT_MAX_GAP &&
    segments.every(
      ({ start }, i) =>
        start - (segments[i - 1]?.end ?? 0) <= AUTO_SEGMENT_MAX_GAP,
    );
  return {
    offsetMs: toMs(segments[0].offset),
    segments: segments.map(({ start, end, offset }) => ({
      startMs: toMs(start),
      endMs: toMs(end),
      offsetMs: toMs(offset),
    })),
    autoApply,
  };
}

async function estimateVideoAlignment(source, target, signal) {
  const fixed = await estimateFixedOffset(source, target, signal);
  if (fixed?.autoApply) return fixed;
  return (await estimateSegments(source, target, signal)) ?? fixed;
}

if (parentPort && workerData?.kind === 'track-video-offset') {
  estimateVideoAlignment(workerData.source, workerData.target).then(
    (alignment) => {
      parentPort.postMessage(alignment);
    },
  );
}

module.exports = { estimateVideoAlignment };
