import { describe, expect, it, vi } from 'vitest';

import { createBetterLyricsAcquisitionProvider } from './acquisition.js';
import { fingerprintBetterLyricsRecord } from './candidate.js';

const TTML = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body dur="5s"><p begin="1s" end="3s"><span begin="1s" end="3s">Song</span></p></body></tt>`;

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Singer',
    albumName: 'Album',
    duration: 5,
    score: 95,
    cacheStatus: 'HIT',
    ttml: TTML,
    ...overrides,
  };
}

describe('Better Lyrics acquisition provider', () => {
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
        .mockResolvedValueOnce({ status: 'ok', record: record({ score: 60 }) }),
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
