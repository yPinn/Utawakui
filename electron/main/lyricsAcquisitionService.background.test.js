import { expect, it, vi } from 'vitest';
import { createLyricsAcquisitionService } from './lyricsAcquisitionService.js';
import { createLrclibClient } from '../lib/lrclib/client.js';
import { createNeteaseClient } from '../lib/netease/client.js';
import { createNeteaseAcquisitionProvider } from '../lib/netease/acquisition.js';
it('counts discovery and fresh saves together while a batch stays below source background caps', async () => {
  let time = 0;
  const requests = [];
  const summaries = [];
  const fetch = vi.fn(async (url, init) => {
    requests.push({ host: new URL(url).hostname, time });
    if (new URL(url).hostname === 'lrclib.net')
      return new URL(url).pathname === '/api/get'
        ? new Response(null, { status: 404 })
        : new Response('[]');
    const lyric = new URL(url).pathname.includes('/lyric/');
    const fields = new URLSearchParams(init.body);
    const title = fields.get('s')?.split(' Artist')[0];
    return new Response(
      JSON.stringify(
        lyric
          ? { code: 200, lrc: { lyric: '[00:01]One\n[00:02]Two' } }
          : {
              code: 200,
              result: {
                songs: [
                  {
                    id: Number(title.match(/\d+/u)[0]) + 1,
                    name: title,
                    ar: [{ name: 'Artist' }],
                    dt: 180000,
                  },
                ],
              },
            },
      ),
    );
  });
  const options = {
    fetch,
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
  };
  const persistRecord = vi.fn(() => ({
    status: 'saved',
    source: { filename: 'local.lrc' },
  }));
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    client: createLrclibClient(options),
    neteaseProvider: createNeteaseAcquisitionProvider({
      client: createNeteaseClient(options),
      persistRecord,
    }),
    now: () => time,
    automaticWait: options.wait,
    isTrackCurrent: () => true,
    setAutomaticPreference() {},
    logger: {
      warn() {},
      debug(message, data) {
        if (message === '[lyrics] background acquisition timing')
          summaries.push(data);
      },
    },
  });
  const results = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      service.acquireBestIfNeeded(
        {
          id: `synthetic-${i}`,
          title: `Song ${i}`,
          artist: 'Artist',
          duration: 180,
        },
        `synthetic-${i}`,
      ),
    ),
  );
  expect(results.every((result) => result.status === 'saved')).toBe(true);
  expect(persistRecord).toHaveBeenCalledTimes(4);
  expect(summaries.map((summary) => summary.httpAttempts)).toEqual([
    5, 5, 5, 5,
  ]);
  expect(requests).toHaveLength(20);
  for (const host of new Set(requests.map((request) => request.host))) {
    const starts = requests
      .filter((request) => request.host === host)
      .map((request) => request.time);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(5000);
    for (const start of starts)
      expect(
        starts.filter((time) => time >= start && time < start + 60000).length,
      ).toBeLessThanOrEqual(12);
  }
});
it('spaces different background tracks by thirty seconds and deduplicates queued jobs', async () => {
  let time = 0;
  const starts = [];
  const client = {
    getExact: vi.fn(async () => {
      starts.push(time);
      return { status: 'unavailable', reason: 'not-found' };
    }),
    search: async () => ({ status: 'ok', records: [] }),
  };
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    client,
    now: () => time,
    automaticWait: async (ms) => {
      time += ms;
    },
    isTrackCurrent: () => true,
    neteaseProvider: {
      searchCandidates: async () => ({
        provider: 'netease',
        status: 'ok',
        candidates: [],
      }),
    },
    logger: { debug() {}, warn() {} },
  });
  const track = (id) => ({
    id,
    title: 'Song',
    artist: 'Artist',
    duration: 180,
  });
  const first = service.acquireBestIfNeeded(track('a'), 'a');
  const second = service.acquireBestIfNeeded(track('b'), 'b');
  const duplicate = service.acquireBestIfNeeded(track('b'), 'b');
  expect(second).toBe(duplicate);
  const third = service.acquireBestIfNeeded(track('c'), 'c');
  await Promise.all([first, second, third]);
  expect(starts).toEqual([0, 30000, 60000]);
});
it('bounds the background backlog rather than enqueueing an entire unbounded library', async () => {
  let release;
  const client = {
    getExact: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    search: async () => ({ status: 'ok', records: [] }),
  };
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    client,
    automaticIntervalMs: 0,
    isTrackCurrent: () => true,
    neteaseProvider: {
      searchCandidates: async () => ({
        provider: 'netease',
        status: 'ok',
        candidates: [],
      }),
    },
    logger: { debug() {}, warn() {} },
  });
  const operations = Array.from({ length: 34 }, (_, i) =>
    service.acquireBestIfNeeded(
      { id: `track-${i}`, title: 'Song', artist: 'Artist', duration: 180 },
      `track-${i}`,
    ),
  );
  await expect(operations[33]).resolves.toMatchObject({
    status: 'skipped',
    reason: 'background-queue-full',
  });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  // Invalidate queued tracks so finishing the first cannot launch more I/O.
  for (let i = 1; i < 33; i++)
    service.invalidateAutomaticAcquisition(`track-${i}`);
  release({ status: 'unavailable', reason: 'not-found' });
  await Promise.all(operations);
});
