import { describe, expect, it, vi } from 'vitest';
import {
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildSearchParams,
  findLrclibSyncedLyrics,
  looksLikeChannelArtist,
  parseLrcLines,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  stripTrackDecorations,
} from './lrclib.js';

const fadedTitle = '\u892A\u8272';
const labelUploader = '\u6dfb\u7ffc\u97f3\u6a02 TEAM EAR MUSIC';
const decoratedFadedTitle = `VH (Vast & Hazy)\u3010${fadedTitle}\u3011 Official Music Video`;

describe('stripTrackDecorations', () => {
  it('removes common music video decorations without removing the title', () => {
    expect(
      stripTrackDecorations(
        'Sabrina Carpenter - Espresso (Official Music Video)',
      ),
    ).toBe('Sabrina Carpenter - Espresso');
  });
});

describe('buildLrclibUrl', () => {
  it('builds LRCLIB search URLs without credentials', () => {
    const url = buildLrclibUrl(
      '/api/search',
      { track_name: 'Espresso', artist_name: 'Sabrina Carpenter' },
      'https://lrclib.example.test/',
    );

    expect(url.toString()).toBe(
      'https://lrclib.example.test/api/search?track_name=Espresso&artist_name=Sabrina+Carpenter',
    );
  });
});

describe('buildSearchParams', () => {
  it('uses title and artist metadata for search', () => {
    expect(
      buildSearchParams({
        title: 'Espresso (Official Video)',
        artist: 'Sabrina Carpenter',
      }),
    ).toEqual({
      track_name: 'Espresso',
      artist_name: 'Sabrina Carpenter',
    });
  });
});

describe('buildLrclibSearchQueries', () => {
  it('prioritizes canonical metadata profiles before YouTube title fallbacks', () => {
    const queries = buildLrclibSearchQueries({
      title: 'Label Channel - Long Official MV Title',
      artist: 'Label Channel Music',
      duration: 260,
      metadataCandidates: [
        {
          title: 'Canonical Title',
          artist: 'Actual Artist',
          duration: 211,
          platform: 'spotify',
        },
      ],
    });

    expect(queries[0]).toMatchObject({
      params: {
        track_name: 'Canonical Title',
        artist_name: 'Actual Artist',
      },
      source: 'spotify',
      artistConfidence: 'high',
    });
    expect(queries[1]).toMatchObject({
      params: { track_name: 'Canonical Title' },
      source: 'spotify',
    });
  });

  it('extracts bracketed song titles and title-derived artist variants', () => {
    const queries = buildLrclibSearchQueries({
      title: decoratedFadedTitle,
      artist: labelUploader,
    });

    expect(queries.map((query) => query.params)).toContainEqual({
      track_name: fadedTitle,
      artist_name: 'VH (Vast & Hazy)',
    });
    expect(queries.map((query) => query.params)).toContainEqual({
      track_name: fadedTitle,
      artist_name: 'Vast & Hazy',
    });
    expect(queries.map((query) => query.params)).toContainEqual({
      track_name: fadedTitle,
      artist_name: 'VH',
    });
    expect(queries).toContainEqual(
      expect.objectContaining({
        params: { track_name: fadedTitle },
        artistConfidence: 'none',
      }),
    );
  });
});

describe('looksLikeChannelArtist', () => {
  it('marks label or channel uploaders as low-confidence artist metadata', () => {
    expect(looksLikeChannelArtist(labelUploader)).toBe(true);
    expect(looksLikeChannelArtist('Sabrina Carpenter')).toBe(false);
  });
});

describe('parseLrcLines', () => {
  it('parses timestamped LRC lines', () => {
    expect(
      parseLrcLines(`[00:01.00]First
[00:05.20][00:09.40]Repeat`),
    ).toEqual([
      { start: 1, text: 'First' },
      { start: 5.2, text: 'Repeat' },
      { start: 9.4, text: 'Repeat' },
    ]);
  });
});

