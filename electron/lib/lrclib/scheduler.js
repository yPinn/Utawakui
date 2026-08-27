'use strict';

const DEFAULT_REQUEST_INTERVAL_MS = 250;

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return Object.assign(new Error('operation aborted'), { name: 'AbortError' });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
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

function createLrclibRequestScheduler(options = {}) {
  const intervalMs = Number.isFinite(options.intervalMs)
    ? Math.max(0, options.intervalMs)
    : DEFAULT_REQUEST_INTERVAL_MS;
  const now = options.now || Date.now;
  const wait = options.wait || defaultWait;
  let tail = Promise.resolve();
  let lastStartedAt = null;
  let blockedUntil = 0;

  function deferFor(delayMs) {
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    blockedUntil = Math.max(blockedUntil, now() + delayMs);
  }

  function schedule(operation, scheduleOptions = {}) {
    const signal = scheduleOptions.signal;
    const scheduled = tail
      .catch(() => undefined)
      .then(async () => {
        throwIfAborted(signal);
        const currentTime = now();
        const nextIntervalStart =
          lastStartedAt === null ? currentTime : lastStartedAt + intervalMs;
        const nextStart = Math.max(
          currentTime,
          nextIntervalStart,
          blockedUntil,
        );
        if (nextStart > currentTime) {
          if (signal) await wait(nextStart - currentTime, signal);
          else await wait(nextStart - currentTime);
        }
        throwIfAborted(signal);
        lastStartedAt = now();
        return operation();
      });
    tail = scheduled;
    return scheduled;
  }

  return { deferFor, schedule };
}

const sharedLrclibRequestScheduler = createLrclibRequestScheduler();

module.exports = {
  DEFAULT_REQUEST_INTERVAL_MS,
  createLrclibRequestScheduler,
  sharedLrclibRequestScheduler,
};
