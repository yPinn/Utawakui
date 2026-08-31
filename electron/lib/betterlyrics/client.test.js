import { describe, expect, it, vi } from 'vitest';

import {
  buildBetterLyricsUrl,
  createBetterLyricsClient,
  createBetterLyricsScheduler,
} from './client.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s" end="2s">Song</p></body></tt>`;

function response(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'x-cache-status': 'HIT',
      'x-provider': 'ttml',
      ...(options.headers || {}),
    },
  });
}

describe('Better Lyrics cache-first client', () => {
  it('builds the documented fixed-origin query without credentials', () => {
    expect(
      String(
        buildBetterLyricsUrl({
          trackName: 'Shape of You',
          artistName: 'Ed Sheeran',
          albumName: 'Divide',
          duration: 234.4,
        }),
      ),
    ).toBe(
      'https://lyrics-api.boidu.dev/getLyrics?s=Shape+of+You&a=Ed+Sheeran&al=Divide&d=234',
    );
  });

  it('normalizes a bounded cache hit and never sends an API key', async () => {
    const fetch = vi.fn(async () => response({ ttml: TTML, score: 95 }));
    const client = createBetterLyricsClient({
      fetch,
      scheduler: { schedule: (task) => task() },
    });

    await expect(
      client.getLyrics({
        trackName: 'Song',
        artistName: 'Singer',
        duration: 5,
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      record: {
        trackName: 'Song',
        artistName: 'Singer',
        duration: 5,
        ttml: TTML,
        score: 95,
        cacheStatus: 'HIT',
      },
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-API-Key');
  });

  it('accepts the production cache response when optional score and provider header are absent', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ttml: TTML }), {
          headers: {
            'content-type': 'application/json',
            'x-cache-status': 'HIT',
          },
        }),
    );
    const client = createBetterLyricsClient({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    const result = await client.getLyrics({
      trackName: 'Song',
      artistName: 'Singer',
      duration: 5,
    });
    expect(result).toMatchObject({
      status: 'ok',
      record: { cacheStatus: 'HIT', ttml: TTML },
    });
    expect(result.record).not.toHaveProperty('score');
  });

  it.each([
    [401, 'cache-miss'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [502, 'service-unavailable'],
  ])('maps HTTP %s to %s', async (status, reason) => {
    const client = createBetterLyricsClient({
      fetch: async () => response({ error: 'bounded' }, { status }),
      scheduler: { schedule: (task) => task() },
    });
    await expect(
      client.getLyrics({
        trackName: 'Song',
        artistName: 'Singer',
        duration: 5,
      }),
    ).resolves.toMatchObject({
      status: status === 401 || status === 404 ? 'unavailable' : 'error',
      reason,
    });
  });

  it('fails closed when fetch is unavailable or the network throws', async () => {
    const query = { trackName: 'Song', artistName: 'Singer', duration: 5 };
    await expect(
      createBetterLyricsClient({ fetch: null }).getLyrics(query),
    ).resolves.toEqual({ status: 'error', reason: 'fetch-unavailable' });
    await expect(
      createBetterLyricsClient({
        fetch: async () => {
          throw new TypeError('network');
        },
        scheduler: { schedule: (task) => task() },
      }).getLyrics(query),
    ).resolves.toEqual({ status: 'error', reason: 'offline' });
  });

  it('serializes provider starts and rejects an already aborted task', async () => {
    let currentTime = 100;
    const sleep = vi.fn(async (milliseconds) => {
      currentTime += milliseconds;
    });
    const scheduler = createBetterLyricsScheduler({
      minimumIntervalMs: 25,
      now: () => currentTime,
      sleep,
    });
    await scheduler.schedule(async () => 'first');
    await scheduler.schedule(async () => 'second');
    expect(sleep).toHaveBeenCalledWith(25, undefined);

    const controller = new AbortController();
    controller.abort(new DOMException('stopped', 'AbortError'));
    await expect(
      scheduler.schedule(async () => 'never', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it.each([
    null,
    {},
    { trackName: 'Song', artistName: '', duration: 5 },
    { trackName: 'Song\nOther', artistName: 'Singer', duration: 5 },
    { trackName: 'Song', artistName: 'Singer', duration: 0 },
    { trackName: 'Song', artistName: 'Singer', duration: 5, apiKey: 'secret' },
  ])(
    'rejects unsafe or incomplete requests without fetching: %j',
    async (query) => {
      const fetch = vi.fn();
      const client = createBetterLyricsClient({ fetch });
      await expect(client.getLyrics(query)).resolves.toEqual({
        status: 'error',
        reason: 'invalid-request',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('fails closed for malformed payloads, provider headers, and oversized bodies', async () => {
    const responses = [
      new Response('{', { status: 200 }),
      response({ ttml: TTML, score: 101 }),
      response(
        { ttml: TTML, score: 95 },
        { headers: { 'x-provider': 'other' } },
      ),
      new Response('{}', {
        headers: {
          'content-length': String(5 * 1024 * 1024),
          'x-cache-status': 'HIT',
          'x-provider': 'ttml',
        },
      }),
    ];
    const client = createBetterLyricsClient({
      fetch: vi.fn(async () => responses.shift()),
      scheduler: { schedule: (task) => task() },
    });
    const query = { trackName: 'Song', artistName: 'Singer', duration: 5 };
    await expect(client.getLyrics(query)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-json',
    });
    await expect(client.getLyrics(query)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
    await expect(client.getLyrics(query)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
    await expect(client.getLyrics(query)).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
    });
  });
});
