import { describe, it, expect, vi } from 'vitest';
import { createLyricsAcquisitionService } from './lyricsAcquisitionService.js';
const track = { id: 'track', title: 'Song', artist: 'Artist', duration: 180 };
const empty = {
  status: 'ok',
  candidates: [],
  groups: { best: [], related: [] },
};
function setup(primary = empty) {
  const kugouProvider = {
    searchCandidates: vi
      .fn()
      .mockResolvedValue({ ...empty, provider: 'kugou' }),
    saveCandidate: vi.fn().mockResolvedValue({ status: 'saved' }),
  };
  const neteaseProvider = {
    searchCandidates: vi
      .fn()
      .mockResolvedValue({ provider: 'netease', ...primary }),
  };
  const service = createLyricsAcquisitionService({
    identityResolver: {
      resolve: async () => ({ aliases: { title: [] }, evidence: [] }),
    },
    requireFeatureGate: vi.fn(),
    featureId: 'lyrics-flow',
    client: {
      getExact: vi.fn().mockResolvedValue({ status: 'unavailable' }),
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [],
        invalidRecordCount: 0,
      }),
    },
    neteaseProvider,
    betterLyricsProvider: {
      searchCandidates: vi
        .fn()
        .mockResolvedValue({ ...empty, provider: 'betterlyrics' }),
    },
    kugouProvider,
    logger: { debug() {}, warn() {} },
  });
  return { service, kugouProvider, neteaseProvider };
}
describe('Kugou fallback routing', () => {
  it('cancels an already running fallback immediately when a new intent has a primary result', async () => {
    const { service, kugouProvider, neteaseProvider } = setup();
    let signal;
    kugouProvider.searchCandidates.mockImplementation((_track, options) => {
      signal = options.signal;
      return new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () =>
            resolve({
              provider: 'kugou',
              status: 'error',
              reason: 'cancelled',
              candidates: [],
            }),
          { once: true },
        ),
      );
    });
    const old = service.searchProviderCandidates('all', track);
    await vi.waitFor(() =>
      expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1),
    );
    neteaseProvider.searchCandidates.mockResolvedValue({
      ...empty,
      provider: 'netease',
      candidates: [
        {
          id: 1,
          trackName: 'Other',
          artistName: 'Artist',
          duration: 180,
          capability: { level: 'T1' },
          compatibility: { t1: true },
          previewFingerprint: 'a'.repeat(64),
        },
      ],
    });
    await service.searchProviderCandidates('all', {
      ...track,
      id: 'other',
      title: 'Other',
    });
    expect(signal.aborted).toBe(true);
    expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1);
    await old;
  });
  it('does not allow a direct-source search to bypass primary discovery', async () => {
    const { service, kugouProvider } = setup();
    await expect(
      service.searchProviderCandidates('kugou', track),
    ).rejects.toThrow(/provider/i);
    expect(kugouProvider.searchCandidates).not.toHaveBeenCalled();
  });
  it('waits for every primary and only runs fallback when none is usable', async () => {
    const { service, kugouProvider, neteaseProvider } = setup();
    let resolve;
    neteaseProvider.searchCandidates.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = service.searchProviderCandidates('all', track);
    await Promise.resolve();
    await Promise.resolve();
    expect(kugouProvider.searchCandidates).not.toHaveBeenCalled();
    resolve({ ...empty, provider: 'netease' });
    const result = await pending;
    expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1);
    expect(result.providerStatuses).toContainEqual({
      provider: 'kugou',
      status: 'ok',
    });
  });
  it('does not spend fallback requests when a primary has usable lyrics', async () => {
    const candidate = {
      id: 1,
      trackName: 'Song',
      artistName: 'Artist',
      duration: 180,
      matchBand: 'exact',
      capability: { level: 'T1' },
      compatibility: { t0: true, t1: true },
      previewFingerprint: 'a'.repeat(64),
    };
    const { service, kugouProvider } = setup({
      ...empty,
      candidates: [candidate],
    });
    const result = await service.searchProviderCandidates('all', track);
    expect(result.candidates).toHaveLength(1);
    expect(kugouProvider.searchCandidates).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'error', reason: 'rate-limited', candidates: [] },
    { ...empty, reason: 'cancelled', status: 'error' },
  ])('handles primary failure %j', async (primary) => {
    const { service, kugouProvider } = setup(primary);
    await service.searchProviderCandidates('all', track);
    expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(
      primary.reason === 'cancelled' ? 0 : 1,
    );
  });
  it('routes manual save through the same service/gate instead of automatic save', async () => {
    const { service, kugouProvider } = setup();
    await service.saveProviderCandidate('kugou', {
      track,
      trackDir: 'unused',
      candidateId: 1,
      expectedFingerprint: 'a'.repeat(64),
    });
    expect(kugouProvider.saveCandidate).toHaveBeenCalledTimes(1);
  });
  it('does not launch fallback for an older all-source query that completes after a new intent', async () => {
    const { service, kugouProvider, neteaseProvider } = setup();
    let resolve;
    neteaseProvider.searchCandidates
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValue({ ...empty, provider: 'netease' });
    const old = service.searchProviderCandidates('all', track);
    await Promise.resolve();
    await service.searchProviderCandidates('all', {
      ...track,
      id: 'other',
      title: 'Other',
    });
    expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1);
    resolve({ ...empty, provider: 'netease' });
    await old;
    expect(kugouProvider.searchCandidates).toHaveBeenCalledTimes(1);
  });
});