describe('pickBestSyncedCandidate', () => {
  const track = {
    title: 'Espresso (Official Music Video)',
    artist: 'Sabrina Carpenter',
    duration: 175,
  };

  it('picks the safe synced candidate by title, artist, and duration', () => {
    expect(
      pickBestSyncedCandidate(track, [
        {
          id: 1,
          trackName: 'Please Please Please',
          artistName: 'Sabrina Carpenter',
          duration: 186,
          syncedLyrics: '[00:01.00]Wrong song',
        },
        {
          id: 2,
          trackName: 'Espresso',
          artistName: 'Sabrina Carpenter',
          duration: 175,
          syncedLyrics: '[00:01.00]Correct song',
        },
      ])?.candidate.id,
    ).toBe(2);
  });

  it('rejects plain-only matches for now', () => {
    expect(
      pickBestSyncedCandidate(track, [
        {
          id: 2,
          trackName: 'Espresso',
          artistName: 'Sabrina Carpenter',
          duration: 175,
          plainLyrics: 'Plain only',
          syncedLyrics: '',
        },
      ]),
    ).toBeUndefined();
  });

  it('rejects candidates with distant durations', () => {
    expect(
      pickBestSyncedCandidate(track, [
        {
          id: 2,
          trackName: 'Espresso',
          artistName: 'Sabrina Carpenter',
          duration: 260,
          syncedLyrics: '[00:01.00]Wrong duration',
        },
      ]),
    ).toBeUndefined();
  });

  it('accepts fuzzy official MV durations when title and artist are strong', () => {
    expect(
      pickBestSyncedCandidate(
        {
          title: decoratedFadedTitle,
          artist: labelUploader,
          duration: 229,
        },
        [
          {
            id: 7,
            trackName: fadedTitle,
            artistName: 'Vast & Hazy',
            duration: 191,
            syncedLyrics: '[00:01.00]Correct song',
          },
        ],
      )?.candidate.id,
    ).toBe(7);
  });

  it('keeps version mismatches out of automatic matches', () => {
    expect(
      pickBestSyncedCandidate(track, [
        {
          id: 3,
          trackName: 'Espresso - Live',
          artistName: 'Sabrina Carpenter',
          albumName: 'Live Session',
          duration: 175,
          syncedLyrics: '[00:01.00]Wrong version',
        },
      ]),
    ).toBeUndefined();
  });

  it('keeps lower-confidence matches available for a future candidate list', () => {
    const matches = rankSyncedCandidates(track, [
      {
        id: 3,
        trackName: 'Espresso',
        artistName: 'Sabrina Carpenter',
        duration: 260,
        syncedLyrics: '[00:01.00]Maybe too long',
      },
    ]);

    expect(matches[0]).toMatchObject({
      confidence: 'candidate',
      durationDelta: 85,
    });
  });
});

describe('findLrclibSyncedLyrics', () => {
  it('fetches search results and returns a storable LRCLIB source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 42,
            trackName: 'Espresso',
            artistName: 'Sabrina Carpenter',
            albumName: 'Short n Sweet',
            duration: 175,
            instrumental: false,
            plainLyrics: 'Now he is thinkin bout me',
            syncedLyrics: '[00:01.00]Now he is thinkin bout me',
          },
        ]),
      ),
    );

    const result = await findLrclibSyncedLyrics(
      {
        title: 'Espresso (Official Music Video)',
        artist: 'Sabrina Carpenter',
        duration: 175,
      },
      {
        fetch: fetchMock,
        baseUrl: 'https://lrclib.example.test',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/search');
    expect(url.searchParams.get('track_name')).toBe('Espresso');
    expect(url.searchParams.get('artist_name')).toBe('Sabrina Carpenter');
    expect(result).toMatchObject({
      provider: 'lrclib',
      status: 'available',
      source: {
        filename: 'lrclib-42.lrc',
        language: 'und',
        kind: 'lrclib',
      },
      lineCount: 1,
    });
  });

  it('tries title-derived queries when uploader metadata is not the artist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 42,
              trackName: fadedTitle,
              artistName: 'Vast & Hazy',
              albumName: 'Civilization',
              duration: 191,
              instrumental: false,
              syncedLyrics: `[00:01.00]${fadedTitle}`,
            },
          ]),
        ),
      )
      .mockResolvedValue(new Response(JSON.stringify([])));

    const result = await findLrclibSyncedLyrics(
      {
        title: decoratedFadedTitle,
        artist: labelUploader,
        duration: 229,
      },
      {
        fetch: fetchMock,
        baseUrl: 'https://lrclib.example.test',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondUrl.searchParams.get('track_name')).toBe(fadedTitle);
    expect(secondUrl.searchParams.get('artist_name')).toBe('Vast & Hazy');
    expect(result).toMatchObject({
      status: 'available',
      source: { filename: 'lrclib-42.lrc' },
      match: {
        confidence: 'auto',
        durationDelta: 38,
        querySource: 'title-derived',
      },
    });
  });

  it('returns unavailable when there is no conservative synced match', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 42,
              trackName: 'Different Song',
              artistName: 'Sabrina Carpenter',
              duration: 175,
              syncedLyrics: '[00:01.00]Nope',
            },
          ]),
        ),
      ),
    );

    await expect(
      findLrclibSyncedLyrics(
        {
          title: 'Espresso',
          artist: 'Sabrina Carpenter',
          duration: 175,
        },
        { fetch: fetchMock },
      ),
    ).resolves.toMatchObject({
      provider: 'lrclib',
      status: 'unavailable',
      reason: 'no-safe-synced-match',
    });
  });
});
