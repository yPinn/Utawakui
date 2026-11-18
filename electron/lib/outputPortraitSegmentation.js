'use strict';

const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { maskEdge } = require('../../shared/outputPortraitImage.json');

const portraitModel = Object.freeze({
  relativePath: 'output-portrait/u2netp.onnx',
  expectedSize: 4_574_861,
  sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
});

async function readPortraitWeights(filename) {
  const bytes = await fs.readFile(filename);
  if (
    bytes.length !== portraitModel.expectedSize ||
    createHash('sha256').update(bytes).digest('hex') !== portraitModel.sha256
  ) {
    throw new Error('Bundled portrait model integrity check failed');
  }
  return bytes;
}

function runPortraitWorker(workerPath, rgba, weights, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { rgba, weights } });
    const cancel = () => {
      void worker.terminate().catch(reject);
    };
    const timeout = setTimeout(cancel, 30_000);
    let result;
    worker.once('message', (message) => {
      result = message;
    });
    worker.once('error', reject);
    worker.once('exit', () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) resolve({ status: 'cancelled' });
      else if (result?.status === 'no-subject') resolve(result);
      else if (
        result?.alpha instanceof Uint8Array &&
        result.alpha.length === maskEdge ** 2
      )
        resolve({ status: 'ok', alpha: result.alpha });
      else
        reject(new Error('Portrait worker exited without a valid alpha mask'));
    });
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function createOutputPortraitSegmentation({
  resourcesRoot,
  workerPath,
  logger,
}) {
  const filename = path.join(resourcesRoot, portraitModel.relativePath);
  let processing = false;

  return async (rgba, signal) => {
    if (signal.aborted) return { status: 'cancelled' };
    if (processing) return { status: 'busy' };
    processing = true;
    try {
      let weights;
      try {
        weights = await readPortraitWeights(filename);
      } catch (error) {
        if (signal.aborted) return { status: 'cancelled' };
        logger.error?.(
          '[output] Could not read the bundled portrait model',
          error,
        );
        return { status: 'model-unavailable' };
      }
      if (signal.aborted) return { status: 'cancelled' };
      return await runPortraitWorker(workerPath, rgba, weights, signal);
    } finally {
      processing = false;
    }
  };
}

module.exports = { createOutputPortraitSegmentation, portraitModel };
