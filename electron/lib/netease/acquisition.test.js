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

    expect(api.search).toHaveBeenCalledWith({
      trackName: 'Song',
      artistName: 'Artist',
    });
    expect(api.getLyrics).toHaveBeenCalledWith(42);
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

    expect(api.search.mock.calls).toEqual([
      [{ trackName: 'Song', artistName: 'Artist' }],
      [{ trackName: 'Song' }],
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

    expect(api.search.mock.calls).toEqual([
      [
        {
          trackName: '夜に駆ける - Racing into the Night',
          artistName: 'YOASOBI',
        },
      ],
      [{ trackName: '夜に駆ける', artistName: 'YOASOBI' }],
      [{ trackName: 'Racing into the Night', artistName: 'YOASOBI' }],
    ]);
    expect(api.getLyrics).toHaveBeenCalledWith(42);
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
    expect(api.search).toHaveBeenNthCalledWith(2, { trackName: '锁链' });
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
