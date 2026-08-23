'use strict';

const DEFAULT_REQUEST_INTERVAL_MS = 250;

function defaultWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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

  function schedule(operation) {
    const scheduled = tail
      .catch(() => undefined)
      .then(async () => {
        const currentTime = now();
        const nextIntervalStart =
          lastStartedAt === null ? currentTime : lastStartedAt + intervalMs;
        const nextStart = Math.max(
          currentTime,
          nextIntervalStart,
          blockedUntil,
        );
        if (nextStart > currentTime) await wait(nextStart - currentTime);
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
