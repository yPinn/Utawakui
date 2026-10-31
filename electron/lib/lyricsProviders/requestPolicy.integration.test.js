import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchLrclibCandidates } from '../lrclib/acquisition.js';
import { createLrclibClient } from '../lrclib/client.js';
import { createNeteaseClient } from '../netease/client.js';
import { createNeteaseAcquisitionProvider } from '../netease/acquisition.js';
import { createBetterLyricsClient } from '../betterlyrics/client.js';
import { createBetterLyricsAcquisitionProvider } from '../betterlyrics/acquisition.js';
import { createLyricsAcquisitionService as createService } from '../../main/lyricsAcquisitionService.js';
import { createLyricsRequestBudget } from './requestPolicy.js';
import { createKugouClient } from '../kugou/client.js';
import { createKugouAcquisitionProvider } from '../kugou/acquisition.js';

function lrclibRecord(overrides = {}) {
  return {
    id: 42,
    trackName: '月面着陸計画 - Moon Landing Plan',
    artistName: 'tuki.',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello',
    syncedLyrics: null,
    lyricsfile: null,
    ...overrides,
  };
}
function immediateScheduler() {
  return { schedule: (task) => task(), deferFor() {} };
}
function response(value) {
  return new Response(JSON.stringify(value));
}

afterEach(() => vi.useRealTimers());

