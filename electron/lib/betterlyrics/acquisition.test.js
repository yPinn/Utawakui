import { describe, expect, it, vi } from 'vitest';

import { createBetterLyricsAcquisitionProvider } from './acquisition.js';
import { fingerprintBetterLyricsRecord } from './candidate.js';
import { createBetterLyricsClient } from './client.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="5s"><p begin="1s" end="3s"><span begin="1s" end="3s">Song</span></p></body></tt>`;

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Singer',
    albumName: 'Album',
    duration: 5,
    score: 0.95,
    cacheStatus: 'HIT',
    ttml: TTML,
    ...overrides,
  };
}

describe('Better Lyrics acquisition provider', () => {
  it('accepts a real-client fractional fresh score and refetches a scoreless cache hit before saving', async () => {
    let attempts = 0;
    const fetch = vi.fn(async () => {
      attempts += 1;
      return new Response(
        JSON.stringify({
          ttml: TTML,
          ...(attempts === 1 ? { score: 0.97 } : {}),
        }),
        {
          headers: { 'x-cache-status': attempts === 1 ? 'MISS' : 'HIT' },
        },
      );
    });
    const client = createBetterLyricsClient({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    const persistRecord = vi.fn(() => ({ status: 'saved' }));
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = {
      id: 'fractional',
      title: 'Song',
      artist: 'Singer',
      album: 'Album',
      duration: 5,
    };
    const search = await provider.searchCandidates(track);
    expect(search.status).toBe('ok');
    const [candidate] = search.candidates;
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: candidate.id,
        expectedFingerprint: candidate.previewFingerprint,
      }),
    ).resolves.toMatchObject({ status: 'saved' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].toString()).toBe(
      fetch.mock.calls[1][0].toString(),
    );
    expect(persistRecord).toHaveBeenCalledWith(
      'ignored',
      expect.not.objectContaining({ score: expect.anything() }),
    );
  });
  it('keeps a known album when broadening and does not retry a cache miss', async () => {
    const client = {
      getLyrics: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'cache-miss',
      })),
    };
    await createBetterLyricsAcquisitionProvider({ client }).searchCandidates(
      { title: 'Song', artist: 'Singer', album: 'Album', duration: 5 },
      { mode: 'broaden' },
    );
    expect(client.getLyrics).toHaveBeenCalledOnce();
    expect(client.getLyrics).toHaveBeenCalledWith(
      {
        trackName: 'Song',
        artistName: 'Singer',
        albumName: 'Album',
        duration: 5,
      },
      expect.any(Object),
    );
  });
  it('uses only explicit cross-script aliases and credited features, preserving the save query', async () => {
    const track = {
      id: 'canonical',
      title: 'Closer to You (feat. Major Lazer)',
      artist: '정국 (Jung Kook), Major Lazer',
      album: 'GOLDEN',
      duration: 5,
    };
    const snapshot = structuredClone(track);
    const client = {
      getLyrics: vi.fn(async (query) => ({
        status: 'ok',
        record: record({ ...query, score: 0.97 }),
      })),
    };
    const persistRecord = vi.fn(() => ({ status: 'saved' }));
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const search = await provider.searchCandidates(track, {
      query: { title: track.title, artist: track.artist },
    });
    expect(search.status).toBe('ok');
    const canonical = {
      trackName: 'Closer to You',
      artistName: 'Jung Kook, Major Lazer',
      albumName: 'GOLDEN',
      duration: 5,
    };
    expect(client.getLyrics).toHaveBeenCalledWith(
      canonical,
      expect.any(Object),
    );
    expect(client.getLyrics).toHaveBeenCalledOnce();
    const [candidate] = search.candidates;
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: candidate.id,
        expectedFingerprint: candidate.previewFingerprint,
      }),
    ).resolves.toMatchObject({ status: 'saved' });
    expect(client.getLyrics).toHaveBeenLastCalledWith(canonical, {
      fresh: true,
    });
    expect(track).toEqual(snapshot);
  });
  it.each([
    [
      'Song (feat. Guest) (Live)',
      'Singer, Guest',
      'Song (Live)',
      'Singer, Guest',
    ],
    ['Song (Remix)', 'Singer', 'Song (Remix)', 'Singer'],
    ['Song (feat. Uncredited)', 'Singer', 'Song (feat. Uncredited)', 'Singer'],
    ['Song', 'Singer (Guest)', 'Song', 'Singer (Guest)'],
    ['Song', 'AC/DC', 'Song', 'AC/DC'],
    ['Song', 'Aimer (エメ)', 'Song', 'Aimer'],
    ['Song', '不詳 (別人)', 'Song', '不詳 (別人)'],
    ['Song', '정국 (Official)', 'Song', '정국 (Official)'],
    ['Song', '정국 (Live)', 'Song', '정국 (Live)'],
  ])(
    'preserves version and ambiguous credits for %s / %s',
    async (title, artist, expectedTitle, expectedArtist) => {
      const client = {
        getLyrics: vi.fn(async () => ({
          status: 'unavailable',
          reason: 'cache-miss',
        })),
      };
      await createBetterLyricsAcquisitionProvider({ client }).searchCandidates({
        title,
        artist,
        duration: 5,
      });
      expect(client.getLyrics).toHaveBeenCalledWith(
        { trackName: expectedTitle, artistName: expectedArtist, duration: 5 },
        expect.any(Object),
      );
    },
  );
  it('does not carry an unrelated library album into an edited song query', async () => {
    const client = {
      getLyrics: vi.fn(async () => ({
        status: 'unavailable',
        reason: 'cache-miss',
      })),
    };
    await createBetterLyricsAcquisitionProvider({ client }).searchCandidates(
      {
        title: 'Original',
        artist: 'Original Artist',
        album: 'Original Album',
        duration: 5,
      },
      { query: { title: 'Song', artist: 'Singer' } },
    );
    expect(client.getLyrics).toHaveBeenCalledWith(
      { trackName: 'Song', artistName: 'Singer', duration: 5 },
      expect.any(Object),
    );
  });
  it('classifies identity rejection separately from malformed TTML', async () => {
    const client = {
      getLyrics: vi.fn(async () => ({
        status: 'ok',
        record: record({ artistName: 'Nova' }),
      })),
    };
    const provider = createBetterLyricsAcquisitionProvider({ client });
    await expect(
      provider.searchCandidates({
        title: 'Song',
        artist: 'Singer',
        duration: 5,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'low-confidence-match',
      candidates: [],
    });
  });

  it('reports malformed save-time TTML without misclassifying it as changed identity', async () => {
    const client = {
      getLyrics: vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok', record: record() })
        .mockResolvedValueOnce({
          status: 'ok',
          record: record({ ttml: '<tt />' }),
        }),
    };
    const persistRecord = vi.fn();
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = { title: 'Song', artist: 'Singer', duration: 5 };
    const search = await provider.searchCandidates(track);
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: search.candidates[0].id,
        expectedFingerprint: search.candidates[0].previewFingerprint,
      }),
    ).resolves.toMatchObject({ status: 'error', reason: 'invalid-ttml' });
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('rejects save-time identity changes without classifying them as invalid TTML', async () => {
    const client = {
      getLyrics: vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok', record: record() })
        .mockResolvedValueOnce({
          status: 'ok',
          record: record({ duration: 15 }),
        }),
    };
    const persistRecord = vi.fn();
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = { title: 'Song', artist: 'Singer', duration: 5 };
    const search = await provider.searchCandidates(track);
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: search.candidates[0].id,
        expectedFingerprint: search.candidates[0].previewFingerprint,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'record-mismatch',
    });
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('requires title, artist, and duration before a network request', async () => {
    const client = { getLyrics: vi.fn() };
    const provider = createBetterLyricsAcquisitionProvider({ client });

    await expect(provider.searchCandidates({ title: 'Song' })).resolves.toEqual(
      {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'missing-track-identity',
        candidates: [],
        groups: null,
      },
    );
    expect(client.getLyrics).not.toHaveBeenCalled();
  });

  it('returns one complete T2 candidate only for a sufficiently confident cache hit', async () => {
    const client = {
      getLyrics: vi.fn(async () => ({ status: 'ok', record: record() })),
    };
    const provider = createBetterLyricsAcquisitionProvider({ client });
    await expect(
      provider.searchCandidates({
        id: 'track-a',
        title: 'Song',
        artist: 'Singer',
        album: 'Album',
        duration: 5,
      }),
    ).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'ok',
      candidates: [
        {
          id: 42,
          trackName: 'Song',
          artistName: 'Singer',
          duration: 5,
          capability: { level: 'T2', partial: false },
        },
      ],
    });
  });

  it('treats cache misses as bounded unavailability and rejects low-confidence payloads', async () => {
    const client = {
      getLyrics: vi
        .fn()
        .mockResolvedValueOnce({ status: 'unavailable', reason: 'cache-miss' })
        .mockResolvedValueOnce({
          status: 'ok',
          record: record({ score: 0.6 }),
        }),
    };
    const provider = createBetterLyricsAcquisitionProvider({ client });
    const track = { title: 'Song', artist: 'Singer', duration: 5 };

    await expect(provider.searchCandidates(track)).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'unavailable',
      reason: 'cache-miss',
    });
    await expect(provider.searchCandidates(track)).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'unavailable',
      reason: 'low-confidence-match',
    });
  });

  it('bounds malformed TTML and validates save intent before refetch', async () => {
    const client = {
      getLyrics: vi.fn(async () => ({
        status: 'ok',
        record: record({ ttml: '<tt />' }),
      })),
    };
    const provider = createBetterLyricsAcquisitionProvider({ client });
    const track = { title: 'Song', artist: 'Singer', duration: 5 };
    await expect(provider.searchCandidates(track)).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'error',
      reason: 'invalid-ttml',
      invalidRecordCount: 1,
    });
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: 0,
        expectedFingerprint: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/candidate id/i);
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: 42,
        expectedFingerprint: 'invalid',
      }),
    ).rejects.toThrow(/fingerprint/i);
    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: 42,
        expectedFingerprint: 'a'.repeat(64),
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'stale-search' });
  });

  it('refetches the same authorized query on save and detects changed TTML', async () => {
    const first = record();
    const changed = record({
      ttml: TTML.replace('Song</span>', 'Changed</span>'),
    });
    const client = {
      getLyrics: vi
        .fn()
        .mockResolvedValueOnce({ status: 'ok', record: first })
        .mockResolvedValueOnce({ status: 'ok', record: changed }),
    };
    const persistRecord = vi.fn();
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = {
      id: 'track-a',
      title: 'Song',
      artist: 'Singer',
      album: 'Album',
      duration: 5,
    };
    const search = await provider.searchCandidates(track);
    const candidate = search.candidates[0];

    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'ignored',
        candidateId: candidate.id,
        expectedFingerprint: candidate.previewFingerprint,
      }),
    ).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'record-changed',
    });
    expect(fingerprintBetterLyricsRecord(first)).not.toBe(
      fingerprintBetterLyricsRecord(changed),
    );
    expect(client.getLyrics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trackName: 'Song',
        artistName: 'Singer',
        duration: 5,
      }),
      { fresh: true },
    );
    expect(persistRecord).not.toHaveBeenCalled();
  });

  it('persists an unchanged authorized candidate and rejects replay on another track', async () => {
    const current = record();
    const client = {
      getLyrics: vi.fn(async () => ({ status: 'ok', record: current })),
    };
    const persistRecord = vi.fn(() => ({
      status: 'saved',
      source: { filename: 'betterlyrics-42.lrc' },
    }));
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = {
      id: 'track-a',
      title: 'Song',
      artist: 'Singer',
      album: 'Album',
      duration: 5,
    };
    const search = await provider.searchCandidates(track);
    const candidate = search.candidates[0];
    const intent = {
      track,
      trackDir: 'track-dir',
      candidateId: candidate.id,
      expectedFingerprint: candidate.previewFingerprint,
    };

    await expect(
      provider.saveCandidate({
        ...intent,
        track: { ...track, id: 'track-b' },
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'stale-search' });
    await expect(provider.saveCandidate(intent)).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'saved',
    });
    expect(persistRecord).toHaveBeenCalledWith('track-dir', current);
  });

  it('revalidates save against the authorized manual search identity', async () => {
    const current = record();
    const client = {
      getLyrics: vi.fn(async () => ({ status: 'ok', record: current })),
    };
    const persistRecord = vi.fn(() => ({
      status: 'saved',
      source: { filename: 'betterlyrics-42.lrc' },
    }));
    const provider = createBetterLyricsAcquisitionProvider({
      client,
      persistRecord,
    });
    const track = {
      id: 'track-a',
      title: 'Unrelated library title',
      artist: 'Unrelated library artist',
      duration: 5,
    };
    const search = await provider.searchCandidates(track, {
      query: { title: 'Song', artist: 'Singer' },
    });
    const candidate = search.candidates[0];

    await expect(
      provider.saveCandidate({
        track,
        trackDir: 'track-dir',
        candidateId: candidate.id,
        expectedFingerprint: candidate.previewFingerprint,
      }),
    ).resolves.toMatchObject({ provider: 'betterlyrics', status: 'saved' });
    expect(persistRecord).toHaveBeenCalledWith('track-dir', current);
  });
});
