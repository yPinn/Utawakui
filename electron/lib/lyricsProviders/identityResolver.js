'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson } = require('../atomicWrite.js');
const { readBoundedText } = require('../lrclib/client.js');
const { buildLrclibQueryPlan } = require('../lrclib/query.js');
const { evaluateKugouLineIdentity } = require('../kugou/identity.js');
const {
  getLyricsRequestPolicy,
  createLyricsRequestBudget,
  requestFailure,
} = require('./requestPolicy.js');
const { createProviderRequestGuard } = require('../providerServiceCooldown.js');
const { appUserAgent } = require('../userAgent.js');
const POSITIVE_TTL = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL = 30 * 60 * 1000;
const POLICY = 'same-catalog-locale-v1';
function identityFor(track, query) {
  return buildLrclibQueryPlan(track, query).identity;
}
function lyricsIdentityKey(identity) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        identity.trackName,
        identity.artistName,
        identity.albumName,
        identity.duration,
        POLICY,
      ]),
    )
    .digest('hex');
}
function validName(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    ![...value].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)
  );
}
function metadataSong(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.trackId) ||
    value.trackId <= 0 ||
    !Number.isSafeInteger(value.artistId) ||
    value.artistId <= 0 ||
    !validName(value.trackName) ||
    !validName(value.artistName) ||
    !Number.isSafeInteger(value.trackTimeMillis) ||
    value.trackTimeMillis <= 0 ||
    value.trackTimeMillis > 86400000
  )
    return null;
  return {
    trackId: value.trackId,
    artistId: value.artistId,
    trackName: value.trackName.trim(),
    artistName: value.artistName.trim(),
    trackTimeMillis: value.trackTimeMillis,
  };
}
function createLyricsIdentityResolver(options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  const now = options.now || Date.now;
  const policy = getLyricsRequestPolicy('itunes-metadata', fetchFn, options);
  const guard = createProviderRequestGuard(fetchFn, options);
  const cache = new Map();
  const cacheFile = options.cacheDirectory
    ? path.join(options.cacheDirectory, 'aliases-v1.json')
    : null;
  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    if (!cacheFile) return;
    try {
      if (fs.statSync(cacheFile).size > 512000) return;
      const records = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (!Array.isArray(records) || records.length > 64) return;
      for (const item of records) {
        if (
          !/^[a-f0-9]{64}$/u.test(item?.key ?? '') ||
          item?.value?.policy !== POLICY ||
          item.value.identityKey !== item.key ||
          !Number.isFinite(item.until) ||
          item.until <= now() ||
          item.until > now() + POSITIVE_TTL ||
          !Array.isArray(item.value.evidence) ||
          item.value.evidence.length > 3
        )
          continue;
        if (
          item.value.evidence.some(
            (e) =>
              !validName(e.original) ||
              !validName(e.localized) ||
              !validName(e.artist) ||
              !Number.isSafeInteger(e.trackId) ||
              !Number.isSafeInteger(e.artistId) ||
              !Number.isSafeInteger(e.durationMs),
          )
        )
          continue;
        // Alias text is reconstructed from evidence, never from a free-standing cache field.
        const value = {
          ...item.value,
          expiresAt: item.until,
          aliases: {
            title: [...new Set(item.value.evidence.map((e) => e.localized))],
          },
        };
        cache.set(item.key, { until: item.until, value });
      }
    } catch {
      /* Derived evidence is optional and can be rebuilt. */
    }
  }
  function remember(key, value) {
    const until =
      now() + (value.aliases.title.length ? POSITIVE_TTL : NEGATIVE_TTL);
    value = { ...value, expiresAt: until };
    cache.delete(key);
    cache.set(key, { value, until });
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    if (cacheFile) {
      try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        atomicWriteJson(
          cacheFile,
          [...cache].map(([key, item]) => ({ key, ...item })),
        );
      } catch {
        /* Cache writes cannot fail a lyrics query. */
      }
    }
    return structuredClone(value);
  }
  async function request(route, fields, requestOptions) {
    if (typeof fetchFn !== 'function')
      return { status: 'error', reason: 'fetch-unavailable' };
    try {
      return await policy.run(
        [POLICY, route, fields],
        async (context) => {
          const url = new URL(route, 'https://itunes.apple.com');
          for (const [key, value] of Object.entries(fields))
            url.searchParams.set(key, value);
          let signal = context.signal;
          const response = await policy.scheduler.schedule(
            () => {
              signal = AbortSignal.any([
                context.signal,
                AbortSignal.timeout(3000),
              ]);
              return guard.fetch(
                url,
                {
                  redirect: 'error',
                  headers: { 'User-Agent': appUserAgent() },
                  signal,
                },
                context.charge,
              );
            },
            { signal: context.signal },
          );
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            return {
              status: 'error',
              reason:
                response.status === 429
                  ? 'rate-limited'
                  : 'service-unavailable',
            };
          }
          const body = await readBoundedText(response, 2 * 1024 * 1024, signal);
          if (body.status !== 'ok') return body;
          let value;
          try {
            value = JSON.parse(body.text);
          } catch {
            return { status: 'error', reason: 'invalid-json' };
          }
          if (!Array.isArray(value.results) || value.results.length > 5)
            return { status: 'error', reason: 'invalid-record' };
          return {
            status: 'ok',
            records: value.results.map(metadataSong).filter(Boolean),
          };
        },
        requestOptions,
      );
    } catch (error) {
      return requestFailure(error);
    }
  }
  async function resolve(track, resolveOptions = {}) {
    const identity = identityFor(track, resolveOptions.query);
    const key = lyricsIdentityKey(identity);
    const empty = {
      policy: POLICY,
      identityKey: key,
      aliases: { title: [] },
      evidence: [],
    };
    if (
      !validName(identity.trackName) ||
      !validName(identity.artistName) ||
      !Number.isFinite(identity.duration) ||
      identity.duration <= 0 ||
      identity.duration > 86400
    )
      return { ...empty, reason: 'missing-track-identity' };
    if (!/\p{Script=Latin}/u.test(identity.trackName))
      return { ...empty, reason: 'alias-unneeded' };
    load();
    const existing = cache.get(key);
    if (existing?.until > now()) return structuredClone(existing.value);
    const budget =
      resolveOptions.budget ||
      createLyricsRequestBudget('itunes-metadata', resolveOptions);
    const requestOptions = { budget, signal: budget.signal };
    try {
      const first = await request(
        '/search',
        {
          term: `${identity.trackName} ${identity.artistName}`,
          entity: 'song',
          country: 'US',
          lang: 'en_us',
          limit: '5',
        },
        requestOptions,
      );
      if (first.status !== 'ok') return { ...empty, reason: first.reason };
      const reference = {
        title: identity.trackName,
        artist: identity.artistName,
        durationSeconds: identity.duration,
        version: 'studio',
      };
      const eligible = first.records
        .filter(
          (r) =>
            evaluateKugouLineIdentity(
              { reference },
              {
                title: r.trackName,
                artist: r.artistName,
                durationSeconds: r.trackTimeMillis / 1000,
              },
            ).accepted,
        )
        .slice(0, 3);
      if (!eligible.length) return remember(key, empty);
      const second = await request(
        '/lookup',
        {
          id: eligible.map((r) => r.trackId).join(','),
          country: 'JP',
          lang: 'ja_jp',
        },
        requestOptions,
      );
      if (second.status !== 'ok') return { ...empty, reason: second.reason };
      const evidence = [];
      for (const localized of second.records) {
        const original = eligible.find(
          (r) =>
            r.trackId === localized.trackId &&
            r.artistId === localized.artistId &&
            r.trackTimeMillis === localized.trackTimeMillis &&
            r.artistName === localized.artistName,
        );
        if (!original || original.trackName === localized.trackName) continue;
        // A verified alias still cannot introduce a different recording version.
        const check = evaluateKugouLineIdentity(
          { reference, aliases: { title: [localized.trackName] } },
          {
            title: localized.trackName,
            artist: localized.artistName,
            durationSeconds: localized.trackTimeMillis / 1000,
          },
        );
        if (!check.accepted) continue;
        evidence.push({
          trackId: original.trackId,
          artistId: original.artistId,
          original: original.trackName,
          localized: localized.trackName,
          artist: original.artistName,
          durationMs: original.trackTimeMillis,
          from: 'US',
          to: 'JP',
        });
      }
      const titles = [...new Set(evidence.map((e) => e.localized))];
      if (titles.length > 1) return { ...empty, reason: 'ambiguous-identity' };
      return remember(key, { ...empty, aliases: { title: titles }, evidence });
    } finally {
      if (!resolveOptions.budget) budget.dispose();
    }
  }
  return { resolve };
}
module.exports = { createLyricsIdentityResolver, lyricsIdentityKey };
