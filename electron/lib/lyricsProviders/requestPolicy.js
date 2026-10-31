'use strict';

const { createHash } = require('node:crypto');
const { createLyricsRequestExecutor } = require('./requestExecutor.js');
const {
  createProviderRequestScheduler,
  QueueFullError,
} = require('../providerRequestScheduler.js');

// App policy, not an upstream quota. All production clients on a transport
// share one queue per fixed provider, including saves and retries.
const POLICIES = Object.freeze({
  'itunes-metadata': {
    intervalMs: 3100,
    initial: 2,
    broaden: 2,
    automatic: 1,
    save: 2,
    timeoutMs: 6000,
  },
  kugou: {
    intervalMs: 1000,
    initial: 5,
    broaden: 8,
    automatic: 5,
    save: 3,
    timeoutMs: 25_000,
  },
  lrclib: {
    intervalMs: 1000,
    initial: 2,
    broaden: 4,
    automatic: 2,
    save: 2,
    timeoutMs: 20_000,
  },
  netease: {
    intervalMs: 1000,
    initial: 6,
    broaden: 8,
    automatic: 6,
    save: 1,
    timeoutMs: 25_000,
  },
  betterlyrics: {
    intervalMs: 2000,
    initial: 1,
    broaden: 1,
    automatic: 1,
    save: 1,
    timeoutMs: 15_000,
  },
});
const transports = new WeakMap();
const executors = new WeakMap();

function createLyricsRequestBudget(provider, options = {}) {
  if (!Object.hasOwn(POLICIES, provider))
    throw new TypeError('invalid lyrics provider');
  const policy = POLICIES[provider];
  const maximum =
    options.maxAttempts ??
    policy[
      options.fresh
        ? 'save'
        : options.automatic
          ? 'automatic'
          : options.mode === 'broaden'
            ? 'broaden'
            : 'initial'
    ];
  const timeoutMs =
    options.timeoutMs ?? (options.fresh ? 15_000 : policy.timeoutMs);
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 16 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60_000
  )
    throw new TypeError('invalid lyrics request budget');
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('Lyrics request deadline exceeded', 'TimeoutError'),
      ),
    timeoutMs,
  );
  timer.unref?.();
  const signal = AbortSignal.any([
    controller.signal,
    ...[options.signal, options.parent?.signal].filter(Boolean),
  ]);
  let attempts = 0;
  const charged = new Set();
  const budget = {
    background: options.automatic === true || options.priority === 'background',
    signal,
    get attempts() {
      return attempts;
    },
    check(token) {
      signal.throwIfAborted();
      if (charged.has(token)) return;
      if (attempts >= maximum) {
        const error = new Error('Lyrics request budget exhausted');
        error.reason = 'request-budget-exhausted';
        throw error;
      }
      options.parent?.check(token);
    },
    consume(token = {}) {
      budget.check(token);
      if (charged.has(token)) return;
      options.parent?.consume(token);
      charged.add(token);
      attempts += 1;
    },
    dispose() {
      clearTimeout(timer);
    },
  };
  return budget;
}

