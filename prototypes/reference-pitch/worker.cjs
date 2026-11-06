/* global require */
const { parentPort, workerData } = require('node:worker_threads');
const ort = require('onnxruntime-node');
const { rescueRangeVeto } = require('./rangeRescue.cjs');

const HOP = 256;
const CHUNK = 1875;

function samplesFrom(pcm, stride = 2, channel = 0) {
  const samples = new Float32Array(pcm.length / stride);
  const bytes = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = bytes.getInt16(index * stride + channel * 2, true) / 32768;
  }
  return samples;
}

async function estimate(session, samples, fmin, fmax) {
  const count = Math.floor(samples.length / HOP);
  const pitches = new Float64Array(count);
  const confidence = new Float32Array(count);
  const range = {
    fmin: new ort.Tensor('float32', Float32Array.of(fmin), []),
    fmax: new ort.Tensor('float32', Float32Array.of(fmax), []),
  };
  for (let start = 0; start < count; start += CHUNK) {
    const end = Math.min(start + CHUNK, count);
    const left = Math.max(0, start - 11);
    const audio = samples.subarray(
      left * HOP,
      end === count ? samples.length : (end + 10) * HOP,
    );
    const result = await session.run({
      audio: new ort.Tensor('float32', audio, [1, audio.length]),
      ...range,
    });
    for (let index = start; index < end; index++) {
      const local = index - left;
      const hz = result.pitch.data[local];
      const certainty = result.confidence.data[local];
      if (!Number.isFinite(hz) || !Number.isFinite(certainty)) {
        throw new Error('Invalid SwiftF0 output');
      }
      pitches[index] = hz;
      confidence[index] = certainty;
    }
  }
  return { pitches, confidence };
}

async function run({ pcm, originalPcm, model, rejectBacking }) {
  const stride = rejectBacking ? 4 : 2;
  const samples = samplesFrom(pcm, stride);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 1,
  });
  try {
    const constrained = await estimate(session, samples, 65, 900);
    const pitches = new Float32Array(constrained.pitches.length);
    const eligible = new Uint8Array(pitches.length);
    for (let index = 0; index < pitches.length; index++) {
      const offset = index * HOP;
      const hasSignal = samples
        .subarray(offset, offset + HOP)
        .some((sample) => Math.abs(sample) >= 0.001);
      if (!hasSignal) continue;
      if (constrained.confidence[index] >= 0.5) {
        pitches[index] = constrained.pitches[index];
      } else if (constrained.confidence[index] === 0) {
        eligible[index] = 1;
      }
    }
    if (rejectBacking) {
      return require('./backingRejection.cjs').rejectBacking(
        pitches,
        samples,
        samplesFrom(pcm, stride, 1),
      );
    }
    if (!originalPcm || !eligible.some(Boolean)) return pitches;
    const wide = await estimate(session, samples, 46.875, 2093.75);
    for (let index = 0; index < eligible.length; index++) {
      eligible[index] &&=
        wide.pitches[index] > 900 && wide.confidence[index] >= 0.9;
    }
    if (!eligible.some(Boolean)) return pitches;
    const original = await estimate(session, samplesFrom(originalPcm), 65, 900);
    return rescueRangeVeto(
      pitches,
      samples,
      constrained.pitches,
      wide.pitches,
      original.pitches,
      eligible,
    );
  } finally {
    await session.release();
  }
}

run(workerData)
  .then((pitches) => {
    parentPort.postMessage(pitches, [pitches.buffer]);
    parentPort.close();
  })
  .catch((error) => {
    throw error;
  });
