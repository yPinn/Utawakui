'use strict';

const { Worker } = require('worker_threads');

function createOnnxMdxJob({
  WorkerCtor = Worker,
  workerPath,
  workerData,
  emitProgress,
}) {
  const worker = new WorkerCtor(workerPath, { workerData });
  let settled = false;
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
    if (message?.type === 'progress') {
      emitProgress?.({
        stage: message.stage,
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
  worker.on('error', (error) => settle(rejectResult, error));
  worker.on('exit', (code) => {
    const message =
      code === 0
        ? 'separation worker exited without a result'
        : `separation worker exited with code ${code}`;
    settle(rejectResult, new Error(message));
  });

  async function cancel() {
    settle(rejectResult, new Error('audio-processing job cancelled'));
    await worker.terminate();
  }

  return { result, cancel };
}

module.exports = { createOnnxMdxJob };
