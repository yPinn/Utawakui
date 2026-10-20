import { describe, expect, it, vi } from 'vitest';
import {
  buildMusicBrainzQuery,
  createMusicBrainzClient,
  normalizeArtist,
  normalizeRecording,
  normalizeReleaseGroup,
} from './client.js';
import { createProviderRequestScheduler } from '../providerRequestScheduler.js';

function jsonResponse(value, options = {}) {
  return new Response(JSON.stringify(value), {
    status: options.status ?? 200,
    headers: options.headers,
  });
}

function trafficHarness(fetch) {
  let currentTime = Date.UTC(2026, 9, 20);
  const starts = [];
  const now = () => currentTime;
  const scheduler = createProviderRequestScheduler({
    intervalMs: 1_100,
    now,
    wait: async (delayMs) => {
      currentTime += delayMs;
    },
  });
  const createClient = () =>
    createMusicBrainzClient({
      fetch: (...args) => {
        starts.push(currentTime);
        return fetch(...args);
      },
      now,
      scheduler,
    });
  return {
    createClient,
    now,
    starts,
    advance: (delayMs) => {
      currentTime += delayMs;
    },
  };
}

describe('MusicBrainz client', () => {
  it('escapes structured Lucene fields without accepting unbounded input', () => {
    expect(buildMusicBrainzQuery('artist', { artist: 'JJ Lin (林俊傑)' })).toBe(
      'artist:"JJ Lin \\(林俊傑\\)"',
    );
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

  it('normalizes artist names and at most 32 bounded aliases', () => {
    expect(
      normalizeArtist({
        id: '11111111-1111-4111-8111-111111111111',
        name: '林俊傑',
        'sort-name': 'Lin, JJ',
        type: 'Person',
        disambiguation: 'Singaporean singer-songwriter',
        score: 100,
        aliases: [
          {
            name: 'JJ Lin',
            'sort-name': 'JJ Lin',
            locale: 'en',
            primary: true,
            type: 'Artist name',
          },
          ...Array.from({ length: 40 }, (_, index) => ({
            name: `Alias ${index}`,
          })),
          { name: 'x'.repeat(201) },
        ],
      }),
    ).toMatchObject({
      entityType: 'artist',
      id: '11111111-1111-4111-8111-111111111111',
      name: '林俊傑',
      sortName: 'Lin, JJ',
      type: 'Person',
      disambiguation: 'Singaporean singer-songwriter',
      score: 100,
      aliases: [
        {
          name: 'JJ Lin',
          sortName: 'JJ Lin',
          locale: 'en',
          primary: true,
          type: 'Artist name',
        },
        ...Array.from({ length: 31 }, (_, index) => ({
          name: `Alias ${index}`,
          primary: false,
        })),
      ],
    });
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
        'artist-credit': [
          {
            artist: {
              id: '55555555-5555-4555-8555-555555555555',
              name: '歌手',
            },
          },
        ],
        releases: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            title: '專輯',
            status: 'Official',
            date: '2024-01-02',
            country: 'TW',
            'cover-art-archive': {
              artwork: true,
              front: true,
              back: false,
              count: 1,
              darkened: false,
            },
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
      artistCredits: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: '歌手',
          joinPhrase: '',
        },
      ],
      releases: [
        {
          title: '專輯',
          status: 'Official',
          country: 'TW',
          coverArtArchive: {
            artwork: true,
            front: true,
            back: false,
            count: 1,
            darkened: false,
          },
          releaseGroup: { primaryType: 'Album' },
        },
      ],
    });
  });

  it('searches the artist endpoint through the same bounded client and scheduler', async () => {
    const schedule = vi.fn((operation) => operation());
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        artists: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: '林俊傑',
            aliases: [{ name: 'JJ Lin', locale: 'en' }],
          },
        ],
      }),
    );
    const client = createMusicBrainzClient({
      fetch,
      scheduler: { schedule, deferFor: vi.fn() },
    });

    await expect(
      client.searchArtists({ artist: 'JJ Lin' }),
    ).resolves.toMatchObject({
      status: 'ok',
      records: [
        {
          entityType: 'artist',
          name: '林俊傑',
          aliases: [{ name: 'JJ Lin' }],
        },
      ],
    });
    const [url] = fetch.mock.calls[0];
    expect(url.pathname).toBe('/ws/2/artist');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(schedule).toHaveBeenCalledOnce();
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
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    const traffic = trafficHarness(fetch);
    const client = traffic.createClient();

    await expect(
      client.searchRecordings({ title: 'Song', artist: 'Artist' }),
    ).resolves.toEqual({ status: 'ok', records: [], invalidRecordCount: 0 });
    expect(traffic.starts[1] - traffic.starts[0]).toBe(5_000);

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

  it('shares a 429 cooldown across clients without retrying or waiting on new lookups', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 429, headers: { 'Retry-After': '30' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ artists: [] }));
    const traffic = trafficHarness(fetch);
    const first = traffic.createClient();
    const second = traffic.createClient();
    const initialTime = traffic.now();

    await expect(first.searchArtists({ artist: 'First' })).resolves.toEqual({
      status: 'error',
      reason: 'rate-limited',
      httpStatus: 429,
    });
    await expect(second.searchRecordings({ title: 'Other' })).resolves.toEqual({
      status: 'error',
      reason: 'rate-limited',
      httpStatus: 429,
    });
    expect(traffic.now()).toBe(initialTime);
    expect(fetch).toHaveBeenCalledOnce();

    traffic.advance(29_999);
    await second.searchArtists({ artist: 'Second' });
    expect(fetch).toHaveBeenCalledOnce();
    traffic.advance(1);
    await expect(
      second.searchArtists({ artist: 'Second' }),
    ).resolves.toMatchObject({
      status: 'ok',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('checks cooldown inside already queued requests before releasing the scheduler', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({}, { status: 429 })),
      );
    const traffic = trafficHarness(fetch);
    const first = traffic.createClient();
    const second = traffic.createClient();
    const results = await Promise.all([
      first.searchArtists({ artist: 'First' }),
      second.searchReleaseGroups({ title: 'Queued' }),
    ]);
    expect(results.map((result) => result.reason)).toEqual([
      'rate-limited',
      'rate-limited',
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['2', new Date(Date.UTC(2026, 9, 20) + 2_000).toUTCString()])(
    'honors a short 503 Retry-After %s before its only automatic retry',
    async (retryAfter) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            {},
            { status: 503, headers: { 'Retry-After': retryAfter } },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ recordings: [] }));
      const traffic = trafficHarness(fetch);
      await expect(
        traffic.createClient().searchRecordings({ title: 'Song' }),
      ).resolves.toMatchObject({ status: 'ok' });
      expect(traffic.starts[1] - traffic.starts[0]).toBe(2_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('returns long 503 cooldowns immediately instead of holding the lookup open', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 503, headers: { 'Retry-After': '86400' } }),
      );
    const traffic = trafficHarness(fetch);
    const initialTime = traffic.now();
    const client = traffic.createClient();
    await expect(client.searchArtists({ artist: 'First' })).resolves.toEqual({
      status: 'error',
      reason: 'service-unavailable',
      httpStatus: 503,
    });
    await client.searchArtists({ artist: 'Second' });
    expect(traffic.now()).toBe(initialTime);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('caps fallback backoff while preserving longer server-requested cooldowns', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({}, { status: 429 })),
      );
    const traffic = trafficHarness(fetch);
    const client = traffic.createClient();
    for (const delayMs of [
      30_000, 60_000, 120_000, 240_000, 300_000, 300_000,
    ]) {
      const previousCalls = fetch.mock.calls.length;
      await client.searchArtists({ artist: `Attempt ${previousCalls}` });
      expect(fetch).toHaveBeenCalledTimes(previousCalls + 1);
      traffic.advance(delayMs - 1);
      await client.searchArtists({ artist: 'Cooling down' });
      expect(fetch).toHaveBeenCalledTimes(previousCalls + 1);
      traffic.advance(1);
    }
    fetch.mockResolvedValueOnce(
      jsonResponse({}, { status: 429, headers: { 'Retry-After': '3600' } }),
    );
    await client.searchArtists({ artist: 'Long server cooldown' });
    const previousCalls = fetch.mock.calls.length;
    traffic.advance(3_599_999);
    await client.searchArtists({ artist: 'Still cooling down' });
    expect(fetch).toHaveBeenCalledTimes(previousCalls);
    traffic.advance(1);
    fetch.mockResolvedValueOnce(jsonResponse({ artists: [] }));
    await expect(
      client.searchArtists({ artist: 'Recovered' }),
    ).resolves.toMatchObject({
      status: 'ok',
    });
  });

  it('keeps the normal interval for a shorter server delay', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 503, headers: { 'Retry-After': '0.5' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ recordings: [] }));
    const traffic = trafficHarness(fetch);
    await expect(
      traffic.createClient().searchRecordings({ title: 'Song' }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(traffic.starts[1] - traffic.starts[0]).toBe(1_100);
  });

  it.each([
    'invalid',
    '-1',
    'Infinity',
    '9'.repeat(100),
    'Tue, 20 Oct 2020 00:00:00 GMT',
  ])(
    'uses fallback cooldown for invalid or expired Retry-After %s',
    async (retryAfter) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            {},
            { status: 429, headers: { 'Retry-After': retryAfter } },
          ),
        );
      const traffic = trafficHarness(fetch);
      const client = traffic.createClient();
      await client.searchArtists({ artist: 'First' });
      traffic.advance(29_999);
      await client.searchArtists({ artist: 'Second' });
      expect(fetch).toHaveBeenCalledOnce();
      fetch.mockResolvedValueOnce(jsonResponse({ artists: [] }));
      traffic.advance(1);
      await expect(
        client.searchArtists({ artist: 'Second' }),
      ).resolves.toMatchObject({
        status: 'ok',
      });
    },
  );

  it('backs off repeated busy responses, preserves cached results and resets only on network success', async () => {
    const fetch = vi.fn();
    const traffic = trafficHarness(fetch);
    const client = traffic.createClient();
    fetch.mockResolvedValueOnce(jsonResponse({ artists: [] }));
    await client.searchArtists({ artist: 'Cached' });
    fetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({}, { status: 503 })),
    );
    await expect(
      client.searchArtists({ artist: 'Busy' }),
    ).resolves.toMatchObject({
      reason: 'service-unavailable',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(
      client.searchArtists({ artist: 'Cached' }),
    ).resolves.toMatchObject({
      status: 'ok',
    });
    traffic.advance(9_999);
    await client.searchArtists({ artist: 'Still busy' });
    expect(fetch).toHaveBeenCalledTimes(3);
    traffic.advance(1);
    fetch.mockResolvedValueOnce(jsonResponse({ artists: [] }));
    await client.searchArtists({ artist: 'Recovered' });
    const before = traffic.now();
    fetch
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ artists: [] }));
    await expect(
      client.searchArtists({ artist: 'Later' }),
    ).resolves.toMatchObject({
      status: 'ok',
    });
    expect(traffic.now() - before).toBe(6_100);
  });

  it('does not issue an automatic retry when the caller cancels after a busy response', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(jsonResponse({}, { status: 503 }));
    });
    const traffic = trafficHarness(fetch);
    await expect(
      traffic
        .createClient()
        .searchArtists({ artist: 'First' }, { signal: controller.signal }),
    ).resolves.toMatchObject({ status: 'error', reason: 'timeout' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
