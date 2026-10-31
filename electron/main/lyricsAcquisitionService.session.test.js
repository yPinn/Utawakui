import { expect, it, vi } from 'vitest';
import { createLyricsAcquisitionService } from './lyricsAcquisitionService.js';
import { createLyricsIdentityResolver } from '../lib/lyricsProviders/identityResolver.js';
import { createKugouAcquisitionProvider } from '../lib/kugou/acquisition.js';
import { createKugouClient } from '../lib/kugou/client.js';
const track = {
  id: 'hana',
  title: 'Hana No Uta',
  artist: 'Aimer',
  duration: 371,
};
const original = {
  trackId: 12,
  artistId: 34,
  artistName: 'Aimer',
  trackName: 'Hana No Uta',
  trackTimeMillis: 371427,
};
const miss = (provider) => ({
  searchCandidates: vi.fn(async () => ({
    provider,
    status: 'ok',
    candidates: [],
    groups: { best: [], related: [] },
  })),
});
it('skips alias and fallback HTTP while an essential Kugou endpoint is cooling down', async () => {
  const kugouProvider = {
    ...miss('kugou'),
    availability: () => ({
      status: 'error',
      reason: 'rate-limited',
      httpStatus: 429,
      requestSource: 'cooldown',
    }),
  };
  const identityResolver = { resolve: vi.fn() };
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    client: { search: async () => ({ status: 'ok', records: [] }) },
    neteaseProvider: miss('netease'),
    betterLyricsProvider: miss('betterlyrics'),
    kugouProvider,
    identityResolver,
    logger: { debug() {}, warn() {} },
  });
  const result = await service.searchProviderCandidates('all', track);
  expect(identityResolver.resolve).not.toHaveBeenCalled();
  expect(kugouProvider.searchCandidates).not.toHaveBeenCalled();
  expect(result.providerStatuses).toContainEqual(
    expect.objectContaining({ provider: 'kugou', reason: 'rate-limited' }),
  );
});
it('rechecks the feature gate after the asynchronous alias phase', async () => {
  let enabled = true;
  const kugouProvider = miss('kugou');
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {
      if (!enabled) throw new Error('disabled');
    },
    client: { search: async () => ({ status: 'ok', records: [] }) },
    neteaseProvider: miss('netease'),
    betterLyricsProvider: miss('betterlyrics'),
    kugouProvider,
    identityResolver: {
      resolve: async () => {
        enabled = false;
        return { aliases: { title: [] } };
      },
    },
    logger: { debug() {}, warn() {} },
  });
  await expect(service.searchProviderCandidates('all', track)).rejects.toThrow(
    'disabled',
  );
  expect(kugouProvider.searchCandidates).not.toHaveBeenCalled();
});
it('reserves three fallback requests even when broadening exhausts both earlier stages', async () => {
  const consume = (budget, limit) => {
    let count = 0;
    try {
      for (; count < limit; count++) budget.consume();
    } catch {
      /* source cap is expected */
    }
    return count;
  };
  const neteaseProvider = miss('netease');
  let neteaseRequests = 0;
  neteaseProvider.searchCandidates.mockImplementation(
    async (_track, { budget }) => {
      neteaseRequests = consume(budget, 2);
      return { provider: 'netease', status: 'ok', candidates: [] };
    },
  );
  const betterLyricsProvider = miss('betterlyrics');
  betterLyricsProvider.searchCandidates.mockImplementation(
    async (_track, { budget }) => {
      consume(budget, 1);
      return { provider: 'betterlyrics', status: 'ok', candidates: [] };
    },
  );
  let fallbackRequests = 0;
  const kugouProvider = miss('kugou');
  kugouProvider.searchCandidates.mockImplementation(
    async (_track, { budget }) => {
      fallbackRequests = consume(budget, 3);
      return { provider: 'kugou', status: 'ok', candidates: [] };
    },
  );
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    logger: { debug() {}, warn() {} },
    neteaseProvider,
    betterLyricsProvider,
    kugouProvider,
    client: {
      search: async (_query, { budget }) => {
        consume(budget, 1);
        return { status: 'ok', records: [] };
      },
    },
    identityResolver: {
      resolve: async (_track, { budget }) => {
        consume(budget, 2);
        return { aliases: { title: [] } };
      },
    },
  });
  await service.searchProviderCandidates('all', track, { mode: 'broaden' });
  expect(neteaseRequests).toBe(2);
  expect(fallbackRequests).toBe(3);
});
it('automatically rescues the unedited title through catalog evidence and keeps its save identity', async () => {
  const fetch = vi.fn(async (url) => {
    url = new URL(url);
    let body;
    if (url.hostname === 'itunes.apple.com')
      body = {
        results:
          url.pathname === '/search'
            ? [original]
            : [{ ...original, trackName: '花の唄' }],
      };
    else if (url.hostname === 'mobileservice.kugou.com')
      body = {
        data: {
          info: [
            {
              hash: 'a'.repeat(32),
              songname: '花の唄',
              singername: 'Aimer',
              duration: 373,
            },
          ],
        },
      };
    else if (url.pathname === '/search')
      body = {
        candidates: [
          { id: '123', accesskey: 'private', duration: 373000, lrcid: 0 },
        ],
      };
    else
      body = {
        content: Buffer.from(
          '[ti:花の唄]\n[ar:Aimer]\n[00:01]First\n[00:02]Second',
        ).toString('base64'),
      };
    return new Response(JSON.stringify(body));
  });
  const options = { fetch, scheduler: { schedule: (start) => start() } };
  const persistRecord = vi.fn().mockReturnValue({ status: 'saved' });
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    featureId: 'lyrics-flow',
    logger: { debug() {}, warn() {} },
    client: { search: vi.fn(async () => ({ status: 'ok', records: [] })) },
    neteaseProvider: miss('netease'),
    betterLyricsProvider: miss('betterlyrics'),
    identityResolver: createLyricsIdentityResolver(options),
    kugouProvider: createKugouAcquisitionProvider({
      client: createKugouClient(options),
      persistRecord,
    }),
  });
  const result = await service.searchProviderCandidates('all', track);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates[0]).toMatchObject({
    providerId: 'kugou',
    trackName: '花の唄',
    capability: { level: 'T1' },
  });
  expect(fetch.mock.calls.length).toBeLessThanOrEqual(7);
  const chosen = result.candidates[0];
  await service.saveProviderCandidate('kugou', {
    track,
    trackDir: 'unused',
    candidateId: chosen.id,
    expectedFingerprint: chosen.previewFingerprint,
  });
  expect(persistRecord).toHaveBeenCalledTimes(1);
  expect(track.title).toBe('Hana No Uta');
});
it('reserves fallback after primary exhaustion and retains T0 instead of allowing it to block T1', async () => {
  const neteaseProvider = miss('netease');
  neteaseProvider.searchCandidates.mockImplementation(
    async (_track, { budget }) => {
      let denied = false;
      try {
        for (let i = 0; i < 10; i++) budget.consume();
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
      return {
        provider: 'netease',
        status: 'ok',
        candidates: [
          {
            id: 1,
            trackName: track.title,
            artistName: track.artist,
            duration: 371,
            capability: { level: 'T0' },
            compatibility: { t0: true },
          },
        ],
      };
    },
  );
  const kugouProvider = miss('kugou');
  kugouProvider.searchCandidates.mockImplementation(
    async (_track, { budget }) => {
      for (let i = 0; i < 3; i++) budget.consume();
      return { provider: 'kugou', status: 'ok', candidates: [] };
    },
  );
  const service = createLyricsAcquisitionService({
    requireFeatureGate() {},
    identityResolver: { resolve: async () => ({ aliases: { title: [] } }) },
    client: { search: async () => ({ status: 'ok', records: [] }) },
    neteaseProvider,
    betterLyricsProvider: miss('betterlyrics'),
    kugouProvider,
    logger: { debug() {}, warn() {} },
  });
  const result = await service.searchProviderCandidates('all', track);
  expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1);
  expect(result.candidates).toHaveLength(1);
});
