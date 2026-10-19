// Development-only HTTP contracts. Never imported by the application runtime.
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as yaml from 'js-yaml';
import {
  createLrclibClient,
  readBoundedText,
} from '../electron/lib/lrclib/client.js';
import { createNeteaseClient } from '../electron/lib/netease/client.js';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 20;
const PROVIDERS = new Set(['lrclib', 'netease']);
const QUERY = Object.freeze({
  trackName: 'Viva La Vida',
  artistName: 'Coldplay',
});
const mask = (value) => value.replace(/[^\s]/g, 'x');

function scrubTimedText(value, visit, depth) {
  return value
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('{')) {
        try {
          return JSON.stringify(visit(JSON.parse(line), '', depth + 1));
        } catch {
          throw new Error('contract lyric metadata invalid');
        }
      }
      if (/^\s*\[offset:[+-]?\d+\]\s*$/i.test(line)) return line;
      const lrc = line.match(
        /^(\s*(?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+)(.*)$/,
      );
      if (lrc) return lrc[1] + mask(lrc[2]);
      const yrc = line.match(/^(\[\d+,\d+\])(.*)$/);
      if (yrc)
        return (
          yrc[1] +
          yrc[2]
            .split(/(\(\d+,\d+,\d+\))/)
            .map((part) => (/^\(\d+,\d+,\d+\)$/.test(part) ? part : mask(part)))
            .join('')
        );
      return mask(line);
    })
    .join('\n');
}

export function sanitizeProviderPayload(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES)
    throw new Error('contract payload budget');
  let nodes = 0;
  function visit(item, key = '', depth = 0) {
    if (depth > 24 || ++nodes > 100_000)
      throw new Error('contract payload budget');
    if (typeof item === 'string') {
      if (key === 'lyricsfile') {
        const events = yaml.parseEvents(item, { maxDepth: 24 });
        if (
          events.length > 100_000 ||
          events.filter((event) => event.type === 1).length > 1 ||
          events.some(
            (event) =>
              event.type === 5 || event.anchorStart >= 0 || event.tagStart >= 0,
          )
        )
          throw new Error('contract YAML unsupported');
        const document = yaml.load(item, { schema: yaml.JSON_SCHEMA });
        const clean = visit(document, '', depth + 1);
        // These are bounded format identifiers, not free text.
        if (/^\d{1,3}\.\d{1,3}$/.test(document?.version))
          clean.version = document.version;
        if (['en', 'zh', 'ja', 'ko'].includes(document?.metadata?.language))
          clean.metadata.language = document.metadata.language;
        return yaml.dump(clean, { noRefs: true, lineWidth: -1 });
      }
      if (['syncedLyrics', 'lyric'].includes(key))
        return scrubTimedText(item, visit, depth);
      return mask(item);
    }
    if (Array.isArray(item))
      return item.map((child) => visit(child, '', depth + 1));
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([name, child]) => {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name))
            throw new Error('contract field name invalid');
          return [name, visit(child, name, depth + 1)];
        }),
      );
    return item;
  }
  return visit(value);
}

function requestKey(provider, input, options = {}) {
  const url = new URL(input);
  const method = options.method ?? 'GET';
  const headers = new Headers(options.headers);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    headers.has('cookie') ||
    headers.has('authorization') ||
    (options.credentials && options.credentials !== 'omit')
  )
    throw new Error('contract request rejected');
  const isLrclib =
    provider === 'lrclib' &&
    url.origin === 'https://lrclib.net' &&
    /^\/api\/(?:get(?:\/[1-9]\d*)?|search)$/.test(url.pathname) &&
    method === 'GET' &&
    !options.body;
  const isNetease =
    provider === 'netease' &&
    url.origin === 'https://interface.music.163.com' &&
    ['/api/cloudsearch/pc', '/api/song/lyric/v1'].includes(url.pathname) &&
    method === 'POST' &&
    !url.search;
  if (!isLrclib && !isNetease) throw new Error('contract request rejected');
  const fields = new URLSearchParams(options.body);
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = (params) =>
    [...params].sort(([a, x], [b, y]) => compare(a, b) || compare(x, y));
  const signature = JSON.stringify([
    provider,
    method,
    url.origin,
    url.pathname,
    sorted(url.searchParams),
    sorted(fields),
  ]);
  return crypto.createHash('sha256').update(signature).digest('hex');
}

