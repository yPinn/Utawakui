'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { InferenceSession, Tensor } = require('onnxruntime-node');
const { maskEdge } = require('../../shared/outputPortraitImage.json');

const pixelCount = maskEdge ** 2;
const mean = [0.485, 0.456, 0.406];
const deviation = [0.229, 0.224, 0.225];

function makeInput(rgba) {
  let brightest = 1;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    brightest = Math.max(
      brightest,
      rgba[offset],
      rgba[offset + 1],
      rgba[offset + 2],
    );
  }
  const input = new Float32Array(pixelCount * 3);
  for (let channel = 0; channel < 3; channel++) {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const normalized = rgba[pixel * 4 + channel] / brightest;
      input[channel * pixelCount + pixel] =
        (normalized - mean[channel]) / deviation[channel];
    }
  }
  return new Tensor('float32', input, [1, 3, maskEdge, maskEdge]);
}

function normalizeMask(data) {
  if (data.length !== pixelCount)
    throw new Error('Unexpected portrait model output size');
  let min = Infinity;
  let max = -Infinity;
  for (const value of data) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min;
  if (!Number.isFinite(range) || range < 0.05) return null;
  const alpha = new Uint8Array(pixelCount);
  let subject = 0;
  let background = 0;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const probability = (data[pixel] - min) / range;
    alpha[pixel] = Math.round(
      Math.max(0, Math.min(1, (probability - 0.02) / 0.96)) * 255,
    );
    if (alpha[pixel] >= 224) subject++;
    if (alpha[pixel] <= 31) background++;
  }
  return Math.min(subject, background) >= pixelCount * 0.005 ? alpha : null;
}

async function segment({ rgba, weights }) {
  const session = await InferenceSession.create(weights, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
    logSeverityLevel: 3,
  });
  try {
    const output = session.outputNames[0];
    const result = await session.run(
      { [session.inputNames[0]]: makeInput(rgba) },
      [output],
    );
    return normalizeMask(result[output].data);
  } finally {
    await session.release();
  }
}

segment(workerData)
  .then((alpha) => {
    if (alpha) parentPort.postMessage({ alpha }, [alpha.buffer]);
    else parentPort.postMessage({ status: 'no-subject' });
  })
  .catch((error) => {
    throw error;
  });
