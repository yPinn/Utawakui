'use strict';

const { Worker } = require('worker_threads');
const {
  isSeparationBackend,
} = require('../../../../shared/separationQueueContract.mjs');

function createOnnxMdxJob({
  WorkerCtor = Worker,
  workerPath,
  workerData,
  emitProgress,
}) {
  const worker = new WorkerCtor(workerPath, { workerData });
  let settled = false;
  let cancellation;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function settle(callback, value) {
    if (settled) return;
    settled = true;
    callback(value);
  }

  worker.on('message', (message) => {
    if (settled || cancellation) return;
    if (message?.type === 'progress') {
      emitProgress?.({
        stage: message.stage,
        ...(isSeparationBackend(message.backend)
          ? { backend: message.backend }
          : {}),
        ...(Number.isFinite(message.percent)
          ? { percent: message.percent }
          : {}),
      });
      return;
    }
    if (message?.type === 'done') {
      settle(resolveResult, message.result);
      return;
    }
    const errorMessage =
      typeof message?.error === 'string'
        ? message.error
        : 'separation worker returned an invalid message';
    settle(rejectResult, new Error(errorMessage));
  });
  worker.on('error', (error) => {
    if (!cancellation) settle(rejectResult, error);
  });
  function settleCancelled() {
    settle(rejectResult, new Error('audio-processing job cancelled'));
  }
  worker.on('exit', (code) => {
    if (cancellation) {
      settleCancelled();
      return;
    }
    const message =
      code === 0
        ? 'separation worker exited without a result'
        : `separation worker exited with code ${code}`;
    settle(rejectResult, new Error(message));
  });

  function cancel() {
    if (cancellation) return cancellation;
    if (settled) return false;
    // The scheduler releases its slot when result settles. Hold it until exit.
    cancellation = Promise.resolve()
      .then(() => worker.terminate())
      .then(settleCancelled);
    return cancellation;
  }

  return { result, cancel };
}

module.exports = { createOnnxMdxJob };
