import { describe, expect, it, vi } from 'vitest';
import { createNeteaseClient } from './client.js';

function responseBody(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function song(overrides = {}) {
  return {
    id: 42,
    name: 'Song',
    ar: [{ name: 'Artist' }],
    al: { name: 'Album' },
    dt: 180000,
    alia: [],
    tns: [],
    ...overrides,
  };
}

function immediateScheduler() {
  return { schedule: vi.fn((operation) => operation()) };
}

describe('createNeteaseClient', () => {
  it('uses only fixed HTTPS POST routes without cookies or redirects', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        responseBody({ code: 200, result: { songs: [song()] } }),
      )
      .mockResolvedValueOnce(
        responseBody({
          code: 200,
          yrc: { lyric: '[1000,1000](1000,1000,0)Word' },
          lrc: { lyric: '[00:01.000]Word' },
        }),
      );
    const client = createNeteaseClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(
      client.search({ trackName: 'Song', artistName: 'Artist' }),
    ).resolves.toMatchObject({ status: 'ok', records: [{ id: 42 }] });
    await expect(client.getLyrics(42)).resolves.toMatchObject({
      status: 'ok',
      record: {
        id: 42,
        yrcLyrics: '[1000,1000](1000,1000,0)Word',
        lrcLyrics: '[00:01.000]Word',
      },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://interface.music.163.com/api/cloudsearch/pc',
      'https://interface.music.163.com/api/song/lyric/v1',
    ]);
    for (const [, request] of fetch.mock.calls) {
      expect(request).toMatchObject({ method: 'POST', redirect: 'error' });
      expect(request.headers.Cookie).toBeUndefined();
      expect(request.headers.cookie).toBeUndefined();
      expect(request.credentials).toBeUndefined();
    }
  });

  it('validates renderer-derived queries before issuing a provider request', async () => {
    const fetch = vi.fn();
    const client = createNeteaseClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(
      client.search({ trackName: '', artistName: 'Artist' }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-request' });
    await expect(
      client.search({ trackName: 'Song\nInjected', artistName: 'Artist' }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-request' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized, invalid JSON and redirect responses with bounded errors', async () => {
    const oversized = createNeteaseClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response('small', { headers: { 'Content-Length': '9999' } }),
        ),
      scheduler: immediateScheduler(),
      maxResponseBytes: 100,
    });
    await expect(oversized.getLyrics(42)).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
    });

    const invalid = createNeteaseClient({
      fetch: vi.fn().mockResolvedValue(new Response('{invalid')),
      scheduler: immediateScheduler(),
    });
    await expect(invalid.getLyrics(42)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-json',
    });

    const redirected = createNeteaseClient({
      fetch: vi.fn().mockRejectedValue(new TypeError('redirect blocked')),
      scheduler: immediateScheduler(),
    });
    await expect(redirected.getLyrics(42)).resolves.toEqual({
      status: 'error',
      reason: 'offline',
    });
  });

  it('drops malformed search records and rejects malformed lyric bodies', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        responseBody({
          code: 200,
          result: { songs: [song(), song({ id: 'unsafe' })] },
        }),
      )
      .mockResolvedValueOnce(
        responseBody({ code: 200, yrc: { lyric: 42 }, lrc: { lyric: '' } }),
      );
    const client = createNeteaseClient({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(client.search({ trackName: 'Song' })).resolves.toMatchObject({
      status: 'ok',
      invalidRecordCount: 1,
      records: [expect.objectContaining({ id: 42 })],
    });
    await expect(client.getLyrics(42)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
  });
});
