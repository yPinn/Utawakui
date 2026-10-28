/* global URL, process, setTimeout, clearTimeout */
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { LIMITS } from './policy.mjs';

export function createStreamingProducer(
  request,
  {
    onFirstPcm = () => {},
    onProducer = () => {},
    deadlineMs = LIMITS.deadlineMs,
    forkImpl = fork,
  } = {},
) {
  const started = performance.now();
  const worker = forkImpl(
    fileURLToPath(new URL('./decode-worker.cjs', import.meta.url)),
    [],
    { serialization: 'advanced', silent: true, windowsHide: true },
  );
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
      if (worker.connected) worker.send({ type: 'cancel' });
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
  });
  worker.once('error', () => {
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
    closed.resolve();
    const metrics = {
      ...terminal?.metrics,
      totalMs: performance.now() - started,
      cancelToExitMs: cancelAt === null ? null : performance.now() - cancelAt,
      workerClosed: true,
      producerClosed,
      producerPid,
    };
    if (cancelAt !== null || terminal?.type !== 'done') {
      result.reject(
        Object.assign(
          Error(
            deadline
              ? 'DEADLINE'
              : cancelAt !== null
                ? 'CANCELLED'
                : (terminal?.code ?? 'WORKER_FAILED'),
          ),
          { metrics },
        ),
      );
    } else result.resolve({ ...terminal.summary, metrics });
  });
  worker.send({ type: 'start', request });
  return {
    result: result.promise,
    cancel,
    pid: worker.pid,
    diagnostic: () => diagnostic,
  };
}
