'use strict';

const { appUserAgent } = require('../userAgent.js');
const { readBoundedText } = require('../lrclib/client.js');
const {
  getLyricsRequestPolicy,
  requestFailure,
} = require('../lyricsProviders/requestPolicy.js');
const {
  createProviderRequestGuard,
  isProviderCooldownResponse,
} = require('../providerServiceCooldown.js');

const CATALOG = 'https://mobileservice.kugou.com/api/v3/search/song';
const LYRICS = 'https://krcs.kugou.com/search';
const DOWNLOAD = 'https://lyrics.kugou.com/download';
const HASH = /^[a-f0-9]{32}$/iu;
const ID = /^[a-z0-9_-]{1,64}$/iu;
const KEY = /^[a-z0-9+/=_-]{1,128}$/iu;
const BASE64 = /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu;
function text(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    ![...value].some(
      (character) =>
        character.codePointAt(0) <= 31 || character.codePointAt(0) === 127,
    )
  );
}
function normalizeSong(value) {
  const title = value?.songname_original ?? value?.songname;
  const artist = value?.singername;
  const rawDuration = Number(value?.duration);
  const durationSeconds =
    rawDuration > 86400 ? rawDuration / 1000 : rawDuration;
  if (
    typeof value?.hash !== 'string' ||
    !HASH.test(value.hash) ||
    !text(title) ||
    !text(artist) ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 86400
  )
    return null;
  return {
    hash: value.hash.toLowerCase(),
    title: title.trim(),
    artist: artist.trim(),
    durationSeconds,
  };
}
function normalizeLyric(value) {
  if (
    !value ||
    !ID.test(String(value.id ?? '')) ||
    typeof value.accesskey !== 'string' ||
    !KEY.test(value.accesskey) ||
    !Number.isFinite(Number(value.duration)) ||
    Number(value.duration) <= 0 ||
    Number(value.duration) > 86400000
  )
    return null;
  return {
    id: String(value.id),
    accesskey: value.accesskey,
    duration: Number(value.duration),
    lrcid:
      Number.isSafeInteger(Number(value.lrcid)) && Number(value.lrcid) >= 0
        ? Number(value.lrcid)
        : 0,
  };
}
function createKugouClient(options = {}) {
  const fetch = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const guard = createProviderRequestGuard(fetch, options);
  const policy = getLyricsRequestPolicy('kugou', fetch, options);
  const maximum = options.maxResponseBytes ?? 4 * 1024 * 1024;
  async function request(endpoint, fields, read, requestOptions = {}) {
    if (typeof fetch !== 'function')
      return { status: 'error', reason: 'fetch-unavailable' };
    try {
      return await policy.run(
        [endpoint, fields, maximum],
        async (context) => {
          const url = new URL(endpoint);
          for (const [key, value] of Object.entries(fields))
            url.searchParams.set(key, value);
          const signal = AbortSignal.any([
            context.signal,
            AbortSignal.timeout(options.timeoutMs ?? 10000),
          ]);
          const response = await policy.scheduler.schedule(
            () =>
              guard.fetch(
                url,
                {
                  method: 'GET',
                  redirect: 'error',
                  headers: {
                    Accept: 'application/json',
                    'User-Agent': appUserAgent(),
                  },
                  signal,
                },
                context.charge,
              ),
            { signal, priority: requestOptions.priority },
          );
          const requestSource = isProviderCooldownResponse(response)
            ? 'cooldown'
            : 'network';
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            return {
              status: 'error',
              reason:
                response.status === 429
                  ? 'rate-limited'
                  : response.status >= 500
                    ? 'service-unavailable'
                    : 'http-error',
              httpStatus: response.status,
              requestSource,
            };
          }
          const bounded = await readBoundedText(response, maximum, signal);
          if (bounded.status !== 'ok') return bounded;
          let value;
          try {
            value = JSON.parse(bounded.text);
          } catch {
            return { status: 'error', reason: 'invalid-json' };
          }
          // Some routes return HTTP 200 with an application-level failure.
          const code = value?.status === 0 ? Number(value?.error_code) : 200;
          if (code === 429 || (code >= 500 && code <= 599)) {
            guard.recordFailure(url, code, response.headers.get('retry-after'));
            return {
              status: 'error',
              reason: code === 429 ? 'rate-limited' : 'service-unavailable',
              requestSource,
            };
          }
          if (value?.status === 0)
            return { status: 'error', reason: 'provider-failure' };
          return read(value);
        },
        requestOptions,
      );
    } catch (error) {
      return requestFailure(error);
    }
  }
  function search(query, options) {
    if (!text(query?.title) || !text(query?.artist))
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    return request(
      CATALOG,
      {
        keyword: `${query.artist.trim()} ${query.title.trim()}`,
        page: '1',
        pagesize: '10',
      },
      (value) => {
        const list = value?.data?.info;
        if (!Array.isArray(list) || list.length > 10)
          return { status: 'error', reason: 'invalid-record' };
        const records = list.map(normalizeSong).filter(Boolean);
        return {
          status: 'ok',
          records,
          invalidRecordCount: list.length - records.length,
        };
      },
      options,
    );
  }
  function searchLyrics(hash, options) {
    if (typeof hash !== 'string' || !HASH.test(hash))
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    return request(
      LYRICS,
      {
        ver: '1',
        man: 'yes',
        client: 'pc',
        hash: hash.toLowerCase(),
        album_audio_id: '0',
      },
      (value) => {
        if (!Array.isArray(value?.candidates) || value.candidates.length > 64)
          return { status: 'error', reason: 'invalid-record' };
        const records = value.candidates.map(normalizeLyric).filter(Boolean);
        return {
          status: 'ok',
          records,
          invalidRecordCount: value.candidates.length - records.length,
        };
      },
      options,
    );
  }
  function download(candidate, options) {
    if (
      !ID.test(String(candidate?.id ?? '')) ||
      typeof candidate?.accesskey !== 'string' ||
      !KEY.test(candidate.accesskey) ||
      !Number.isSafeInteger(candidate.lrcid) ||
      candidate.lrcid < 0
    )
      return Promise.resolve({ status: 'error', reason: 'invalid-request' });
    return request(
      DOWNLOAD,
      {
        ver: '1',
        client: 'pc',
        id: String(candidate.id),
        accesskey: candidate.accesskey,
        fmt: 'lrc',
        lrcid: String(candidate.lrcid),
      },
      (value) => {
        if (
          typeof value?.content !== 'string' ||
          value.content.length > maximum ||
          !BASE64.test(value.content)
        )
          return { status: 'error', reason: 'invalid-record' };
        const bytes = Buffer.from(value.content, 'base64');
        if (bytes.length > 2 * 1024 * 1024)
          return { status: 'error', reason: 'response-too-large' };
        try {
          return {
            status: 'ok',
            text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          };
        } catch {
          return { status: 'error', reason: 'invalid-record' };
        }
      },
      options,
    );
  }
  return {
    availability() {
      const status = [CATALOG, LYRICS, DOWNLOAD]
        .map((endpoint) => guard.cooldownStatus?.(endpoint))
        .find(Boolean);
      return status
        ? {
            status: 'error',
            reason: status === 429 ? 'rate-limited' : 'service-unavailable',
            httpStatus: status,
            requestSource: 'cooldown',
          }
        : { status: 'ok' };
    },
    search,
    searchLyrics,
    download,
    invalidateDiscovery: policy.invalidate,
  };
}
module.exports = { createKugouClient };
