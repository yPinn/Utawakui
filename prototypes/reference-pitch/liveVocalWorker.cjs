/* global require */
const { parentPort, workerData } = require('node:worker_threads');
const ort = require('onnxruntime-node');

const HOP = 256;
const CHUNK = 1875;

async function estimate({ samples, model }) {
  if (
    samples.some((sample) => !Number.isFinite(sample) || Math.abs(sample) > 2)
  )
    throw new Error('Invalid vocal samples');
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 1,
  });
  const pitches = new Float32Array(Math.floor(samples.length / HOP));
  const fmin = new ort.Tensor('float32', Float32Array.of(65), []);
  const fmax = new ort.Tensor('float32', Float32Array.of(900), []);
  try {
    for (let start = 0; start < pitches.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, pitches.length);
      const left = Math.max(0, start - 11);
      const audio = samples.subarray(
        left * HOP,
        end === pitches.length ? samples.length : (end + 10) * HOP,
      );
      const { pitch, confidence } = await session.run({
        audio: new ort.Tensor('float32', audio, [1, audio.length]),
        fmin,
        fmax,
      });
      for (let index = start; index < end; index++) {
        const hz = pitch.data[index - left];
        const offset = index * HOP;
        if (
          confidence.data[index - left] >= 0.8 &&
          Number.isFinite(hz) &&
          hz > 0 &&
          samples
            .subarray(offset, offset + HOP)
            .some((sample) => Math.abs(sample) >= 0.001)
        )
          pitches[index] = hz;
      }
    }
    return pitches;
  } finally {
    await session.release();
  }
}

estimate(workerData)
  .then((pitches) => {
    parentPort.postMessage(pitches, [pitches.buffer]);
    parentPort.close();
  })
  .catch((error) => {
    throw error;
  });