export function createContractRecorder(provider, transport = globalThis.fetch) {
  if (!PROVIDERS.has(provider) || typeof transport !== 'function')
    throw new Error('contract provider invalid');
  const records = [];
  let requestCount = 0;
  return {
    async fetch(input, options = {}) {
      const key = requestKey(provider, input, options);
      if (requestCount++ >= MAX_RECORDS)
        throw new Error('contract record budget');
      let response;
      try {
        response = await transport(input, {
          ...options,
          redirect: 'error',
          signal: options.signal ?? AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error('contract transport failed');
      }
      const bounded = await readBoundedText(
        response,
        MAX_BYTES,
        options.signal,
      );
      if (bounded.status !== 'ok') throw new Error('contract response budget');
      let body;
      try {
        body = response.ok
          ? sanitizeProviderPayload(JSON.parse(bounded.text))
          : null;
      } catch {
        throw new Error('contract response cannot be sanitized');
      }
      const headers = {};
      const retry = response.headers.get('retry-after');
      if (retry !== null && /^\d+(?:\.\d+)?$/.test(retry))
        headers['retry-after'] = retry;
      records.push({ key, status: response.status, headers, body });
      return new Response(
        [204, 205, 304].includes(response.status) ? null : bounded.text,
        { status: response.status, headers: response.headers },
      );
    },
    snapshot() {
      return structuredClone({
        schemaVersion: 1,
        provider,
        recordedAt: new Date().toISOString(),
        records,
      });
    },
  };
}

function validateCassette(data) {
  const exactKeys = (value, keys) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  if (
    !exactKeys(data, ['schemaVersion', 'provider', 'recordedAt', 'records']) ||
    data.schemaVersion !== 1 ||
    !PROVIDERS.has(data.provider) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(data.recordedAt) ||
    !Array.isArray(data.records) ||
    data.records.length > MAX_RECORDS ||
    Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES * 2
  )
    throw new Error('contract cassette invalid');
  for (const item of data.records) {
    if (
      !exactKeys(item, ['key', 'status', 'headers', 'body']) ||
      !/^[a-f0-9]{64}$/.test(item.key) ||
      !Number.isInteger(item.status) ||
      item.status < 200 ||
      item.status > 599 ||
      !item.headers ||
      Array.isArray(item.headers) ||
      Object.entries(item.headers).some(
        ([key, value]) =>
          key !== 'retry-after' ||
          typeof value !== 'string' ||
          !/^\d+(?:\.\d+)?$/.test(value),
      ) ||
      JSON.stringify(sanitizeProviderPayload(item.body)) !==
        JSON.stringify(item.body)
    )
      throw new Error('contract cassette invalid');
  }
  return structuredClone(data);
}

export function createContractReplay(cassette) {
  const data = validateCassette(cassette);
  let cursor = 0;
  return {
    async fetch(input, options) {
      const item = data.records[cursor];
      if (!item || item.key !== requestKey(data.provider, input, options))
        throw new Error('contract unrecorded request');
      cursor += 1;
      return new Response(
        [204, 205, 304].includes(item.status)
          ? null
          : JSON.stringify(item.body),
        {
          status: item.status,
          headers: { ...item.headers, 'Content-Type': 'application/json' },
        },
      );
    },
    assertConsumed() {
      if (cursor !== data.records.length)
        throw new Error('contract unconsumed responses');
    },
  };
}

export function saveContractCassette(file, cassette) {
  const data = validateCassette(cassette);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
}

export function loadContractCassette(file) {
  if (fs.statSync(file).size > MAX_BYTES * 2)
    throw new Error('contract cassette budget');
  return validateCassette(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export async function probeProvider(provider, options) {
  const client =
    provider === 'lrclib'
      ? createLrclibClient(options)
      : provider === 'netease'
        ? createNeteaseClient(options)
        : null;
  if (!client) throw new Error('contract provider invalid');
  const found = await client.search(QUERY);
  if (
    found.status !== 'ok' ||
    !found.records.length ||
    found.invalidRecordCount
  )
    throw new Error('contract search schema failed');
  const detail =
    provider === 'lrclib'
      ? await client.getById(found.records[0].id)
      : await client.getLyrics(found.records[0].id);
  if (detail.status !== 'ok') throw new Error('contract detail schema failed');
  return { searchCount: found.records.length, detail: detail.status };
}
