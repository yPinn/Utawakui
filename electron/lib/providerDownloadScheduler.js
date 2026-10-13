'use strict';

const DEFAULT_PROVIDER_DOWNLOAD_CONCURRENCY = 2;
const MAX_PROVIDER_DOWNLOAD_CONCURRENCY = 4;

function cancellationError(message = 'provider download cancelled') {
  return Object.assign(new Error(message), {
    code: 'IMPORT_DOWNLOAD_CANCELLED',
    name: 'AbortError',
  });
}

function boundedConcurrency(value) {
  if (!Number.isSafeInteger(value))
    return DEFAULT_PROVIDER_DOWNLOAD_CONCURRENCY;
  return Math.min(Math.max(value, 1), MAX_PROVIDER_DOWNLOAD_CONCURRENCY);
}

function createProviderDownloadScheduler(options = {}) {
  const concurrency = boundedConcurrency(options.concurrency);
  const entries = new Map();
  const pending = [];
  const active = new Set();
  let shutDown = false;

  function finish(entry, settle) {
    if (entry.settled) return;
    entry.settled = true;
    entries.delete(entry.key);
    active.delete(entry);
    settle();
    drain();
  }

  function start(entry) {
    if (entry.settled) return;
    entry.state = 'active';
    active.add(entry);

    let operation;
    try {
      operation = entry.start({ signal: entry.controller.signal });
    } catch (error) {
      finish(entry, () => entry.reject(error));
      return;
    }

    Promise.resolve(operation).then(
      (result) => finish(entry, () => entry.resolve(result)),
      (error) => finish(entry, () => entry.reject(error)),
    );
  }

  function drain() {
    while (!shutDown && active.size < concurrency && pending.length > 0) {
      const entry = pending.shift();
      if (!entry || entry.settled) continue;
      start(entry);
    }
  }

  function schedule(key, startJob) {
    if (shutDown) return Promise.reject(cancellationError('scheduler stopped'));
    if (typeof key !== 'string' || key.length === 0) {
      return Promise.reject(new Error('provider download key is required'));
    }
    if (typeof startJob !== 'function') {
      return Promise.reject(new Error('provider download start is required'));
    }

    const existing = entries.get(key);
    if (existing) return existing.promise;

    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const entry = {
      key,
      start: startJob,
      controller: new AbortController(),
      state: 'pending',
      settled: false,
      promise,
      resolve,
      reject,
    };
    entries.set(key, entry);
    pending.push(entry);
    drain();
    return promise;
  }

  function cancel(key) {
    const entry = entries.get(key);
    if (!entry || entry.settled) return false;

    if (entry.state === 'pending') {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
      finish(entry, () => entry.reject(cancellationError()));
      return true;
    }

    entry.controller.abort();
    return true;
  }

  function cancelAll() {
    const keys = [...entries.keys()];
    for (const key of keys) cancel(key);
    return keys.length;
  }

  function shutdown() {
    shutDown = true;
    cancelAll();
  }

  function snapshot() {
    return { active: active.size, pending: pending.length };
  }

  return { cancel, cancelAll, schedule, shutdown, snapshot };
}

module.exports = {
  DEFAULT_PROVIDER_DOWNLOAD_CONCURRENCY,
  cancellationError,
  createProviderDownloadScheduler,
};
