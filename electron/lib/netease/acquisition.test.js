import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNeteaseAcquisitionProvider } from './acquisition.js';

function metadata(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Artist',
    artists: ['Artist'],
    albumName: 'Album',
    duration: 180,
    aliases: [],
    translatedTitles: [],
    ...overrides,
  };
}

function client(overrides = {}) {
  return {
    search: vi.fn().mockResolvedValue({
      status: 'ok',
      records: [metadata()],
      invalidRecordCount: 0,
    }),
    getLyrics: vi.fn().mockResolvedValue({
      status: 'ok',
      record: {
        id: 42,
        yrcLyrics: '[1000,1000](1000,1000,0)Word',
        lrcLyrics: '[00:01.000]Word',
      },
    }),
    ...overrides,
  };
}

describe('createNeteaseAcquisitionProvider', () => {
  it('continues to an alias for more comparison choices when the first phase yields one usable match', async () => {
    const api = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [
            metadata({
              trackName: '月面着陸計画',
              artistName: 'tuki.',
              artists: ['tuki.'],
            }),
          ],
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [
            metadata({
              id: 43,
              trackName: '月面着陸計画',
              artistName: 'tuki.',
              artists: ['tuki.'],
              duration: 182,
            }),
          ],
          invalidRecordCount: 0,
        }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: { id, lrcLyrics: '[00:01]Hello', yrcLyrics: '' },
      })),
    });
    const result = await createNeteaseAcquisitionProvider({
      client: api,
    }).searchCandidates({
      title: '月面着陸計画 - Moon Landing Plan',
      artist: 'tuki.',
      duration: 180,
    });
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(2);
  });

  it('adds another small batch on broaden after three candidates were already found', async () => {
    const make = (id) => metadata({ id, duration: 180 + id });
    const api = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [1, 2, 3].map(make),
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [1, 2, 3, 4, 5, 6].map(make),
          invalidRecordCount: 0,
        }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: { id, lrcLyrics: `[00:01]Version ${id}`, yrcLyrics: '' },
      })),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const track = { title: 'Song', artist: 'Artist', duration: 180 };
    expect((await provider.searchCandidates(track)).candidates).toHaveLength(3);
    const more = await provider.searchCandidates(track, { mode: 'broaden' });
    expect(more.candidates).toHaveLength(6);
    expect(api.getLyrics).toHaveBeenCalledTimes(6);
  });
  it('reports budget exhaustion rather than a complete miss when all hydrated lyrics are unusable', async () => {
    const api = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: Array.from({ length: 10 }, (_, i) => metadata({ id: i + 1 })),
        invalidRecordCount: 0,
      }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: { id, lrcLyrics: '', yrcLyrics: '' },
      })),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });
    await expect(
      provider.searchCandidates({
        title: 'Song',
        artist: 'Artist',
        duration: 180,
      }),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'request-budget-exhausted',
      candidates: [],
    });
    expect(api.getLyrics).toHaveBeenCalledTimes(5);
  });
  it('refreshes known changed lyrics in other cached query identities without another detail request', async () => {
    const api = client();
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const one = {
      id: 'one',
      title: 'Song',
      artist: 'Artist',
      album: 'One',
      duration: 180,
    };
    const two = { ...one, id: 'two', album: 'Two' };
    const first = await provider.searchCandidates(one);
    await provider.searchCandidates(two);
    api.getLyrics.mockResolvedValue({
      status: 'ok',
      record: { id: 42, yrcLyrics: '', lrcLyrics: '[00:03]Updated line' },
    });
    const changed = await provider.saveCandidate({
      track: one,
      trackDir: 'unused',
      candidateId: 42,
      expectedFingerprint: first.candidates[0].previewFingerprint,
    });
    expect(changed.status).toBe('record-changed');
    const next = await provider.searchCandidates(two, { mode: 'broaden' });
    expect(next.candidates[0].previewFingerprint).toBe(
      changed.candidate.previewFingerprint,
    );
    expect(api.getLyrics).toHaveBeenCalledTimes(3);
  });
  it('checks an alias without rehydrating duplicate metadata when only one choice is available', async () => {
    const api = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [
          metadata({
            trackName: '月面着陸計画',
            artistName: 'tuki.',
            artists: ['tuki.'],
          }),
        ],
        invalidRecordCount: 0,
      }),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const result = await provider.searchCandidates({
      title: '月面着陸計画 - Moon Landing Plan',
      artist: 'tuki.',
      duration: 180,
    });
    expect(result.candidates).toHaveLength(1);
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.getLyrics).toHaveBeenCalledOnce();
    expect(api.search.mock.calls[0][1].budget).toBeDefined();
  });
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-netease-flow-'));
    trackDir = path.join(rootDir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('searches metadata, fetches lyrics and returns LRCLIB-compatible candidate groups', async () => {
    const api = client();
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const result = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });

    expect(api.search).toHaveBeenCalledWith(
      {
        trackName: 'Song',
        artistName: 'Artist',
      },
      expect.objectContaining({ budget: expect.any(Object) }),
    );
    expect(api.getLyrics).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ budget: expect.any(Object) }),
    );
    expect(result).toMatchObject({
      provider: 'netease',
      status: 'ok',
      groups: {
        best: [
          {
            id: 42,
            capability: { level: 'T2', partial: false },
            saveState: 'unsaved',
          },
        ],
        related: [],
      },
    });
  });

  it('does not fetch lyrics for metadata that fails the recording identity gate', async () => {
    const api = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [
          metadata({
            id: 99,
            trackName: 'Unrelated live',
            duration: 600,
          }),
        ],
        invalidRecordCount: 0,
      }),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });

    const result = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });

    expect(api.getLyrics).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', candidates: [] });
  });

  it('hydrates only enough top-ranked metadata to produce three usable candidates', async () => {
    const records = Array.from({ length: 10 }, (_, index) =>
      metadata({ id: index + 1, duration: 180 + index }),
    );
    const api = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records,
        invalidRecordCount: 0,
      }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: {
          id,
          yrcLyrics: '',
          lrcLyrics: `[00:01.000]Line ${id}`,
        },
      })),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });

    const result = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });

    expect(api.getLyrics).toHaveBeenCalledTimes(3);
    expect(result.candidates).toHaveLength(3);
  });

  it('continues hydration after a top metadata match has no usable lyrics', async () => {
    const records = Array.from({ length: 4 }, (_, index) =>
      metadata({ id: index + 1, duration: 180 + index }),
    );
    const api = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records,
        invalidRecordCount: 0,
      }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: {
          id,
          yrcLyrics: '',
          lrcLyrics: id === 1 ? '' : `[00:01.000]Line ${id}`,
        },
      })),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });

    const result = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });

    expect(api.getLyrics).toHaveBeenCalledTimes(4);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((item) => item.id)).toEqual([2, 3, 4]);
  });

  it('broadens a direct search with structured and title-only queries', async () => {
    const api = client();
    const provider = createNeteaseAcquisitionProvider({ client: api });

    await provider.searchCandidates(
      { title: 'Song', artist: 'Artist', duration: 180 },
      {
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      },
    );

    expect(api.search.mock.calls.map(([query]) => query)).toEqual([
      { trackName: 'Song', artistName: 'Artist' },
      { trackName: 'Song' },
    ]);
  });

  it('uses bounded cross-script structured title variants before hydration', async () => {
    const api = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [
            metadata({
              trackName: '夜に駆ける',
              artistName: 'YOASOBI',
              artists: ['YOASOBI'],
              duration: 261,
            }),
          ],
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
        }),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });

    const result = await provider.searchCandidates({
      title: '夜に駆ける - Racing into the Night',
      artist: 'YOASOBI',
      duration: 261,
    });

    expect(api.search.mock.calls.map(([query]) => query)).toEqual([
      {
        trackName: '夜に駆ける - Racing into the Night',
        artistName: 'YOASOBI',
      },
      { trackName: '夜に駆ける', artistName: 'YOASOBI' },
    ]);
    expect(api.getLyrics).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ budget: expect.any(Object) }),
    );
    expect(result).toMatchObject({
      status: 'ok',
      candidates: [
        {
          id: 42,
          capability: { level: 'T2', partial: false },
        },
      ],
    });
  });

  it('keeps structured candidates when a punctuation-cleaned broaden query returns none', async () => {
    const leadingPunctuationRecord = metadata({
      trackName: '.锁链',
      artistName: '河南说唱之神',
      artists: ['河南说唱之神'],
      duration: 161,
    });
    const api = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [leadingPunctuationRecord],
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
        }),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const track = {
      title: '.锁链',
      artist: '河南说唱之神',
      duration: 161,
    };
    const query = { title: '.锁链', artist: '河南说唱之神' };

    const structured = await provider.searchCandidates(track, { query });
    const broadened = await provider.searchCandidates(track, {
      query,
      mode: 'broaden',
    });

    expect(structured.candidates).toHaveLength(1);
    expect(api.search).toHaveBeenNthCalledWith(
      2,
      { trackName: '锁链' },
      expect.objectContaining({ budget: expect.any(Object) }),
    );
    expect(api.getLyrics).toHaveBeenCalledTimes(1);
    expect(broadened.candidates).toEqual(structured.candidates);
  });

  it('re-fetches the selected record and refuses a silent post-preview change', async () => {
    const api = client();
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const searched = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    api.getLyrics.mockResolvedValueOnce({
      status: 'ok',
      record: {
        id: 42,
        yrcLyrics: '',
        lrcLyrics: '[00:01.000]Changed',
      },
    });

    await expect(
      provider.saveCandidate({
        track: { title: 'Song', artist: 'Artist', duration: 180 },
        trackDir,
        candidateId: 42,
        expectedFingerprint: searched.candidates[0].previewFingerprint,
      }),
    ).resolves.toMatchObject({
      provider: 'netease',
      status: 'record-changed',
      candidate: {
        id: 42,
        capability: { level: 'T1', partial: false },
      },
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics'))).toBe(false);
  });

  it('saves only a candidate retained by the main-owned search cache', async () => {
    const provider = createNeteaseAcquisitionProvider({ client: client() });
    const searched = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    await expect(
      provider.saveCandidate({
        track: { title: 'Song', artist: 'Artist', duration: 180 },
        trackDir,
        candidateId: 42,
        expectedFingerprint: searched.candidates[0].previewFingerprint,
      }),
    ).resolves.toMatchObject({
      status: 'saved',
      source: { kind: 'netease' },
    });

    const freshProvider = createNeteaseAcquisitionProvider({
      client: client(),
    });
    await expect(
      freshProvider.saveCandidate({
        track: { title: 'Song', artist: 'Artist', duration: 180 },
        trackDir,
        candidateId: 42,
        expectedFingerprint: searched.candidates[0].previewFingerprint,
      }),
    ).resolves.toEqual({
      provider: 'netease',
      status: 'unavailable',
      reason: 'stale-search',
    });
  });

  it('runs the automatic commit guard after re-fetch and before persistence', async () => {
    const persistRecord = vi.fn();
    const provider = createNeteaseAcquisitionProvider({
      client: client(),
      persistRecord,
    });
    const searched = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });

    await expect(
      provider.saveCandidate({
        track: { title: 'Song', artist: 'Artist', duration: 180 },
        trackDir,
        candidateId: 42,
        expectedFingerprint: searched.candidates[0].previewFingerprint,
        validateCommit: () => 'stale-track',
      }),
    ).resolves.toEqual({
      provider: 'netease',
      status: 'unavailable',
      reason: 'stale-track',
    });
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('keeps authorized candidates isolated across concurrent track identities', async () => {
    const api = client({
      search: vi.fn(async (query) => {
        const other = query.trackName === 'Other Song';
        return {
          status: 'ok',
          records: [
            metadata({
              id: other ? 43 : 42,
              trackName: other ? 'Other Song' : 'Song',
              artistName: other ? 'Other Artist' : 'Artist',
              artists: [other ? 'Other Artist' : 'Artist'],
            }),
          ],
          invalidRecordCount: 0,
        };
      }),
      getLyrics: vi.fn(async (id) => ({
        status: 'ok',
        record: {
          id,
          yrcLyrics: `[1000,1000](1000,1000,0)Word ${id}`,
          lrcLyrics: `[00:01.000]Word ${id}`,
        },
      })),
    });
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const firstTrack = {
      id: 'track-a',
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    };
    const secondTrack = {
      id: 'track-b',
      title: 'Other Song',
      artist: 'Other Artist',
      duration: 180,
    };

    const firstSearch = await provider.searchCandidates(firstTrack);
    await provider.searchCandidates(secondTrack);

    await expect(
      provider.saveCandidate({
        track: firstTrack,
        trackDir,
        candidateId: 42,
        expectedFingerprint: firstSearch.candidates[0].previewFingerprint,
      }),
    ).resolves.toMatchObject({
      provider: 'netease',
      status: 'saved',
      source: { kind: 'netease' },
    });
  });

  it('returns a bounded unavailable result when changed content is no longer a valid candidate', async () => {
    const api = client();
    const provider = createNeteaseAcquisitionProvider({ client: api });
    const searched = await provider.searchCandidates({
      title: 'Song',
      artist: 'Artist',
      duration: 180,
    });
    api.getLyrics.mockResolvedValueOnce({
      status: 'ok',
      record: { id: 42, yrcLyrics: '', lrcLyrics: '' },
    });

    await expect(
      provider.saveCandidate({
        track: { title: 'Song', artist: 'Artist', duration: 180 },
        trackDir,
        candidateId: 42,
        expectedFingerprint: searched.candidates[0].previewFingerprint,
      }),
    ).resolves.toEqual({
      provider: 'netease',
      status: 'unavailable',
      reason: 'record-mismatch',
    });
  });
});
