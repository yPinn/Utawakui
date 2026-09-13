'use strict';

const packageMetadata = require('../../../package.json');
// readBoundedText is a generic streamed-response reader with no lrclib-
// specific behavior; netease/client.js already imports it the same way
// rather than duplicating the streaming logic.
const { readBoundedText } = require('../lrclib/client.js');

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

function buildFeedbackUserAgent() {
  return `Utawakui/${packageMetadata.version} (feedback)`;
}

function classifyTransportFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { status: 'error', reason: 'timeout' };
  }
  return { status: 'error', reason: 'offline' };
}

function parseJson(text) {
  if (!text) return { status: 'ok', value: null };
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
}

// Submission is a single, manually-triggered action (not a background poll
// like the lyrics providers), so unlike lrclib/betterlyrics/netease this
// makes no automatic retry — a 429/5xx surfaces immediately and the caller
// (feedbackHandlers.js) falls back to a local export instead of retrying a
// user-visible action behind their back.
function createFeedbackClient(options = {}) {
  const hasInjectedFetch = Object.prototype.hasOwnProperty.call(
    options,
    'fetch',
  );
  const fetchFn = hasInjectedFetch ? options.fetch : globalThis.fetch;
  const baseUrl = options.baseUrl;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const userAgent = options.userAgent || buildFeedbackUserAgent();
  const clientToken = options.clientToken;

  async function submit(payload, requestOptions = {}) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
      return { status: 'error', reason: 'endpoint-not-configured' };
    }

    let response;
    let requestSignal;
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      requestSignal = requestOptions.signal
        ? AbortSignal.any([requestOptions.signal, timeoutSignal])
        : timeoutSignal;
      response = await fetchFn(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          ...(clientToken ? { 'X-Utawakui-Feedback-Token': clientToken } : {}),
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: requestSignal,
      });
    } catch (error) {
      return requestSignal?.aborted
        ? classifyTransportFailure(requestSignal.reason)
        : classifyTransportFailure(error);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) {
        return { status: 'error', reason: 'rate-limited' };
      }
      if (response.status >= 500) {
        return { status: 'error', reason: 'service-unavailable' };
      }
      return {
        status: 'error',
        reason: 'http-error',
        httpStatus: response.status,
      };
    }

    const bounded = await readBoundedText(
      response,
      maxResponseBytes,
      requestSignal,
    );
    if (bounded.status === 'error') return bounded;

    const parsed = parseJson(bounded.text);
    if (parsed.status === 'error') return parsed;
    const reportId =
      typeof parsed.value?.reportId === 'string'
        ? parsed.value.reportId
        : payload.reportId;
    return { status: 'ok', reportId };
  }

  return { submit };
}

module.exports = {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  buildFeedbackUserAgent,
  createFeedbackClient,
};