describe('lyrics query policy integration', () => {
  it.each(['lrclib', 'netease', 'kugou'])(
    'honors a superseding intent with a supplied parent budget: %s',
    async (provider) => {
      const fetch = vi.fn(async () =>
        response(
          provider === 'lrclib'
            ? []
            : { code: 200, result: { songs: [] }, data: { info: [] } },
        ),
      );
      const budget = createLyricsRequestBudget(provider);
      const controller = new AbortController();
      controller.abort();
      const track = { title: 'Song', artist: 'Artist', duration: 180 };
      const request = { budget, signal: controller.signal };
      const options = { fetch, scheduler: immediateScheduler() };
      try {
        const result =
          provider === 'lrclib'
            ? await searchLrclibCandidates(track, {
                ...request,
                client: createLrclibClient(options),
              })
            : provider === 'netease'
              ? await createNeteaseAcquisitionProvider({
                  client: createNeteaseClient(options),
                }).searchCandidates(track, request)
              : await createKugouAcquisitionProvider({
                  client: createKugouClient(options),
                }).searchCandidates(track, request);
        expect(result.reason).toBe('cancelled');
        expect(fetch).not.toHaveBeenCalled();
        expect(budget.attempts).toBe(0);
      } finally {
        budget.dispose();
      }
    },
  );
  it('reports an overloaded primary with alternate misses and recovers the same query without restarting', async () => {
    // Observed failure combination: LRCLIB 503/Retry-After:1, NetEase 200
    // without a matching recording, Better Lyrics 401/cache-miss.
    let time = 1000;
    let recovered = false;
    const track = {
      id: 'live-failure-regression',
      title: 'Closer to You (feat. Major Lazer)',
      artist: '정국 (Jung Kook), Major Lazer',
      duration: 171,
    };
    const starts = [];
    const fetch = vi.fn(async (url) => {
      starts.push({ origin: url.origin, time });
      if (url.origin === 'https://lrclib.net') {
        if (!recovered) {
          return new Response('private provider body', {
            status: 503,
            headers: { 'Retry-After': '1' },
          });
        }
        return response([
          lrclibRecord({
            trackName: track.title,
            artistName: track.artist,
            duration: track.duration,
            syncedLyrics: '[00:01]Regression fixture',
          }),
        ]);
      }
      if (url.origin === 'https://interface.music.163.com') {
        expect(url.pathname).toBe('/api/cloudsearch/pc');
        return response({
          code: 200,
          result: {
            songs: [
              {
                id: 1,
                name: 'Closer to You',
                ar: [{ name: 'Other Artist' }],
                dt: 259833,
              },
            ],
          },
        });
      }
      expect(url.origin).toBe('https://lyrics-api.boidu.dev');
      return new Response(null, { status: 401 });
    });
    const options = {
      fetch,
      now: () => time,
      wait: async (ms) => {
        time += ms;
      },
    };
    const logger = { debug: vi.fn(), warn: vi.fn() };
    const service = createLyricsAcquisitionService({
      client: createLrclibClient(options),
      neteaseProvider: createNeteaseAcquisitionProvider({
        client: createNeteaseClient(options),
      }),
      betterLyricsProvider: createBetterLyricsAcquisitionProvider({
        client: createBetterLyricsClient(options),
      }),
      featureId: 'lyrics-flow',
      requireFeatureGate: vi.fn(),
      now: options.now,
      logger,
    });
    const query = { title: track.title, artist: track.artist };
    const failed = await service.searchProviderCandidates('all', track, {
      query,
    });
    expect(failed).toMatchObject({
      status: 'ok',
      partial: true,
      candidates: [],
      providerStatuses: expect.arrayContaining([
        { provider: 'lrclib', status: 'error', reason: 'service-unavailable' },
        { provider: 'netease', status: 'ok' },
        {
          provider: 'betterlyrics',
          status: 'unavailable',
          reason: 'cache-miss',
        },
      ]),
    });
    expect(
      starts
        .filter(({ origin }) => origin === 'https://lrclib.net')
        .map(({ time }) => time),
    ).toEqual([1000]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][2]).toMatchObject({
      reason: 'service-unavailable',
      httpStatus: 503,
      stage: 'network',
    });
    expect(JSON.stringify(failed)).not.toContain('private provider body');

    time += 1000;
    recovered = true;
    const retry = await service.searchProviderCandidates('all', track, {
      query,
    });
    expect(retry.candidates).toHaveLength(1);
    expect(retry.candidates[0]).toMatchObject({
      providerId: 'lrclib',
      trackName: track.title,
    });
    // An expected cache miss still marks the aggregate incomplete; only real
    // provider errors produce the UI warning. Recovery must clear that error.
    expect(retry.providerStatuses).toContainEqual({
      provider: 'lrclib',
      status: 'ok',
    });
    expect(
      retry.providerStatuses.some(({ status }) => status === 'error'),
    ).toBe(false);
    expect(
      starts.filter(({ origin }) => origin === 'https://lrclib.net'),
    ).toHaveLength(2);
    // A normal alternate miss can be cached, but neither the 503 nor the
    // aggregate partial result may hide a later successful primary response.
    expect(
      starts.filter(
        ({ origin }) => origin === 'https://interface.music.163.com',
      ),
    ).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
  it('expires a queued operation without spending attempts or waiting for the active HTTP request', async () => {
    vi.useFakeTimers();
    let release;
    const fetch = vi.fn(async () => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return response(lrclibRecord());
    });
    const client = createLrclibClient({ fetch });
    const first = client.getExact({ trackName: 'First', artistName: 'Singer' });
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toBeTypeOf('function');
    const budget = createLyricsRequestBudget('lrclib', { timeoutMs: 10 });
    const queued = client.getExact(
      { trackName: 'Second', artistName: 'Singer' },
      { budget },
    );
    await vi.advanceTimersByTimeAsync(11);
    await expect(queued).resolves.toMatchObject({ reason: 'timeout' });
    expect(budget.attempts).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    release();
    await first;
    budget.dispose();
  });
  it('does not debit actual attempts for a local cooldown response', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429 }));
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
    });
    const first = createLyricsRequestBudget('lrclib');
    const second = createLyricsRequestBudget('lrclib');
    await client.search({ trackName: 'One' }, { budget: first });
    await expect(
      client.search({ trackName: 'Two' }, { budget: second }),
    ).resolves.toMatchObject({
      reason: 'rate-limited',
      requestSource: 'cooldown',
    });
    expect(first.attempts).toBe(1);
    expect(second.attempts).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    first.dispose();
    second.dispose();
  });
  it('reuses an in-flight endpoint when Main supersedes a track with equivalent query inputs', async () => {
    let finish;
    const fetch = vi.fn(async () => {
      await new Promise((resolve) => {
        finish = resolve;
      });
      return response([
        lrclibRecord({
          trackName: 'Song',
          artistName: 'Artist',
          syncedLyrics: '[00:01]Hello',
        }),
      ]);
    });
    const client = createLrclibClient({
      fetch,
      scheduler: immediateScheduler(),
    });
    const service = createLyricsAcquisitionService({
      client,
      featureId: 'lyrics-flow',
      requireFeatureGate: vi.fn(),
      logger: { debug() {}, warn() {} },
    });
    const first = service.searchCandidates({
      id: 'one',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const second = service.searchCandidates({
      id: 'two',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    await expect(first).resolves.toMatchObject({ reason: 'cancelled' });
    finish();
    await expect(second).resolves.toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not let one client acquisition signal cancel another subscriber', async () => {
    let finish;
    let signal;
    const controller = new AbortController();
    const fetch = vi.fn(async (_url, init) => {
      signal = init.signal;
      await new Promise((resolve) => {
        finish = resolve;
      });
      return response(lrclibRecord());
    });
    const options = { fetch, scheduler: immediateScheduler() };
    const one = createLrclibClient({ ...options, signal: controller.signal });
    const two = createLrclibClient(options);
    const query = { trackName: 'Song', artistName: 'Artist' };
    const first = one.getExact(query);
    const second = two.getExact(query);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    controller.abort();
    await expect(first).resolves.toMatchObject({ reason: 'cancelled' });
    expect(signal.aborted).toBe(false);
    finish();
    await expect(second).resolves.toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('charges retries to the same initial search budget and retains the first valid preview', async () => {
    let time = 1000;
    const scheduler = {
      schedule: (task) => task(),
      deferFor: (ms) => {
        time += ms;
      },
    };
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => response([lrclibRecord()]))
      .mockImplementation(
        async () =>
          new Response(null, { status: 503, headers: { 'Retry-After': '1' } }),
      );
    const client = createLrclibClient({ fetch, scheduler, now: () => time });
    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 180,
      },
      { client },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'request-budget-exhausted',
    });
    expect(result.candidates).toHaveLength(1);
  });

  it('shares the sustained rate across actual client instances and counts cached discovery as zero network work', async () => {
    let time = 0;
    const starts = [];
    const fetch = vi.fn(async () => {
      starts.push(time);
      return response([lrclibRecord()]);
    });
    const options = {
      fetch,
      now: () => time,
      wait: async (ms) => {
        time += ms;
      },
    };
    const one = createLrclibClient(options);
    const two = createLrclibClient(options);
    await Promise.all([
      one.search({ trackName: 'First' }),
      two.search({ trackName: 'Second' }),
      one.search({ trackName: 'Third' }),
    ]);
    expect(starts).toEqual([0, 1000, 2000]);
    await two.search({ trackName: 'First' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('bounds NetEase hydration attempts instead of fetching every unusable match', async () => {
    const songs = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: 'Song',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album' },
      dt: 180000,
      alia: [],
      tns: [],
    }));
    const fetch = vi.fn(async (url, init) => {
      if (url.pathname.includes('cloudsearch'))
        return response({ code: 200, result: { songs } });
      const id = Number(init.body.get('id'));
      return response({
        code: 200,
        lrc: { lyric: id <= 2 ? `[00:01]Line ${id}` : '' },
      });
    });
    const client = createNeteaseClient({
      fetch,
      scheduler: immediateScheduler(),
    });
    const provider = createNeteaseAcquisitionProvider({ client });
    const result = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(result).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'request-budget-exhausted',
    });
    expect(result.candidates).toHaveLength(2);
  });

  it('stops all subsequent NetEase stages on a rate limit and retains earlier lyrics', async () => {
    const songs = [1, 2, 3].map((id) => ({
      id,
      name: 'Song',
      ar: [{ name: 'Artist' }],
      dt: 180000,
      alia: [],
      tns: [],
    }));
    const fetch = vi.fn(async (url, init) => {
      if (url.pathname.includes('cloudsearch'))
        return response({ code: 200, result: { songs } });
      if (init.body.get('id') === '1')
        return response({ code: 200, lrc: { lyric: '[00:01]Hello' } });
      return new Response(null, { status: 429 });
    });
    const provider = createNeteaseAcquisitionProvider({
      client: createNeteaseClient({ fetch, scheduler: immediateScheduler() }),
    });
    const result = await provider.searchCandidates(
      { title: 'Song', artist: 'Artist', duration: 180 },
      { mode: 'broaden' },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'rate-limited',
    });
    expect(result.candidates).toHaveLength(1);
  });
});

// Older primary-provider regressions never perform live fallback traffic.
function createLyricsAcquisitionService(options) {
  return createService({
    automaticIntervalMs: 0,
    identityResolver: {
      resolve: async () => ({ aliases: { title: [] }, evidence: [] }),
    },
    kugouProvider: {
      searchCandidates: async () => ({
        provider: 'kugou',
        status: 'ok',
        candidates: [],
        groups: { best: [], related: [] },
      }),
    },
    ...options,
  });
}