function requestFailure(error) {
  return {
    status: 'error',
    reason:
      error?.reason === 'request-budget-exhausted'
        ? error.reason
        : error?.name === 'TimeoutError'
          ? 'timeout'
          : error?.name === 'AbortError'
            ? 'cancelled'
            : error?.name === 'QueueFullError'
              ? 'busy'
              : 'offline',
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function getLyricsRequestPolicy(provider, fetchFn, options = {}) {
  if (!Object.hasOwn(POLICIES, provider))
    throw new TypeError('invalid lyrics provider');
  // Missing transports still expose a policy; clients return fetch-unavailable.
  if (typeof fetchFn !== 'function') fetchFn = getLyricsRequestPolicy;
  if (!transports.has(fetchFn)) transports.set(fetchFn, new Map());
  const providers = transports.get(fetchFn);
  if (providers.has(provider)) return providers.get(provider);
  const now = options.now || (() => Date.now());
  if (!executors.has(fetchFn))
    executors.set(fetchFn, createLyricsRequestExecutor());
  const executor = executors.get(fetchFn);
  const sourceScheduler =
    options.scheduler ||
    createProviderRequestScheduler({
      intervalMs: POLICIES[provider].intervalMs,
      maxPending: 32,
      now,
      ...(options.wait ? { wait: options.wait } : {}),
    });
  const scheduler = {
    deferFor: (...args) => sourceScheduler.deferFor?.(...args),
    schedule: (start, settings = {}) =>
      sourceScheduler.schedule(start, {
        ...settings,
        ...(settings.priority === 'background' ? { minIntervalMs: 5000 } : {}),
      }),
  };
  const backgroundStarts = [];
  const flights = new Map();
  const cache = new Map();
  const maxBytes = options.cacheMaxBytes ?? 8 * 1024 * 1024;
  let cacheBytes = 0;

  function removeCache(key) {
    cacheBytes -= cache.get(key)?.bytes || 0;
    cache.delete(key);
  }

  function invalidate() {
    cache.clear();
    cacheBytes = 0;
    for (const flight of flights.values()) flight.invalidated = true;
  }

  function run(identity, start, options = {}) {
    const budget =
      options.budget || createLyricsRequestBudget(provider, options);
    const ownBudget = !options.budget;
    const signal = options.signal
      ? AbortSignal.any([options.signal, budget.signal])
      : budget.signal;
    const key = createHash('sha256')
      .update(JSON.stringify(canonical(identity)))
      .digest('hex');
    try {
      signal.throwIfAborted();
    } catch (error) {
      if (ownBudget) budget.dispose();
      return Promise.reject(error);
    }
    const cached = options.fresh ? null : cache.get(key);
    if (cached && cached.until > now()) {
      if (ownBudget) budget.dispose();
      return Promise.resolve(structuredClone(cached.result));
    }
    if (cached) removeCache(key);
    const flightKey = `${options.fresh ? 'fresh' : 'discovery'}:${key}`;
    let flight = flights.get(flightKey);
    if (!flight) {
      if (flights.size >= 32) {
        if (ownBudget) budget.dispose();
        return Promise.reject(new QueueFullError());
      }
      flight = {
        controller: new AbortController(),
        subscribers: new Set(),
        settled: false,
        invalidated: false,
        started: false,
      };
      flights.set(flightKey, flight);
    }
    if (flight.subscribers.size >= 32) {
      if (ownBudget) budget.dispose();
      return Promise.reject(new QueueFullError());
    }
    const promise = new Promise((resolve, reject) => {
      const subscriber = {
        budget,
        priority: options.priority,
        finish(error, result) {
          signal.removeEventListener('abort', onAbort);
          flight.subscribers.delete(subscriber);
          if (ownBudget) budget.dispose();
          if (error) reject(error);
          else resolve(structuredClone(result));
          if (!flight.settled && flight.subscribers.size === 0) {
            flight.controller.abort(
              error ||
                new DOMException(
                  'No remaining lyrics request subscribers',
                  'AbortError',
                ),
            );
            if (flights.get(flightKey) === flight) flights.delete(flightKey);
          }
        },
      };
      const onAbort = () => subscriber.finish(signal.reason);
      flight.subscribers.add(subscriber);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    if (!flight.started) {
      flight.started = true;
      queueMicrotask(async () => {
        let result;
        let error;
        try {
          flight.controller.signal.throwIfAborted();
          result = await executor.run(
            () =>
              start({
                signal: flight.controller.signal,
                charge() {
                  const physicalRequest = {};
                  const backgroundOnly = [...flight.subscribers].every(
                    (subscriber) =>
                      subscriber.budget.background ||
                      subscriber.priority === 'background',
                  );
                  while (
                    backgroundStarts.length &&
                    backgroundStarts[0] <= now() - 60000
                  )
                    backgroundStarts.shift();
                  if (backgroundOnly && backgroundStarts.length >= 12)
                    throw Object.assign(
                      new Error('Background lyrics quota reached'),
                      { reason: 'request-budget-exhausted' },
                    );
                  for (const subscriber of [...flight.subscribers]) {
                    try {
                      subscriber.budget.consume(physicalRequest);
                    } catch (failure) {
                      subscriber.finish(failure);
                    }
                  }
                  flight.controller.signal.throwIfAborted();
                  if (backgroundOnly) backgroundStarts.push(now());
                },
              }),
            { signal: flight.controller.signal, priority: options.priority },
          );
          if (
            options.fresh &&
            result?.status === 'ok' &&
            !flight.controller.signal.aborted
          )
            invalidate();
          if (
            !options.fresh &&
            !flight.invalidated &&
            !flight.controller.signal.aborted &&
            result?.status === 'ok' &&
            result.partial !== true
          ) {
            const bytes = Buffer.byteLength(JSON.stringify(result));
            if (bytes <= maxBytes) {
              removeCache(key);
              while (cache.size >= 32 || cacheBytes + bytes > maxBytes)
                removeCache(cache.keys().next().value);
              cache.set(key, {
                result: structuredClone(result),
                until: now() + 30_000,
                bytes,
              });
              cacheBytes += bytes;
            }
          }
        } catch (failure) {
          error = failure;
        }
        flight.settled = true;
        if (flights.get(flightKey) === flight) flights.delete(flightKey);
        for (const subscriber of [...flight.subscribers])
          subscriber.finish(error, result);
      });
    }
    return promise;
  }

  const policy = { scheduler, run, invalidate };
  providers.set(provider, policy);
  return policy;
}

module.exports = {
  createLyricsRequestBudget,
  getLyricsRequestPolicy,
  requestFailure,
};
