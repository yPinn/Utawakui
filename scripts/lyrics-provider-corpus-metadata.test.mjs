import { describe, expect, it, vi } from 'vitest';

import {
  collectMusicBrainzRecordingCandidates,
  createListenBrainzRequestScheduler,
  createMusicBrainzRequestScheduler,
  fetchListenBrainzRecordingPopularity,
  fetchMusicBrainzRecordingPage,
  mergeRecordingPopularity,
} from './lyrics-provider-corpus-metadata.mjs';

const ARTIST_MBID = '11111111-1111-4111-8111-111111111111';
const WORK_MBID = '22222222-2222-4222-8222-222222222222';
const RECORDING_MBIDS = [
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333332',
  '33333333-3333-4333-8333-333333333333',
];

function seed(overrides = {}) {
  return {
    stratum: 'english-catalog',
    seedType: 'work',
    wikidataId: 'Q456',
    musicbrainzId: WORK_MBID,
    ...overrides,
  };
}

function recording(id, overrides = {}) {
  return {
    id,
    title: `Private recording ${id.slice(-1)}`,
    length: 180_000,
    video: false,
    disambiguation: '',
    'first-release-date': '2024-01-02',
    isrcs: [],
    'artist-credit': [
      {
        name: 'Private Artist',
        joinphrase: '',
        artist: {
          id: ARTIST_MBID,
          name: 'Private Artist',
          'sort-name': 'Artist, Private',
        },
      },
    ],
    ...overrides,
  };
}

