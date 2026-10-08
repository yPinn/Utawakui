'use strict';

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return Object.assign(new Error('operation aborted'), { name: 'AbortError' });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

class QueueFullError extends Error {
  constructor() {
    super('provider request queue is full');
    this.name = 'QueueFullError';
  }
}

function defaultWait(delayMs, signal) {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createProviderRequestScheduler(options = {}) {
  const intervalMs = Number.isFinite(options.intervalMs)
    ? Math.max(0, options.intervalMs)
    : 0;
  const now = options.now || Date.now;
  const wait = options.wait || defaultWait;
  const maxPending = Number.isSafeInteger(options.maxPending)
    ? Math.max(1, options.maxPending)
    : Number.POSITIVE_INFINITY;
  let lastStartedAt = null;
  let blockedUntil = 0;
  let activeEntry = null;
  let pumping = false;
  const queue = [];

  function deferFor(delayMs) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    blockedUntil = Math.max(blockedUntil, now() + delayMs);
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        const entry = queue.shift();
        entry.started = true;
        activeEntry = entry;
        try {
          throwIfAborted(entry.signal);
          const currentTime = now();
          const nextIntervalStart =
            lastStartedAt === null ? currentTime : lastStartedAt + intervalMs;
          const nextStart = Math.max(
            currentTime,
            nextIntervalStart,
            blockedUntil,
          );
          if (nextStart > currentTime) {
            if (entry.signal) {
              await wait(nextStart - currentTime, entry.signal);
            } else {
              await wait(nextStart - currentTime);
            }
          }
          throwIfAborted(entry.signal);
          lastStartedAt = now();
          const result = await entry.operation();
          throwIfAborted(entry.signal);
          entry.resolve(result);
        } catch (error) {
          entry.reject(error);
        } finally {
          entry.signal?.removeEventListener('abort', entry.onAbort);
          activeEntry = null;
        }
      }
    } finally {
      pumping = false;
      if (queue.length > 0) void pump();
    }
  }

  function schedule(operation, scheduleOptions = {}) {
    const signal = scheduleOptions.signal;
    try {
      throwIfAborted(signal);
    } catch (error) {
      return Promise.reject(error);
    }
    if ((activeEntry ? 1 : 0) + queue.length >= maxPending) {
      return Promise.reject(new QueueFullError());
    }

    let resolveEntry;
    let rejectEntry;
    const scheduled = new Promise((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const entry = {
      operation,
      signal,
      resolve: resolveEntry,
      reject: rejectEntry,
      started: false,
      onAbort: null,
    };
    entry.onAbort = () => {
      if (entry.started) return;
      const index = queue.indexOf(entry);
      if (index < 0) return;
      queue.splice(index, 1);
      signal.removeEventListener('abort', entry.onAbort);
      entry.reject(abortReason(signal));
    };
    signal?.addEventListener('abort', entry.onAbort, { once: true });
    queue.push(entry);
    queueMicrotask(() => void pump());
    return scheduled;
  }

  return { deferFor, schedule };
}

module.exports = {
  QueueFullError,
  createProviderRequestScheduler,
};
