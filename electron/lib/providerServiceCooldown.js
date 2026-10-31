'use strict';

// A transport's callers share service health, never credentials or response data.
const transports = new WeakMap();
const cooldownResponses = new WeakSet();
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function parseRetryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (/^-?\d+(?:\.\d+)?$/u.test(normalized)) {
    const milliseconds = Number(normalized) * 1000;
    return Number.isFinite(milliseconds) && milliseconds >= 0
      ? milliseconds
      : null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

function createProviderRequestGuard(fetchFn, options = {}) {
  if (typeof fetchFn !== 'function') return { fetch: fetchFn };
  const now = options.now || Date.now;
  if (!transports.has(fetchFn)) transports.set(fetchFn, new Map());
  const services = transports.get(fetchFn);

  function stateFor(input) {
    // All callers validate/derive their URLs before this boundary. Key by origin,
    // not path/query, so keys and private track metadata never enter this map.
    const origin = new URL(input).origin;
    if (!services.has(origin)) {
      services.set(origin, {
        until: 0,
        failures: 0,
        status: null,
        revision: 0,
      });
    }
    return services.get(origin);
  }

  function recordFailure(input, status, retryAfter) {
    if (status !== 429 && !(status >= 500 && status <= 599)) return;
    const state = stateFor(input);
    const currentTime = now();
    const requested = parseRetryAfterMs(retryAfter, currentTime);
    state.failures = Math.min(state.failures + 1, 7);
    const fallback = Math.min(
      MAX_BACKOFF_MS,
      (status === 429 ? 30_000 : 5_000) * 2 ** (state.failures - 1),
    );
    const delay =
      requested > 0 && Number.isSafeInteger(Math.ceil(currentTime + requested))
        ? requested
        : fallback;
    state.until = Math.max(state.until, currentTime + delay);
    state.status = status;
    state.revision += 1;
  }

  async function guardedFetch(input, init = {}, beforeRequest) {
    init.signal?.throwIfAborted();
    const state = stateFor(input);
    if (state.until > now()) {
      // Preserve each client's existing HTTP classification; never resubmit a
      // POST or wait out a long server deadline in a UI request.
      const response = new Response(null, { status: state.status });
      cooldownResponses.add(response);
      return response;
    }
    const revision = state.revision;
    beforeRequest?.();
    const response = await fetchFn(input, init);
    if (
      response.status === 429 ||
      (response.status >= 500 && response.status <= 599)
    ) {
      recordFailure(
        input,
        response.status,
        response.headers?.get?.('retry-after'),
      );
    } else if (
      response.ok &&
      state.revision === revision &&
      state.until <= now()
    ) {
      state.failures = 0;
      state.status = null;
    }
    return response;
  }

  function cooldownStatus(input) {
    const state = stateFor(input);
    return state.until > now() ? state.status : null;
  }
  return { fetch: guardedFetch, recordFailure, cooldownStatus };
}

function isProviderCooldownResponse(response) {
  return cooldownResponses.has(response);
}

module.exports = {
  createProviderRequestGuard,
  parseRetryAfterMs,
  isProviderCooldownResponse,
};
