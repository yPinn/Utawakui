'use strict';
const { fork, spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { LIMITS } = require('../../../shared/waveform/policy.mjs');
const { resolveRuntimeEntry } = require('../runtimeEntries');
const path = require('node:path');

function createStreamingProducer(
  request,
  {
    onFirstPcm = () => {},
    onProducer = () => {},
    deadlineMs = LIMITS.deadlineMs,
    forkImpl = fork,
    workerPath = resolveRuntimeEntry(
      path.resolve(__dirname, '../../..'),
      'waveformWorker',
    ),
  } = {},
) {
  const started = performance.now();
  const worker = forkImpl(workerPath, [], {
    serialization: 'advanced',
    silent: true,
    windowsHide: true,
    execArgv: [],
    env: Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) =>
          /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key),
        )
        .concat([['ELECTRON_RUN_AS_NODE', '1']]),
    ),
  });
  let producerPid = null,
    terminal = null,
    cancelAt = null,
    deadline = false,
    exited = false,
    fallback;
  let stderrBytes = 0;
  let diagnostic = '';
  const result = Promise.withResolvers(),
    closed = Promise.withResolvers();
  closed.promise.catch(() => {});
  worker.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (diagnostic.length < 4096)
      diagnostic += chunk.toString('utf8').slice(0, 4096 - diagnostic.length);
    if (stderrBytes > 4096) void cancel();
  });
  worker.stdout.resume();
  function killOwnedTree() {
    if (exited) return;
    if (process.platform === 'win32') {
      // Only the PID returned by this exact fork, never an image-wide kill.
      const killer = spawn(
        'taskkill',
        ['/PID', String(worker.pid), '/T', '/F'],
        { shell: false, windowsHide: true, stdio: 'ignore' },
      );
      killer.on('error', () => worker.kill('SIGKILL'));
    } else {
      if (producerPid)
        try {
          process.kill(producerPid, 'SIGKILL');
        } catch {
          /* This owned producer has already exited. */
        }
      worker.kill('SIGKILL');
    }
  }
  async function cancel() {
    if (exited) {
      await closed.promise;
      return;
    }
    if (cancelAt === null) {
      cancelAt = performance.now();
      if (worker.connected) worker.send({ type: 'cancel' }, () => {});
      fallback = setTimeout(killOwnedTree, 500);
    }
    await closed.promise;
  }
  const timer = setTimeout(() => {
    deadline = true;
    void cancel();
  }, deadlineMs);
  worker.on('message', (message) => {
    if (message?.type === 'producer') {
      producerPid = message.pid;
      onProducer(producerPid);
    }
    if (message?.type === 'first-pcm') onFirstPcm();
    if (['done', 'failed'].includes(message?.type)) terminal = message;
    if (typeof message?.diagnostic === 'string')
      diagnostic += message.diagnostic.slice(
        0,
        Math.max(0, 4096 - diagnostic.length),
      );
  });
  worker.once('error', (error) => {
    diagnostic += String(error.stack ?? error).slice(
      0,
      Math.max(0, 4096 - diagnostic.length),
    );
    terminal = { type: 'failed', code: 'WORKER_FAILED' };
  });
  worker.once('close', async () => {
    exited = true;
    clearTimeout(timer);
    clearTimeout(fallback);
    if (producerPid && !terminal?.metrics?.producerClosed) {
      try {
        process.kill(producerPid, 'SIGKILL');
      } catch {
        /* The owned decoder may already have exited. */
      }
      const until = performance.now() + 500;
      while (performance.now() < until) {
        try {
          process.kill(producerPid, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    let producerClosed = true;
    if (producerPid)
      try {
        process.kill(producerPid, 0);
        producerClosed = false;
      } catch {
        /* OS confirms producer exit. */
      }
    if (producerClosed) closed.resolve();
    else closed.reject(Error('CLEANUP_FAILED'));
    const metrics = {
      ...terminal?.metrics,
      totalMs: performance.now() - started,
      cancelToExitMs: cancelAt === null ? null : performance.now() - cancelAt,
      workerClosed: true,
      producerClosed,
      producerPid,
    };
    if (cancelAt !== null || terminal?.type !== 'done' || !producerClosed) {
      result.reject(
        Object.assign(
          Error(
            deadline
              ? 'DEADLINE'
              : cancelAt !== null
                ? 'CANCELLED'
                : !producerClosed
                  ? 'CLEANUP_FAILED'
                  : (terminal?.code ?? 'WORKER_FAILED'),
          ),
          { metrics, privateDiagnostic: diagnostic },
        ),
      );
    } else result.resolve({ ...terminal.summary, metrics });
  });
  worker.send({ type: 'start', request }, () => {});
  return {
    result: result.promise,
    cancel,
    pid: worker.pid,
    diagnostic: () => diagnostic,
  };
}
module.exports = { createStreamingProducer };
