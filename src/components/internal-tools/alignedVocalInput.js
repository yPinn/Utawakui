import {
  MICROPHONE_ANALYSIS_SAMPLES,
  PITCH_MIN_DBFS,
} from '../../microphone/inputProcessing.js';
import { measureMicrophoneLevel } from '../../microphone/level.js';
import { createMicrophonePitchEstimator } from '../../microphone/pitch.js';

const SAMPLE_RATE = 48_000;
export const ALIGNED_VOCAL_HALF_WINDOW_SECONDS =
  MICROPHONE_ANALYSIS_SAMPLES / (2 * SAMPLE_RATE);
const STEP_SECONDS = 0.033;
const OFFLINE_SAMPLE_RATE = 16_000;
const OFFLINE_STEP_SECONDS = 256 / OFFLINE_SAMPLE_RATE;
export const MAX_ALIGNED_VOCAL_BYTES = 24 * 1024 * 1024;

export function readAlignedVocalWav(buffer) {
  const view = new DataView(buffer);
  const tag = (offset) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (
    view.byteLength < 44 ||
    view.byteLength > MAX_ALIGNED_VOCAL_BYTES ||
    tag(0) !== 'RIFF' ||
    tag(8) !== 'WAVE'
  )
    throw new Error('Invalid WAV container');

  let rate = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const kind = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (size > view.byteLength - start) break;
    if (kind === 'fmt ' && size >= 16) {
      rate = view.getUint32(start + 4, true);
      if (
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        view.getUint16(start + 12, true) !== 2 ||
        view.getUint16(start + 14, true) !== 16 ||
        ![16_000, SAMPLE_RATE].includes(rate)
      )
        break;
    }
    if (kind === 'data' && rate && size >= 2 && size % 2 === 0) {
      const samples = Float32Array.from(
        { length: size / 2 },
        (_, index) => view.getInt16(start + 2 * index, true) / 32768,
      );
      const first = samples.findIndex((value) => value !== 0);
      const last = samples.findLastIndex((value) => value !== 0);
      return {
        range:
          first < 0 ? null : { start: first / rate, end: (last + 1) / rate },
        frames: createAlignedVocalInput(samples, rate),
        offlineSamples: () => prepareOfflineSamples(samples, rate),
      };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('Unsupported WAV format');
}

async function prepareOfflineSamples(samples, rate) {
  if (rate === OFFLINE_SAMPLE_RATE) return samples;
  const context = new OfflineAudioContext(
    1,
    Math.ceil((samples.length * OFFLINE_SAMPLE_RATE) / rate),
    OFFLINE_SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, samples.length, rate);
  source.buffer.copyToChannel(samples, 0);
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}

export function alignedOfflineVocalFrames(pitches, from, to) {
  const start = Math.max(0, Math.ceil(from / OFFLINE_STEP_SECONDS));
  const end = Math.min(
    pitches.length - 1,
    Math.floor(to / OFFLINE_STEP_SECONDS),
  );
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => {
    const index = start + offset;
    return {
      time: index * OFFLINE_STEP_SECONDS,
      hz: pitches[index] || null,
      continuous: offset > 0,
    };
  });
}

export function createAlignedVocalInput(samples, rate = SAMPLE_RATE) {
  const window = new Float32Array(MICROPHONE_ANALYSIS_SAMPLES);
  const estimate = createMicrophonePitchEstimator(SAMPLE_RATE, window.length);
  const pitches = new Map();
  const ratio = rate / SAMPLE_RATE;
  const endFrame = Math.floor(samples.length / rate / STEP_SECONDS);
  function estimateAt(frame) {
    if (pitches.has(frame)) return pitches.get(frame);
    const end = Math.round(frame * STEP_SECONDS * SAMPLE_RATE);
    for (let i = 0; i < window.length; i++) {
      const sample = (end - window.length + i) * ratio;
      const index = Math.floor(sample);
      const left = samples[index] ?? 0;
      const right = samples[index + 1] ?? 0;
      window[i] = left + (right - left) * (sample - index);
    }
    const { dbfs, clipped } = measureMicrophoneLevel(window);
    const hz = dbfs > PITCH_MIN_DBFS && !clipped ? estimate(window) : null;
    const measured = { hz, dbfs };
    pitches.set(frame, measured);
    return measured;
  }
  return (from, to) => {
    const start = Math.max(0, Math.ceil(from / STEP_SECONDS));
    const end = Math.min(endFrame, Math.floor(to / STEP_SECONDS));
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => {
      const frame = start + index;
      return {
        time: frame * STEP_SECONDS,
        ...estimateAt(frame),
        continuous: index > 0,
      };
    });
  };
}
