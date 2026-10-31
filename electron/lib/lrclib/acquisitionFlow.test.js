import { describe, expect, it, vi } from 'vitest';
import {
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
} from './acquisition.js';

function record(overrides = {}) {
  return {
    id: 42,
    name: 'Song - Artist',
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello',
    syncedLyrics: '[00:01.00]Hello',
    lyricsfile: null,
    ...overrides,
  };
}

const track = {
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
};

function client(overrides = {}) {
  return {
    getExact: vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', reason: 'not-found' }),
    search: vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [], invalidRecordCount: 0 }),
    searchBroad: vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [], invalidRecordCount: 0 }),
    ...overrides,
  };
}

describe('structured LRCLIB acquisition flow', () => {
  it('tries one alias when the primary has only one usable candidate to offer a choice', async () => {
    const provider = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [record({ trackName: '月面着陸計画', artistName: 'tuki.' })],
          invalidRecordCount: 0,
        })
        .mockResolvedValueOnce({
          status: 'ok',
          records: [
            record({
              id: 43,
              trackName: '月面着陸計画',
              artistName: 'tuki.',
              albumName: 'Another Album',
            }),
            record({
              id: 44,
              trackName: '月面着陸計画',
              artistName: 'tuki.',
              duration: 182,
            }),
          ],
          invalidRecordCount: 0,
        }),
    });
    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 180,
      },
      { client: provider },
    );
    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(result.candidates).toHaveLength(3);
  });

  it('stops when the primary already supplies three usable alternatives without truncating the response', async () => {
    const records = [1, 2, 3, 4].map((id) =>
      record({ id, trackName: '月面着陸計画', artistName: 'tuki.' }),
    );
    const provider = client({
      search: vi
        .fn()
        .mockResolvedValue({ status: 'ok', records, invalidRecordCount: 0 }),
    });
    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 180,
      },
      { client: provider },
    );
    expect(provider.search).toHaveBeenCalledOnce();
    expect(result.candidates).toHaveLength(4);
  });
  it('keeps the usable result when the alias does not add alternatives', async () => {
    const provider = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [record({ trackName: '月面着陸計画', artistName: 'tuki.' })],
        invalidRecordCount: 0,
      }),
    });
    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 180,
      },
      { client: provider },
    );
    expect(result.candidates).toHaveLength(1);
    expect(provider.getExact).not.toHaveBeenCalled();
    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(provider.search.mock.calls[0][1].budget).toBeDefined();
  });

  it('defers title-only recovery to explicit broaden and bounds broaden queries', async () => {
    const initial = client();
    const broad = client();
    await searchLrclibCandidates(track, { client: initial });
    await searchLrclibCandidates(track, { client: broad, mode: 'broaden' });
    expect(initial.search.mock.calls.map(([query]) => query)).toEqual([
      { trackName: 'Song', artistName: 'Artist' },
    ]);
    expect(broad.search.mock.calls.map(([query]) => query)).toEqual([
      { trackName: 'Song', artistName: 'Artist' },
      { trackName: 'Song' },
    ]);
  });
  it('does not issue requests when already cancelled or publish a late successful reply', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const idleClient = client();
    await expect(
      searchLrclibCandidates(track, {
        client: idleClient,
        signal: cancelled.signal,
      }),
    ).resolves.toMatchObject({ reason: 'cancelled', candidates: [] });
    expect(idleClient.getExact).not.toHaveBeenCalled();
    const controller = new AbortController();
    const provider = client({
      search: vi.fn(async () => {
        controller.abort();
        return { status: 'ok', records: [record()], invalidRecordCount: 0 };
      }),
    });
    await expect(
      searchLrclibCandidates(track, {
        client: provider,
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ reason: 'cancelled', candidates: [] });
    expect(provider.search).toHaveBeenCalledOnce();
  });
  it.each(['rate-limited', 'service-unavailable', 'timeout'])(
    'retains validated candidates when a broaden query later fails with %s',
    async (reason) => {
      const provider = client({
        getExact: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
        search: vi
          .fn()
          .mockResolvedValueOnce({
            status: 'ok',
            records: [record()],
            invalidRecordCount: 0,
          })
          .mockResolvedValue({ status: 'error', reason }),
      });
      const result = await searchLrclibCandidates(track, {
        client: provider,
        mode: 'broaden',
      });
      expect(result).toMatchObject({ status: 'ok', partial: true, reason });
      expect(result.candidates.map((candidate) => candidate.id)).toEqual([42]);
      expect(provider.search).toHaveBeenCalledTimes(2);
    },
  );

  it('retains earlier structured candidates when a subsequent title variant fails', async () => {
    const provider = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [record({ trackName: '月面着陸計画', artistName: 'tuki.' })],
          invalidRecordCount: 2,
        })
        .mockResolvedValue({
          status: 'error',
          reason: 'service-unavailable',
          httpStatus: 503,
          requestSource: 'network',
        }),
    });
    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 180,
      },
      { client: provider, mode: 'broaden' },
    );
    expect(result).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'service-unavailable',
      httpStatus: 503,
      invalidRecordCount: 2,
    });
    expect(result.candidates).toHaveLength(1);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('retains related candidates if recovery fails without issuing more requests', async () => {
    const provider = client({
      search: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          records: [record({ artistName: 'Nova' })],
          invalidRecordCount: 0,
        })
        .mockResolvedValue({
          status: 'error',
          reason: 'rate-limited',
          httpStatus: 429,
        }),
    });
    const result = await searchLrclibCandidates(track, {
      client: provider,
      mode: 'broaden',
    });
    expect(result).toMatchObject({
      status: 'ok',
      partial: true,
      reason: 'rate-limited',
    });
    expect(result.groups.related).toHaveLength(1);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('does not publish partial success after cancellation', async () => {
    const controller = new AbortController();
    const provider = client({
      getExact: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
      search: vi.fn(async () => {
        controller.abort();
        return { status: 'error', reason: 'timeout' };
      }),
    });
    const result = await searchLrclibCandidates(track, {
      client: provider,
      signal: controller.signal,
    });
    expect(result.status).toBe('error');
    expect(result.candidates).toEqual([]);
    expect(result.partial).not.toBe(true);
  });

  it('limits automatic search to exact plus one structured request without title-only recovery', async () => {
    const provider = client();
    await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        duration: 243,
      },
      {
        client: provider,
        automatic: true,
      },
    );
    expect(provider.getExact).toHaveBeenCalledOnce();
    expect(provider.search).toHaveBeenCalledOnce();
    expect(provider.search.mock.calls[0][1]).toMatchObject({
      priority: 'background',
    });
    expect(provider.searchBroad).not.toHaveBeenCalled();
  });

  it('uses one primary structured request and returns grouped candidates', async () => {
    const provider = client({
      getExact: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [record(), record({ id: 99, trackName: 'Other Song' })],
        invalidRecordCount: 0,
      }),
    });

    const result = await searchLrclibCandidates(track, { client: provider });

    expect(provider.getExact).not.toHaveBeenCalled();
    expect(provider.search).toHaveBeenCalledOnce();
    expect(provider.search).toHaveBeenCalledWith(
      {
        trackName: 'Song',
        artistName: 'Artist',
      },
      expect.objectContaining({
        budget: expect.any(Object),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(provider.searchBroad).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'ok',
      groups: {
        best: [expect.objectContaining({ id: 42, matchBand: 'exact' })],
        related: [expect.objectContaining({ id: 99, matchBand: 'related' })],
      },
    });
  });

  it('unions bilingual structured searches and prefers richer timing within the best group', async () => {
    const plain = record({
      id: 1,
      trackName: '月面着陸計画 - Moon Landing Plan',
      artistName: 'tuki.',
      albumName: '15',
      duration: 243,
      plainLyrics: 'Plain lyrics',
      syncedLyrics: null,
    });
    const synced = record({
      id: 2,
      trackName: '月面着陸計画',
      artistName: 'tuki.',
      albumName: '15',
      duration: 243,
      plainLyrics: 'Synced lyrics',
      syncedLyrics: '[00:10.00]Synced lyrics',
    });
    const provider = client({
      search: vi.fn().mockImplementation(async (query) => {
        if (query.trackName === '月面着陸計画 - Moon Landing Plan') {
          return { status: 'ok', records: [plain], invalidRecordCount: 0 };
        }
        return { status: 'ok', records: [synced], invalidRecordCount: 0 };
      }),
    });

    const result = await searchLrclibCandidates(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        album: '15',
        duration: 243,
      },
      {
        client: provider,
        query: {
          title: '月面着陸計画 - Moon Landing Plan',
          artist: 'tuki.',
        },
      },
    );

    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(provider.search.mock.calls.map(([query]) => query)).toEqual([
      {
        trackName: '月面着陸計画 - Moon Landing Plan',
        artistName: 'tuki.',
      },
      { trackName: '月面着陸計画', artistName: 'tuki.' },
    ]);
    expect(result.groups.best.map((candidate) => candidate.id)).toEqual([2, 1]);
    expect(result.candidates).toHaveLength(2);
  });

  it('uses one title-only recovery lookup when artist-constrained results have no best match', async () => {
    const firstTake = record({
      id: 1,
      trackName: 'Kakurenbo - From THE FIRST TAKE',
      artistName: 'Yuuri',
      albumName: 'Kakurenbo - From THE FIRST TAKE',
      duration: 296,
    });
    const nativeArtist = record({
      id: 2,
      trackName: 'Kakurenbo',
      artistName: '優里',
      albumName: 'Ichi',
      duration: 271,
    });
    const provider = client({
      search: vi.fn().mockImplementation(async (query) => ({
        status: 'ok',
        records: query.artistName ? [firstTake] : [nativeArtist],
        invalidRecordCount: 0,
      })),
    });

    const result = await searchLrclibCandidates(
      {
        title: 'Kakurenbo',
        artist: 'Yuuri',
        album: 'Ichi',
        duration: 271,
      },
      {
        client: provider,
        query: { title: 'Kakurenbo', artist: 'Yuuri' },
        mode: 'broaden',
      },
    );

    expect(provider.search.mock.calls.map(([query]) => query)).toEqual([
      { trackName: 'Kakurenbo', artistName: 'Yuuri' },
      { trackName: 'Kakurenbo' },
    ]);
    expect(result.groups.best).toEqual([]);
    expect(result.groups.related.map((candidate) => candidate.id)).toEqual([
      2, 1,
    ]);
  });

  it('keeps title-only recovery out of the initial search and allows it on broaden', async () => {
    const automaticProvider = client();
    const explicitProvider = client();

    await searchLrclibCandidates(track, {
      client: automaticProvider,
      query: { title: 'Edited Song', artist: 'Edited Artist' },
    });
    await searchLrclibCandidates(track, {
      client: explicitProvider,
      mode: 'broaden',
      query: { title: 'Edited Song', artist: 'Edited Artist' },
    });

    expect(explicitProvider.getExact).not.toHaveBeenCalled();
    expect(explicitProvider.search).toHaveBeenCalledTimes(2);
    expect(automaticProvider.search).toHaveBeenCalledOnce();
    expect(explicitProvider.searchBroad).not.toHaveBeenCalled();
  });

  it('short-circuits automatic acquisition on an exact compatible result', async () => {
    const provider = client({
      getExact: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
    });

    await expect(
      findLrclibSyncedLyrics(track, { client: provider }),
    ).resolves.toMatchObject({
      status: 'available',
      record: { id: 42 },
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('uses artist-constrained cross-script queries for automatic acquisition without recovery', async () => {
    const provider = client({
      search: vi.fn().mockImplementation(async (query) => ({
        status: 'ok',
        records:
          query.trackName === '月面着陸計画'
            ? [
                record({
                  id: 2,
                  trackName: '月面着陸計画',
                  artistName: 'tuki.',
                  albumName: '15',
                  duration: 243,
                }),
              ]
            : [],
        invalidRecordCount: 0,
      })),
    });

    const result = await findLrclibSyncedLyrics(
      {
        title: '月面着陸計画 - Moon Landing Plan',
        artist: 'tuki.',
        album: '15',
        duration: 243,
      },
      { client: provider },
    );

    expect(result).toMatchObject({ status: 'available', record: { id: 2 } });
    expect(provider.search.mock.calls.map(([query]) => query)).toEqual([
      {
        trackName: '月面着陸計画 - Moon Landing Plan',
        artistName: 'tuki.',
      },
      { trackName: '月面着陸計画', artistName: 'tuki.' },
    ]);
    expect(
      provider.search.mock.calls.every(([query]) => query.artistName),
    ).toBe(true);
  });

  it('auto-uses a validated Lyricsfile T2 record without requiring legacy syncedLyrics', async () => {
    const provider = client({
      getExact: vi.fn().mockResolvedValue({
        status: 'ok',
        record: record({
          syncedLyrics: null,
          lyricsfile: `version: "1.0"
metadata:
  title: Song
  artist: Artist
lines:
  - text: Hello
    start_ms: 1000
    end_ms: 2000
    words:
      - text: Hello
        start_ms: 1000
        end_ms: 2000
plain: Hello
`,
        }),
      }),
    });

    await expect(
      findLrclibSyncedLyrics(track, { client: provider }),
    ).resolves.toMatchObject({
      status: 'available',
      record: { id: 42, syncedLyrics: null },
    });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('uses one structured fallback after an exact miss', async () => {
    const provider = client({
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [record()],
        invalidRecordCount: 0,
      }),
    });

    await expect(
      findLrclibSyncedLyrics(track, { client: provider }),
    ).resolves.toMatchObject({ status: 'available' });
    expect(provider.search).toHaveBeenCalledOnce();
  });

  it('does not expand automatic queries after invalid exact data', async () => {
    const provider = client({
      getExact: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'invalid-record',
      }),
    });

    await expect(
      searchLrclibCandidates(track, { client: provider, automatic: true }),
    ).resolves.toMatchObject({ status: 'error', reason: 'invalid-record' });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('returns typed failures from exact, structured, and broadened requests', async () => {
    const exactFailure = client({
      getExact: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'offline',
      }),
    });
    await expect(
      findLrclibSyncedLyrics(track, { client: exactFailure }),
    ).resolves.toMatchObject({ status: 'error', reason: 'offline' });

    const structuredFailure = client({
      search: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'service-unavailable',
      }),
    });
    await expect(
      searchLrclibCandidates(track, { client: structuredFailure }),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'service-unavailable',
      candidates: [],
    });

    const broadenFailure = client({
      search: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'rate-limited',
      }),
    });
    await expect(
      searchLrclibCandidates(track, {
        client: broadenFailure,
        mode: 'broaden',
      }),
    ).resolves.toMatchObject({ status: 'error', reason: 'rate-limited' });
  });

  it('returns unavailable without provider calls for a missing title', async () => {
    const provider = client();
    await expect(
      findLrclibSyncedLyrics({ artist: 'Artist' }, { client: provider }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'missing-track-title',
    });
    expect(provider.getExact).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
  });
});
