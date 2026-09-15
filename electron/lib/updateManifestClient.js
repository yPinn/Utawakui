'use strict';

// Fetches the independent signed update manifest described in
// docs/adr/0018-signed-update-manifest.md. Mirrors electron/lib/feedback/client.js's
// conventions (injectable fetch, bounded timeout, bounded response read,
// classified error reasons, redirect: 'error') for the same reason: a
// main-process network call to a fixed, non-renderer-suppliable URL.

const packageMetadata = require('../../package.json');
// Generic streamed-response reader with no lrclib-specific behavior — see
// feedback/client.js's identical reuse of this helper.
const { readBoundedText } = require('./lrclib/client.js');

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024;
const RELEASE_REPOSITORY = 'yPinn/Utawakui-Releases';

// version comes only from electron-updater's own reported info.version — see
// appUpdateService.js. Never accept a renderer- or caller-suppliable URL, per
// ADR 0007's existing "renderer cannot supply a feed URL" principle.
function manifestUrlForVersion(version) {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/update-manifest.json`;
}

function buildUserAgent() {
  return `Utawakui/${packageMetadata.version} (update-manifest)`;
}

function classifyTransportFailure(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { status: 'error', reason: 'timeout' };
  }
  return { status: 'error', reason: 'offline' };
}

function parseJson(text) {
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'error', reason: 'invalid-json' };
  }
}

function createUpdateManifestClient(options = {}) {
  const hasInjectedFetch = Object.prototype.hasOwnProperty.call(
    options,
    'fetch',
  );
  const fetchFn = hasInjectedFetch ? options.fetch : globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const userAgent = options.userAgent || buildUserAgent();

  async function fetchManifest(version) {
    if (typeof fetchFn !== 'function') {
      return { status: 'error', reason: 'fetch-unavailable' };
    }
    if (typeof version !== 'string' || version.length === 0) {
      return { status: 'error', reason: 'invalid-version' };
    }

    let response;
    let requestSignal;
    try {
      requestSignal = AbortSignal.timeout(timeoutMs);
      response = await fetchFn(manifestUrlForVersion(version), {
        method: 'GET',
        headers: { 'User-Agent': userAgent },
        // Unlike feedback/client.js's direct POST endpoint, a GitHub Releases
        // asset URL unconditionally 302s to objects.githubusercontent.com —
        // redirect: 'error' would make every real request fail. The redirect
        // target isn't attacker-influenced (GitHub's own asset storage for a
        // URL we built from a fixed host + electron-updater's own reported
        // version), so following it here doesn't reopen the "renderer/caller
        // cannot supply a URL" concern that motivated 'error' elsewhere.
        redirect: 'follow',
        signal: requestSignal,
      });
    } catch (error) {
      return requestSignal?.aborted
        ? classifyTransportFailure(requestSignal.reason)
        : classifyTransportFailure(error);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
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

    return parseJson(bounded.text);
  }

  return { fetchManifest };
}

module.exports = {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  RELEASE_REPOSITORY,
  manifestUrlForVersion,
  createUpdateManifestClient,
};
