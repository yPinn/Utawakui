import { describe, expect, it, vi } from 'vitest';
import {
  buildMusicBrainzQuery,
  createMusicBrainzClient,
  normalizeRecording,
  normalizeReleaseGroup,
} from './client.js';

function jsonResponse(value, options = {}) {
  return new Response(JSON.stringify(value), {
    status: options.status ?? 200,
    headers: options.headers,
  });
}

describe('MusicBrainz client', () => {
  it('escapes structured Lucene fields without accepting unbounded input', () => {
    expect(
      buildMusicBrainzQuery('release-group', {
        title: 'Song: "Live"',
        artist: 'AC/DC',
      }),
    ).toBe('releasegroup:"Song\\: \\"Live\\"" AND artist:"AC\\/DC"');
    expect(
      buildMusicBrainzQuery('recording', {
        title: 'x'.repeat(201),
        artist: 'Artist',
      }),
    ).toBe(null);
  });

  it('normalizes release-group and recording observations into bounded provider records', () => {
    expect(
      normalizeReleaseGroup({
        id: '11111111-1111-4111-8111-111111111111',
        title: '歌曲',
        score: 98,
        'first-release-date': '2024-01-02',
        'primary-type': 'Single',
        'secondary-types': ['Live'],
        'artist-credit': [
          { name: '歌手', joinphrase: ' feat. ' },
          { artist: { name: '來賓' } },
        ],
      }),
    ).toEqual({
      entityType: 'release-group',
      id: '11111111-1111-4111-8111-111111111111',
      title: '歌曲',
      artistCredit: '歌手 feat. 來賓',
      firstReleaseDate: '2024-01-02',
      primaryType: 'Single',
      secondaryTypes: ['Live'],
      score: 98,
    });

    expect(
      normalizeRecording({
        id: '22222222-2222-4222-8222-222222222222',
        title: '歌曲',
        length: 181234,
        isrcs: ['TWABC2400001'],
        'artist-credit': [{ artist: { name: '歌手' } }],
        releases: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            title: '專輯',
            status: 'Official',
            date: '2024-01-02',
            country: 'TW',
            'release-group': {
              id: '44444444-4444-4444-8444-444444444444',
              title: '專輯',
              'primary-type': 'Album',
              'secondary-types': [],
            },
          },
        ],
      }),
    ).toMatchObject({
      entityType: 'recording',
      title: '歌曲',
      duration: 181,
      artistCredit: '歌手',
      isrcs: ['TWABC2400001'],
      releases: [
        {
          title: '專輯',
          status: 'Official',
          country: 'TW',
          releaseGroup: { primaryType: 'Album' },
        },
      ],
    });
  });

  it('uses the shared scheduler, identifying User-Agent, response bounds, and a short cache', async () => {
    const schedule = vi.fn((operation) => operation());
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        'release-groups': [
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Song',
            'artist-credit': [{ artist: { name: 'Artist' } }],
          },
        ],
      }),
    );
    const client = createMusicBrainzClient({
      fetch,
      scheduler: { schedule, deferFor: vi.fn() },
      now: () => 100,
      cacheTtlMs: 1_000,
    });

    await expect(
      client.searchReleaseGroups({ title: 'Song', artist: 'Artist' }),
    ).resolves.toMatchObject({ status: 'ok', records: [{ title: 'Song' }] });
    await client.searchReleaseGroups({ title: 'Song', artist: 'Artist' });

    expect(schedule).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url.hostname).toBe('musicbrainz.org');
    expect(url.pathname).toBe('/ws/2/release-group');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(request.redirect).toBe('error');
    expect(request.headers['User-Agent']).toMatch(
      /^Utawakui\/\d+\.\d+\.\d+ \(.+\)$/u,
    );
  });

  it('retries one service-busy response through the scheduler and rejects oversized provider arrays', async () => {
    const deferFor = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    const client = createMusicBrainzClient({
      fetch,
      scheduler: {
        schedule: (operation) => operation(),
        deferFor,
      },
    });

    await expect(
      client.searchRecordings({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({ status: 'ok', records: [], invalidRecordCount: 0 });
    expect(deferFor).toHaveBeenCalledWith(1_100);

    fetch.mockResolvedValueOnce(
      jsonResponse({
        recordings: Array.from({ length: 26 }, (_, index) => ({
          id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
          title: 'Song',
        })),
      }),
    );
    await expect(
      client.searchRecordings({ title: 'Another', artist: 'Artist' }),
    ).resolves.toEqual({ status: 'error', reason: 'response-too-large' });
  });
});