function musicBrainzResponse({ offset = 0, count = 1, recordings } = {}) {
  return new Response(
    JSON.stringify({
      'recording-offset': offset,
      'recording-count': count,
      recordings: recordings ?? [recording(RECORDING_MBIDS[0])],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function immediateScheduler() {
  return {
    schedule: (operation) => operation(),
    deferFor: vi.fn(),
  };
}

describe('MusicBrainz candidate metadata', () => {
  it('serializes all MusicBrainz work and artist requests at 1.1 seconds', async () => {
    let currentTime = 0;
    const starts = [];
    const scheduler = createMusicBrainzRequestScheduler({
      now: () => currentTime,
      wait: async (delayMs) => {
        currentTime += delayMs;
      },
    });

    await Promise.all([
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
      scheduler.schedule(async () => starts.push(currentTime)),
    ]);

    expect(starts).toEqual([0, 1_100, 2_200]);
  });

  it.each([
    ['artist', 'artist', ARTIST_MBID],
    ['work', 'work', WORK_MBID],
  ])(
    'uses the official recording browse endpoint for %s seeds',
    async (seedType, key, id) => {
      const fetchFn = vi.fn(async () => musicBrainzResponse());
      const scheduler = immediateScheduler();

      const page = await fetchMusicBrainzRecordingPage(
        seed({ seedType, musicbrainzId: id }),
        { fetchFn, scheduler, offset: 0 },
      );

      expect(page).toEqual({
        offset: 0,
        total: 1,
        returnedCount: 1,
        recordings: [
          {
            stratum: 'english-catalog',
            languageTag: 'english',
            recordingMbid: RECORDING_MBIDS[0],
            primaryArtistMbid: ARTIST_MBID,
            workQid: seedType === 'work' ? 'Q456' : null,
            workMbid: seedType === 'work' ? WORK_MBID : null,
            title: 'Private recording 1',
            artist: 'Private Artist',
            album: null,
            durationMs: 180_000,
            firstReleaseDate: '2024-01-02',
          },
        ],
      });
      const [requestUrl, options] = fetchFn.mock.calls[0];
      const url = new URL(requestUrl);
      expect(url.origin).toBe('https://musicbrainz.org');
      expect(url.pathname).toBe('/ws/2/recording');
      expect(url.searchParams.get(key)).toBe(id);
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('offset')).toBe('0');
      expect(url.searchParams.get('inc')).toBe('artist-credits+isrcs');
      expect(url.searchParams.has('releases')).toBe(false);
      expect(options).toEqual(
        expect.objectContaining({
          method: 'GET',
          redirect: 'error',
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            accept: 'application/json',
            'user-agent': expect.stringContaining('Utawakui'),
          }),
        }),
      );
    },
  );

  it('preserves MusicBrainz credited artist join phrases and first primary artist id', async () => {
    const fetchFn = vi.fn(async () =>
      musicBrainzResponse({
        recordings: [
          recording(RECORDING_MBIDS[0], {
            'artist-credit': [
              {
                name: 'Artist A',
                joinphrase: ' feat. ',
                artist: { id: ARTIST_MBID, name: 'Artist A' },
              },
              {
                name: 'Artist B',
                joinphrase: '',
                artist: {
                  id: '44444444-4444-4444-8444-444444444444',
                  name: 'Artist B',
                },
              },
            ],
          }),
        ],
      }),
    );

    const page = await fetchMusicBrainzRecordingPage(seed(), {
      fetchFn,
      scheduler: immediateScheduler(),
    });

    expect(page.recordings[0]).toEqual(
      expect.objectContaining({
        artist: 'Artist A feat. Artist B',
        primaryArtistMbid: ARTIST_MBID,
      }),
    );
  });

  it('paginates using returned offsets and short page lengths', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        musicBrainzResponse({
          offset: 0,
          count: 3,
          recordings: [
            recording(RECORDING_MBIDS[0]),
            recording(RECORDING_MBIDS[1]),
          ],
        }),
      )
      .mockResolvedValueOnce(
        musicBrainzResponse({
          offset: 2,
          count: 3,
          recordings: [recording(RECORDING_MBIDS[2])],
        }),
      );

    const result = await collectMusicBrainzRecordingCandidates([seed()], {
      fetchFn,
      scheduler: immediateScheduler(),
      maxPagesPerSeed: 2,
    });

    expect(result.map(({ recordingMbid }) => recordingMbid)).toEqual(
      RECORDING_MBIDS,
    );
    expect(new URL(fetchFn.mock.calls[1][0]).searchParams.get('offset')).toBe(
      '2',
    );
  });

  it('drops videos and metadata that cannot become runnable references', async () => {
    const fetchFn = vi.fn(async () =>
      musicBrainzResponse({
        count: 4,
        recordings: [
          recording(RECORDING_MBIDS[0], { video: true }),
          recording(RECORDING_MBIDS[1], { length: null }),
          recording(RECORDING_MBIDS[2], { 'artist-credit': [] }),
          recording('55555555-5555-4555-8555-555555555555'),
        ],
      }),
    );

    const page = await fetchMusicBrainzRecordingPage(seed(), {
      fetchFn,
      scheduler: immediateScheduler(),
    });

    expect(page.recordings).toHaveLength(1);
    expect(page.recordings[0].recordingMbid).toBe(
      '55555555-5555-4555-8555-555555555555',
    );
  });

  it('retries bounded transient failures and honors Retry-After', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 503,
          headers: { 'retry-after': '2' },
        }),
      )
      .mockResolvedValueOnce(musicBrainzResponse());
    const scheduler = {
      schedule: vi.fn((operation) => operation()),
      deferFor: vi.fn(),
    };

    await expect(
      fetchMusicBrainzRecordingPage(seed(), { fetchFn, scheduler }),
    ).resolves.toMatchObject({ total: 1 });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
    expect(scheduler.deferFor).toHaveBeenCalledWith(2_000);
  });

  it('retries a body transport failure after headers arrive', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('private body transport failure'));
            },
          }),
        ),
      )
      .mockResolvedValueOnce(musicBrainzResponse());
    const scheduler = immediateScheduler();

    await expect(
      fetchMusicBrainzRecordingPage(seed(), { fetchFn, scheduler }),
    ).resolves.toMatchObject({ total: 1 });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(scheduler.deferFor).toHaveBeenCalledWith(1_000);
  });

  it('bounds retry exhaustion and fallback delays', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 503 }));
    const scheduler = immediateScheduler();

    await expect(
      fetchMusicBrainzRecordingPage(seed(), { fetchFn, scheduler }),
    ).rejects.toThrow(/service unavailable/i);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(scheduler.deferFor.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('caps MusicBrainz Retry-After before retrying', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          headers: { 'retry-after': '120' },
        }),
      )
      .mockResolvedValueOnce(musicBrainzResponse());
    const scheduler = immediateScheduler();

    await expect(
      fetchMusicBrainzRecordingPage(seed(), { fetchFn, scheduler }),
    ).resolves.toMatchObject({ total: 1 });
    expect(scheduler.deferFor).toHaveBeenCalledWith(60_000);
  });

  it('retries a transport rejection before headers arrive', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('private transport failure'))
      .mockResolvedValueOnce(musicBrainzResponse());
    const scheduler = immediateScheduler();

    await expect(
      fetchMusicBrainzRecordingPage(seed(), { fetchFn, scheduler }),
    ).resolves.toMatchObject({ total: 1 });
    expect(scheduler.deferFor).toHaveBeenCalledWith(1_000);
  });

  it('does not retry non-transient HTTP failures', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 400 }));

    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        fetchFn,
        scheduler: immediateScheduler(),
      }),
    ).rejects.toThrow(/request failed/i);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('treats a missing MusicBrainz seed as an empty browse result', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));

    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        fetchFn,
        scheduler: immediateScheduler(),
      }),
    ).resolves.toEqual({
      offset: 0,
      total: 0,
      returnedCount: 0,
      recordings: [],
    });

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it.each([
    [async () => new Response('{}', { status: 503 }), /service unavailable/i],
    [async () => new Response('{', { status: 200 }), /invalid JSON/i],
    [
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-length': '2000001' },
        }),
      /too large/i,
    ],
    [
      async () =>
        new Response(
          JSON.stringify({
            'recording-offset': 2,
            'recording-count': 1,
            recordings: [],
          }),
        ),
      /pagination/i,
    ],
  ])('rejects bounded MusicBrainz source failures', async (fetchFn, error) => {
    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        fetchFn,
        scheduler: immediateScheduler(),
      }),
    ).rejects.toThrow(error);
  });

  it('cancels non-success and declared-oversize response bodies', async () => {
    const cancellations = [];
    const responseWithPendingBody = (status, headers = {}) =>
      new Response(
        new ReadableStream({
          cancel() {
            cancellations.push(status);
          },
        }),
        { status, headers },
      );
    const scheduler = immediateScheduler();

    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        scheduler,
        fetchFn: async () => responseWithPendingBody(400),
      }),
    ).rejects.toThrow(/request failed/i);
    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        scheduler,
        fetchFn: async () =>
          responseWithPendingBody(200, { 'content-length': '2000001' }),
      }),
    ).rejects.toThrow(/too large/i);
    expect(cancellations).toEqual([400, 200]);
  });

  it('enforces streamed size and stalled-body timeout without content-length', async () => {
    await expect(
      fetchMusicBrainzRecordingPage(seed(), {
        scheduler: immediateScheduler(),
        fetchFn: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2_000_001));
              },
              cancel() {
                throw new Error('private stream cancellation failure');
              },
            }),
          ),
      }),
    ).rejects.toThrow(/too large/i);

    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        async (_url, { signal }) =>
          new Response(
            new ReadableStream({
              start(controller) {
                signal.addEventListener(
                  'abort',
                  () => controller.error(signal.reason),
                  { once: true },
                );
              },
            }),
          ),
      );
      const pending = fetchMusicBrainzRecordingPage(seed(), {
        fetchFn,
        scheduler: immediateScheduler(),
      });
      const expectation = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await expectation;
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ListenBrainz recording popularity', () => {
  it('serializes batches and honors server reset headers', async () => {
    let currentTime = 0;
    const scheduler = createListenBrainzRequestScheduler({
      intervalMs: 0,
      now: () => currentTime,
      wait: async (delayMs) => {
        currentTime += delayMs;
      },
    });
    const deferFor = vi.spyOn(scheduler, 'deferFor');
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              recording_mbid: RECORDING_MBIDS[0],
              total_listen_count: 1,
              total_user_count: 1,
            },
          ]),
          {
            status: 200,
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset-in': '2',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              recording_mbid: RECORDING_MBIDS[1],
              total_listen_count: 2,
              total_user_count: 2,
            },
          ]),
          { status: 200 },
        ),
      );

    await fetchListenBrainzRecordingPopularity(RECORDING_MBIDS.slice(0, 2), {
      fetchFn,
      scheduler,
      batchSize: 1,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(deferFor).toHaveBeenCalledWith(2_000);
    expect(currentTime).toBe(2_000);
  });

  it('posts deduplicated MBIDs in bounded batches and preserves requested order', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              recording_mbid: RECORDING_MBIDS[0],
              total_listen_count: 100,
              total_user_count: 10,
            },
            {
              recording_mbid: RECORDING_MBIDS[1],
              total_listen_count: null,
              total_user_count: null,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              recording_mbid: RECORDING_MBIDS[2],
              total_listen_count: 300,
              total_user_count: 30,
            },
          ]),
          { status: 200 },
        ),
      );

    const result = await fetchListenBrainzRecordingPopularity(
      [...RECORDING_MBIDS, RECORDING_MBIDS[0]],
      { fetchFn, batchSize: 2 },
    );

    expect(result).toEqual([
      { recordingMbid: RECORDING_MBIDS[0], listenCount: 100, userCount: 10 },
      { recordingMbid: RECORDING_MBIDS[1], listenCount: null, userCount: null },
      { recordingMbid: RECORDING_MBIDS[2], listenCount: 300, userCount: 30 },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      'https://api.listenbrainz.org/1/popularity/recording',
      'https://api.listenbrainz.org/1/popularity/recording',
    ]);
    expect(
      fetchFn.mock.calls.map(([, options]) => JSON.parse(options.body)),
    ).toEqual([
      { recording_mbids: RECORDING_MBIDS.slice(0, 2) },
      { recording_mbids: RECORDING_MBIDS.slice(2) },
    ]);
  });

  it('drops unknown popularity instead of treating null as zero or a miss', () => {
    const metadata = RECORDING_MBIDS.slice(0, 2).map((recordingMbid) => ({
      ...seed(),
      languageTag: 'english',
      recordingMbid,
      primaryArtistMbid: ARTIST_MBID,
      workQid: 'Q456',
      workMbid: WORK_MBID,
      title: 'Private title',
      artist: 'Private artist',
      album: null,
      durationMs: 180_000,
      firstReleaseDate: null,
    }));
    const result = mergeRecordingPopularity(metadata, [
      { recordingMbid: RECORDING_MBIDS[0], listenCount: 20, userCount: 4 },
      { recordingMbid: RECORDING_MBIDS[1], listenCount: null, userCount: null },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ listenCount: 20, userCount: 4 }),
    );
  });

  it.each([
    [401, /auth required/i],
    [429, /rate limited/i],
    [503, /service unavailable/i],
  ])('classifies ListenBrainz HTTP %i separately', async (status, error) => {
    await expect(
      fetchListenBrainzRecordingPopularity([RECORDING_MBIDS[0]], {
        fetchFn: async () => new Response('{}', { status }),
      }),
    ).rejects.toThrow(error);
  });

  it('rejects reordered or mismatched popularity responses', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              recording_mbid: RECORDING_MBIDS[1],
              total_listen_count: 2,
              total_user_count: 1,
            },
            {
              recording_mbid: RECORDING_MBIDS[0],
              total_listen_count: 2,
              total_user_count: 1,
            },
          ]),
        ),
    );

    await expect(
      fetchListenBrainzRecordingPopularity(RECORDING_MBIDS.slice(0, 2), {
        fetchFn,
      }),
    ).rejects.toThrow(/order/i);
  });
});
