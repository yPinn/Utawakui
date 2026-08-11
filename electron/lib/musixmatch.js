'use strict';

const { normalizeText } = require('./musicTitle.js');
const { parseLrcLines, readJsonResponse } = require('./lrclib.js');

const MUSIXMATCH_API_BASE_URL = 'https://api.musixmatch.com/ws/1.1';
const MUSIXMATCH_API_KEY_ENV = 'MUSIXMATCH_API_KEY';
const MUSIXMATCH_PROVIDER = 'musixmatch';
const DEFAULT_SUBTITLE_FORMAT = 'lrc';
const REQUEST_TIMEOUT_MS = 8000;

function normalizedDurationSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function buildMusixmatchUrl(
  method,
  params,
  apiKey,
  baseUrl = MUSIXMATCH_API_BASE_URL,
) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/${method}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set('apikey', apiKey);
  return url;
}

function buildMatcherSubtitleParams(track) {
  const params = {
    q_track: normalizeText(track?.title),
    q_artist: normalizeText(track?.artist),
    subtitle_format: DEFAULT_SUBTITLE_FORMAT,
  };
  const duration = normalizedDurationSeconds(track?.duration);
  if (duration !== null) {
    params.f_subtitle_length = duration;
    params.f_subtitle_length_max_deviation = 3;
  }
  return params;
}

function parseMusixmatchHeader(payload) {
  const header = payload?.message?.header || {};
  return {
    statusCode: Number.isFinite(Number(header.status_code))
      ? Number(header.status_code)
      : null,
    hint:
      normalizeText(header.hint) ||
      normalizeText(header.error_message) ||
      normalizeText(header.status_code),
  };
}

function summarizeSubtitle(subtitle) {
  const body = normalizeText(subtitle?.subtitle_body);
  const lines = parseLrcLines(body);
  const hasSyncedLyrics = lines.length > 0;
  return {
    provider: MUSIXMATCH_PROVIDER,
    status: hasSyncedLyrics ? 'available' : 'unavailable',
    reason: hasSyncedLyrics ? null : 'empty-subtitle',
    kind: 'synced-lyrics',
    format: normalizeText(subtitle?.subtitle_format) || DEFAULT_SUBTITLE_FORMAT,
    language: normalizeText(subtitle?.subtitle_language) || null,
    lineCount: lines.length,
    firstLineStart: hasSyncedLyrics ? lines[0].start : null,
    copyright: normalizeText(subtitle?.subtitle_copyright) || null,
  };
}

function summarizeMusixmatchPayload(payload) {
  const { statusCode, hint } = parseMusixmatchHeader(payload);
  if (statusCode !== 200) {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'unavailable',
      reason: hint || 'api-status-not-ok',
      apiStatusCode: statusCode,
    };
  }

  const subtitle = payload?.message?.body?.subtitle;
  if (!subtitle || typeof subtitle !== 'object') {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'unavailable',
      reason: 'missing-subtitle',
      apiStatusCode: statusCode,
    };
  }

  return {
    ...summarizeSubtitle(subtitle),
    apiStatusCode: statusCode,
  };
}

async function probeMusixmatchLyrics(track, options = {}) {
  const apiKey =
    normalizeText(options.apiKey) ||
    normalizeText(process.env[MUSIXMATCH_API_KEY_ENV]);
  if (!apiKey) {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'not-configured',
      reason: 'missing-api-key',
      requiredEnv: MUSIXMATCH_API_KEY_ENV,
    };
  }

  const params = buildMatcherSubtitleParams(track);
  if (!params.q_track || !params.q_artist) {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'unavailable',
      reason: 'missing-track-metadata',
    };
  }

  const fetchFn = options.fetch || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'unavailable',
      reason: 'fetch-unavailable',
    };
  }

  const url = buildMusixmatchUrl(
    'matcher.subtitle.get',
    params,
    apiKey,
    options.baseUrl,
  );

  let response;
  try {
    response = await fetchFn(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'error',
      reason: 'network-error',
    };
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'error',
      reason: 'http-error',
      httpStatus: response.status,
      apiStatusCode: parseMusixmatchHeader(payload).statusCode,
    };
  }
  if (!payload) {
    return {
      provider: MUSIXMATCH_PROVIDER,
      status: 'error',
      reason: 'invalid-json',
    };
  }

  return summarizeMusixmatchPayload(payload);
}

module.exports = {
  buildMatcherSubtitleParams,
  buildMusixmatchUrl,
  MUSIXMATCH_API_KEY_ENV,
  parseLrcLines,
  probeMusixmatchLyrics,
  summarizeMusixmatchPayload,
};
