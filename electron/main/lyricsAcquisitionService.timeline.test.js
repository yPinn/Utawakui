import { describe, expect, it, vi } from 'vitest';
import { createLyricsAcquisitionService as createService } from './lyricsAcquisitionService.js';
import { createNeteaseAcquisitionProvider } from '../lib/netease/acquisition.js';

describe('timeline information in the existing acquisition service', () => {
  it('keeps a changed NetEase preview when an older structured hydration finishes after the save', async () => {
    const track = {
      id: 'local-track',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    };
    const metadata = {
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      albumName: '',
      duration: 180,
      artists: ['Artist'],
      aliases: [],
      translatedTitles: [],
    };
    const lyrics = (offset) => ({
      status: 'ok',
      record: {
        id: 42,
        lrcLyrics: `[00:${offset}.000]Unique first phrase`,
        yrcLyrics: '',
      },
    });
    let finishSave, finishOldSearch;
    const client = {
      search: vi.fn(async () => ({
        status: 'ok',
        records: [metadata],
        invalidRecordCount: 0,
      })),
      getLyrics: vi
        .fn()
        .mockResolvedValueOnce(lyrics(12))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishSave = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishOldSearch = resolve;
            }),
        ),
    };
    const persistRecord = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      neteaseProvider: createNeteaseAcquisitionProvider({
        client,
        persistRecord,
      }),
      logger: { debug: vi.fn() },
    });
    const initial = await service.searchProviderCandidates('netease', track, {
      mode: 'broaden',
    });
    const save = service.saveProviderCandidate('netease', {
      track,
      trackDir: 'unused-no-persist',
      candidateId: 42,
      expectedFingerprint: initial.candidates[0].previewFingerprint,
    });
    await vi.waitFor(() => expect(finishSave).toBeTypeOf('function'));
    const oldSearch = service.searchProviderCandidates('netease', track);
    await vi.waitFor(() => expect(finishOldSearch).toBeTypeOf('function'));
    finishSave(lyrics(10));
    const changed = await save;
    expect(changed.status).toBe('record-changed');
    finishOldSearch(lyrics(12));
    await oldSearch;
    const refreshed = await service.searchProviderCandidates('netease', track, {
      mode: 'broaden',
    });
    expect(refreshed.candidates[0].previewFingerprint).toBe(
      changed.candidate.previewFingerprint,
    );
    expect(refreshed.candidates[0].previewFingerprint).not.toBe(
      initial.candidates[0].previewFingerprint,
    );
    expect(client.getLyrics).toHaveBeenCalledTimes(3);
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('does not let an invalidated in-flight search repopulate cache or remove its replacement', async () => {
    const track = {
      id: 'local-track',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    };
    const oldRecord = {
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      albumName: '',
      duration: 180,
      instrumental: false,
      plainLyrics: '',
      syncedLyrics: '[00:10.000]Unique first phrase',
      lyricsfile: null,
    };
    const newRecord = {
      ...oldRecord,
      syncedLyrics: '[00:12.000]Unique first phrase',
    };
    let finishOld, finishFresh;
    const client = {
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [oldRecord],
          invalidRecordCount: 0,
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishOld = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishFresh = resolve;
            }),
        )
        .mockResolvedValue({
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
        }),
      getById: vi.fn(async () => ({ status: 'ok', record: newRecord })),
    };
    const persistRecord = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client,
    });
    const original = await service.searchCandidates(track);
    const stale = service.searchCandidates(track, { mode: 'broaden' });
    await vi.waitFor(() => expect(finishOld).toBeTypeOf('function'));
    await expect(
      service.saveCandidate({
        track,
        trackDir: 'unused-no-persist',
        candidateId: 42,
        expectedFingerprint: original.candidates[0].previewFingerprint,
        persistRecord,
      }),
    ).resolves.toMatchObject({ status: 'record-changed' });
    const fresh = service.searchCandidates(track, { mode: 'broaden' });
    await vi.waitFor(() => expect(finishFresh).toBeTypeOf('function'));
    finishOld({ status: 'ok', records: [oldRecord], invalidRecordCount: 0 });
    await stale;
    const duplicate = service.searchCandidates(track, { mode: 'broaden' });
    expect(
      client.search.mock.calls.filter(([query]) => query.artistName).length,
    ).toBe(3);
    finishFresh({ status: 'ok', records: [newRecord], invalidRecordCount: 0 });
    const result = await fresh;
    expect(await duplicate).toEqual(result);
    expect(await service.searchCandidates(track, { mode: 'broaden' })).toEqual(
      result,
    );
    expect(result.candidates[0].previewFingerprint).not.toBe(
      original.candidates[0].previewFingerprint,
    );
    expect(
      client.search.mock.calls.filter(([query]) => query.artistName).length,
    ).toBe(3);
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it.each([
    ['lrclib', 'structured'],
    ['lrclib', 'broaden'],
    ['netease', 'structured'],
    ['netease', 'broaden'],
  ])(
    'refreshes %s discovery after record-changed before a %s search',
    async (changedProvider, mode) => {
      let changed = false;
      const lrc = (offset) =>
        Array.from(
          { length: 8 },
          (_, i) =>
            `[00:${String(10 + i * 5 + offset).padStart(2, '0')}.000]Unique phrase number ${i}`,
        ).join('\n');
      const metadata = {
        id: 42,
        trackName: 'Song',
        artistName: 'Artist',
        albumName: 'Album',
        duration: 180,
        artists: ['Artist'],
        aliases: [],
        translatedTitles: [],
      };
      const record = () => ({
        ...metadata,
        instrumental: false,
        plainLyrics: '',
        lyricsfile: null,
        syncedLyrics: lrc(changed && changedProvider === 'lrclib' ? 2 : 0),
      });
      const lrclib = {
        getExact: vi.fn(async () => ({ status: 'ok', record: record() })),
        search: vi.fn(async () => ({
          status: 'ok',
          records: [record()],
          invalidRecordCount: 0,
        })),
        searchBroad: vi.fn(async () => ({
          status: 'ok',
          records: [record()],
          invalidRecordCount: 0,
        })),
        getById: vi.fn(async () => ({ status: 'ok', record: record() })),
      };
      const netease = {
        search: vi.fn(async () => ({
          status: 'ok',
          records: [metadata],
          invalidRecordCount: 0,
        })),
        getLyrics: vi.fn(async () => ({
          status: 'ok',
          record: {
            id: 42,
            lrcLyrics: lrc(changed && changedProvider === 'netease' ? 0 : 2),
            yrcLyrics: '',
          },
        })),
      };
      const persistRecord = vi.fn(),
        setAutomaticPreference = vi.fn();
      const service = createLyricsAcquisitionService({
        requireFeatureGate: vi.fn(),
        featureId: 'lyrics-flow',
        client: lrclib,
        neteaseProvider: createNeteaseAcquisitionProvider({
          client: netease,
          persistRecord,
        }),
        betterLyricsProvider: {
          searchCandidates: vi.fn(async () => ({
            provider: 'betterlyrics',
            status: 'unavailable',
            reason: 'cache-miss',
            candidates: [],
          })),
        },
        setAutomaticPreference,
        logger: { debug: vi.fn(), warn: vi.fn() },
      });
      const track = {
        id: 'local-track',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        lyrics: {
          preference: { filename: 'manual.lrc', origin: 'user' },
          offsetMs: 320,
          timing: { userAuthored: true },
        },
      };
      const original = structuredClone(track);
      const first = await service.searchProviderCandidates('all', track, {
        mode,
      });
      expect(first.recordingGroups.best[0].timelineDifferences).toHaveLength(1);
      const selected = first.candidates.find(
        (c) => c.providerId === changedProvider,
      );
      changed = true;
      const saved = await service.saveProviderCandidate(changedProvider, {
        track,
        trackDir: 'unused-no-persist',
        candidateId: 42,
        expectedFingerprint: selected.previewFingerprint,
        persistRecord,
      });
      expect(saved.status).toBe('record-changed');
      const callsAfterSave = {
        lrclib: lrclib.search.mock.calls.length,
        netease: netease.getLyrics.mock.calls.length,
      };
      const next = await service.searchProviderCandidates('all', track, {
        mode,
      });
      const refreshed = next.candidates.find(
        (c) => c.providerId === changedProvider,
      );
      expect(refreshed.previewFingerprint).toBe(
        saved.candidate.previewFingerprint,
      );
      expect(refreshed.previewFingerprint).not.toBe(
        selected.previewFingerprint,
      );
      expect(
        next.recordingGroups.best[0].timelineDifferences || [],
      ).toHaveLength(0);
      if (changedProvider === 'lrclib') {
        expect(lrclib.search.mock.calls.length).toBeGreaterThan(
          callsAfterSave.lrclib,
        );
        expect(netease.getLyrics).toHaveBeenCalledTimes(callsAfterSave.netease);
      } else if (mode === 'structured') {
        expect(netease.getLyrics.mock.calls.length).toBeGreaterThan(
          callsAfterSave.netease,
        );
        expect(lrclib.search).toHaveBeenCalledTimes(callsAfterSave.lrclib);
      }
      expect(persistRecord).not.toHaveBeenCalled();
      expect(setAutomaticPreference).not.toHaveBeenCalled();
      expect(track).toEqual(original);
    },
  );

  it('uses full hydrated lines and cached results, while keeping private signatures out of IPC', async () => {
    const lrc = (offset) =>
      Array.from(
        { length: 8 },
        (_, i) =>
          `[00:${String(10 + i * 5 + offset).padStart(2, '0')}.000]Unique phrase number ${i}`,
      ).join('\n');
    const metadata = {
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      albumName: 'Album',
      duration: 180,
      artists: ['Artist'],
      aliases: [],
      translatedTitles: [],
    };
    const item = {
      ...metadata,
      instrumental: false,
      plainLyrics: '',
      syncedLyrics: lrc(0),
      lyricsfile: null,
    };
    const lrclib = {
      getExact: vi.fn(async () => ({ status: 'ok', record: item })),
      search: vi.fn(async () => ({
        status: 'ok',
        records: [item],
        invalidRecordCount: 0,
      })),
      getById: vi.fn(),
    };
    const netease = {
      search: vi.fn(async () => ({
        status: 'ok',
        records: [metadata],
        invalidRecordCount: 0,
      })),
      getLyrics: vi.fn(async () => ({
        status: 'ok',
        record: { id: 42, lrcLyrics: lrc(2), yrcLyrics: '' },
      })),
    };
    const persistRecord = vi.fn();
    const setAutomaticPreference = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: lrclib,
      neteaseProvider: createNeteaseAcquisitionProvider({
        client: netease,
        persistRecord,
      }),
      betterLyricsProvider: {
        searchCandidates: vi.fn(async () => ({
          provider: 'betterlyrics',
          status: 'unavailable',
          reason: 'cache-miss',
          candidates: [],
        })),
      },
      setAutomaticPreference,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const track = {
      id: 'local-track',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      lyrics: { preference: { filename: 'manual.lrc', origin: 'user' } },
    };
    const original = structuredClone(track);
    const single = await service.searchCandidates(track);
    expect(single).not.toHaveProperty('timelineEvidenceById');
    const individual = await service.searchProviderCandidates('netease', track);
    expect(individual).not.toHaveProperty('timelineEvidenceById');
    const before = {
      lrclib: lrclib.search.mock.calls.length,
      netease: netease.search.mock.calls.length,
      lyrics: netease.getLyrics.mock.calls.length,
    };
    const combined = await service.searchProviderCandidates('all', track);
    expect(
      combined.recordingGroups.best[0].timelineDifferences[0],
    ).toMatchObject({
      referenceCandidateKey: 'netease:42',
      candidateKey: 'lrclib:42',
      offsetMs: -2000,
      matchedLineCount: 8,
    });
    expect(
      combined.candidates.every(
        (candidate) => candidate.previewLines.length === 5,
      ),
    ).toBe(true);
    expect(JSON.stringify(combined)).not.toMatch(
      /timelineEvidenceById|unique-line-starts-v1/,
    );
    expect(lrclib.search).toHaveBeenCalledTimes(before.lrclib);
    expect(netease.search).toHaveBeenCalledTimes(before.netease);
    expect(netease.getLyrics).toHaveBeenCalledTimes(before.lyrics);
    expect(lrclib.getById).not.toHaveBeenCalled();
    expect(persistRecord).not.toHaveBeenCalled();
    expect(setAutomaticPreference).not.toHaveBeenCalled();
    expect(track).toEqual(original);
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
