import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';
import {
  buildLrclibUserAgent,
  createLrclibClient,
  parseRetryAfterMs,
} from './client.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../../../package.json');

function completeRecord(overrides = {}) {
  return {
    id: 42,
    name: 'Espresso - Sabrina Carpenter',
    trackName: 'Espresso',
    artistName: 'Sabrina Carpenter',
    albumName: 'Short n’ Sweet',
    duration: 175,
    instrumental: false,
    plainLyrics: 'Plain lyrics',
    syncedLyrics: '[00:01.00]Synced lyrics',
    lyricsfile: 'version: 1.0\nlines: []\n',
    ...overrides,
  };
}

function immediateScheduler() {
  return {
    schedule: vi.fn((operation) => operation()),
    deferFor: vi.fn(),
  };
}

describe('buildLrclibUserAgent', () => {
  it('identifies the package version and project URL', () => {
    expect(buildLrclibUserAgent()).toBe(
      `Utawakui/${packageMetadata.version} (https://github.com/yPinn/Utawakui)`,
    );
  });
});

describe('parseRetryAfterMs', () => {
  it('accepts seconds and HTTP dates while rejecting invalid values', () => {
    expect(parseRetryAfterMs('1.5', 0)).toBe(1500);
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:02 GMT', 500)).toBe(1500);
    expect(parseRetryAfterMs('not-a-date', 0)).toBeNull();
    expect(parseRetryAfterMs('-1', 0)).toBeNull();
  });
});

describe('createLrclibClient', () => {
  it('fetches and normalizes a complete record by id through the scheduler', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completeRecord()), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const scheduler = immediateScheduler();
    const client = createLrclibClient({
      fetch,
      scheduler,
      baseUrl: 'https://lrclib.example.test',
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'ok',
      record: completeRecord(),
    });
    expect(scheduler.schedule).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(String(url)).toBe('https://lrclib.example.test/api/get/42');
    expect(request.headers['User-Agent']).toBe(buildLrclibUserAgent());
  });

  it('performs one structured title and artist search and omits invalid records', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            completeRecord(),
            completeRecord({ id: 'unsafe-provider-id' }),
          ]),
        ),
      );
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
      baseUrl: 'https://lrclib.example.test',
    });

    await expect(
      client.search({ trackName: 'Espresso', artistName: 'Sabrina Carpenter' }),
    ).resolves.toEqual({
      status: 'ok',
      records: [completeRecord()],
      invalidRecordCount: 1,
    });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      track_name: 'Espresso',
      artist_name: 'Sabrina Carpenter',
    });
  });

  it('rejects an oversized streamed response before JSON decoding', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('x'.repeat(101)));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
      maxResponseBytes: 100,
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
    });
  });

  it('rejects an oversized Content-Length without reading the body', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('small mock body', {
        headers: { 'Content-Length': '1000' },
      }),
    );
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
      maxResponseBytes: 100,
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
    });
  });

  it('returns a typed invalid-json failure without exposing parser text', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{not json'));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-json',
    });
  });

  it('returns a typed invalid-record failure for an unsafe selected record', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(completeRecord({ trackName: '' }))),
      );
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-record',
      issues: ['invalid-track-name'],
    });
  });

  it('honors a bounded Retry-After once through the shared scheduler', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(completeRecord())));
    const scheduler = immediateScheduler();
    const client = createLrclibClient({
      fetch,
      scheduler,
      maxRetryAfterMs: 1000,
    });

    await expect(client.getById(42)).resolves.toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(scheduler.deferFor).toHaveBeenCalledWith(1000);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
  });

  it('retries one eligible 503 and classifies a repeated outage', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 503, headers: { 'Retry-After': '0' } }),
      );
    const scheduler = immediateScheduler();
    const client = createLrclibClient({ fetch, scheduler });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'service-unavailable',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(scheduler.deferFor).toHaveBeenCalledWith(0);
  });

  it('returns bounded HTTP failures and maps a search 404 to no records', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 418 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'http-error',
      httpStatus: 418,
    });
    await expect(
      client.search({ trackName: 'Song', artistName: 'Artist' }),
    ).resolves.toEqual({
      status: 'ok',
      records: [],
      invalidRecordCount: 0,
    });
  });

  it('builds an exact lookup and validates public inputs', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(completeRecord())));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
      baseUrl: 'https://lrclib.example.test',
    });

    await expect(
      client.getExact({
        trackName: 'Espresso',
        artistName: 'Sabrina Carpenter',
        albumName: 'Short n’ Sweet',
        duration: 175,
      }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(
      Object.fromEntries(new URL(String(fetch.mock.calls[0][0])).searchParams),
    ).toEqual({
      track_name: 'Espresso',
      artist_name: 'Sabrina Carpenter',
      album_name: 'Short n’ Sweet',
      duration: '175',
    });
    await expect(client.getById(0)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
    });
    await expect(client.getExact({ trackName: 'Song' })).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
    });
    await expect(client.search({ artistName: 'Artist' })).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
    });
  });

  it('reports fetch-unavailable when no transport exists', async () => {
    const client = createLrclibClient({ fetch: null });
    await expect(client.getById(42)).resolves.toEqual({
      status: 'error',
      reason: 'fetch-unavailable',
    });
  });

  it('uses q only for an explicit broadened search and validates it', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([completeRecord()])));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
      baseUrl: 'https://lrclib.example.test',
    });

    await expect(
      client.searchBroad({ q: 'Song Artist' }),
    ).resolves.toMatchObject({
      status: 'ok',
      records: [expect.objectContaining({ id: 42 })],
    });
    expect(
      Object.fromEntries(new URL(String(fetch.mock.calls[0][0])).searchParams),
    ).toEqual({
      q: 'Song Artist',
    });
    await expect(client.searchBroad({ q: '  ' })).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
    });
  });

  it('maps an exact 404 to a non-fatal not-found result', async () => {
    const client = createLrclibClient({
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 404 })),
      scheduler: immediateScheduler(),
    });

    await expect(
      client.getExact({ trackName: 'Song', artistName: 'Artist' }),
    ).resolves.toEqual({ status: 'unavailable', reason: 'not-found' });
  });

  it.each([
    [new TypeError('offline'), 'offline'],
    [
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
      'timeout',
    ],
  ])(
    'classifies transport failures without leaking exceptions',
    async (error, reason) => {
      const fetch = vi.fn().mockRejectedValue(error);
      const client = createLrclibClient({
        fetch,
        scheduler: immediateScheduler(),
      });

      await expect(client.getById(42)).resolves.toEqual({
        status: 'error',
        reason,
      });
    },
  );
});
