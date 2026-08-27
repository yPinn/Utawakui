import { describe, expect, it, vi } from 'vitest';
import {
  classifyNeteaseLyrics,
  createNeteaseEvaluationClient,
  createNeteaseEvaluationProbe,
  createNeteaseEvaluationScheduler,
  rankNeteaseEvaluationCandidates,
} from './lyrics-provider-netease.mjs';
import { FIXED_LYRICS_PROVIDER_DESCRIPTORS } from './lyrics-provider-probe-registry.mjs';

function reference(overrides = {}) {
  return {
    title: 'Synthetic Example',
    artist: 'Example Artist',
    album: 'Example Album',
    durationSeconds: 180,
    version: 'studio',
    ...overrides,
  };
}

function song(overrides = {}) {
  return {
    id: 1001,
    name: 'Synthetic Example',
    ar: [{ id: 21, name: 'Example Artist' }],
    al: { id: 31, name: 'Example Album' },
    dt: 180_000,
    alia: [],
    tns: [],
    ...overrides,
  };
}

function response(body) {
  return { body };
}

function validYrc() {
  return [
    '[1000,2000](1000,500,0)Syn(1500,500,0)thetic(2000,1000,0) line',
    '[3500,1000](3500,500,0)Next(4000,500,0) line',
  ].join('\n');
}

function immediateNow() {
  let value = 1000;
  return () => {
    value += 25;
    return value;
  };
}

describe('NetEase evaluation candidate matching', () => {
  it('normalizes the official cloudsearch call and returns bounded metadata only', async () => {
    const api = {
      cloudsearch: vi.fn().mockResolvedValue(
        response({
          code: 200,
          result: {
            songs: [song(), song({ id: 'unsafe-id', name: 'provider secret' })],
          },
          privateProviderField: 'must not escape',
        }),
      ),
      lyric_new: vi.fn(),
    };
    const client = createNeteaseEvaluationClient({
      api,
      now: immediateNow(),
    });

    await expect(
      client.search({
        trackName: ' Synthetic Example ',
        artistName: ' Example Artist ',
      }),
    ).resolves.toEqual({
      status: 'ok',
      records: [
        {
          id: 1001,
          title: 'Synthetic Example',
          artists: ['Example Artist'],
          album: 'Example Album',
          durationSeconds: 180,
          aliases: [],
          translatedTitles: [],
        },
      ],
      invalidRecordCount: 1,
      durationMs: 25,
    });
    expect(api.cloudsearch).toHaveBeenCalledWith({
      keywords: 'Synthetic Example Example Artist',
      type: 1,
      limit: 10,
      offset: 0,
      timeout: 10_000,
    });
  });

  it('ranks exact and strong matches ahead of wrong-version and duration traps', () => {
    const ranked = rankNeteaseEvaluationCandidates(reference(), [
      song({ id: 40, name: 'Different Song' }),
      song({ id: 30, name: 'Synthetic Example (Live)' }),
      song({ id: 20, al: { id: 32, name: 'Other Album' }, dt: 187_000 }),
      song({ id: 10 }),
      song({ id: 10 }),
    ]);

    expect(
      ranked.map(({ record, matchBand, versionMismatch }) => [
        record.id,
        matchBand,
        versionMismatch,
      ]),
    ).toEqual([
      [10, 'exact', false],
      [20, 'strong', false],
      [30, 'related', true],
      [40, 'related', false],
    ]);
  });

  it('uses aliases and translated titles without accepting an excessive duration delta', () => {
    const [match] = rankNeteaseEvaluationCandidates(
      reference({ title: '合成歌曲' }),
      [
        song({
          name: 'Synthetic Example',
          alia: ['合成歌曲'],
          dt: 240_000,
        }),
      ],
    );

    expect(match).toMatchObject({
      matchBand: 'related',
      durationDeltaSeconds: 60,
    });
  });
});

describe('NetEase YRC capability validation', () => {
  it('accepts provider-authored absolute word timing as validated T2', () => {
    expect(classifyNeteaseLyrics({ yrc: validYrc(), lrc: null })).toEqual({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      lineCount: 2,
      timedLineCount: 2,
      segmentCount: 5,
      invalidLineCount: 0,
      invalidSegmentCount: 0,
    });
  });

  it('marks out-of-parent and overlapping YRC tokens invalid', () => {
    const yrc = [
      '[1000,1000](900,400,0)outside(1300,800,0)end',
      '[3000,1000](3000,700,0)first(3500,200,0)overlap',
    ].join('\n');

    expect(classifyNeteaseLyrics({ yrc, lrc: null })).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'invalid',
      lineCount: 2,
      timedLineCount: 0,
      invalidLineCount: 2,
      invalidSegmentCount: 3,
    });
  });

  it('classifies line timing as T1 and a matched lyric-less record as T0', () => {
    expect(
      classifyNeteaseLyrics({
        yrc: '',
        lrc: '[00:01.000]Synthetic line\n[00:03.500]Next line',
      }),
    ).toEqual({
      status: 'ok',
      capability: 'T1',
      timingValidation: 'not-applicable',
      lineCount: 2,
      timedLineCount: 2,
      segmentCount: 0,
      invalidLineCount: 0,
      invalidSegmentCount: 0,
    });
    expect(classifyNeteaseLyrics({ yrc: '', lrc: '' })).toEqual({
      status: 'ok',
      capability: 'T0',
      timingValidation: 'not-applicable',
      lineCount: 0,
      timedLineCount: 0,
      segmentCount: 0,
      invalidLineCount: 0,
      invalidSegmentCount: 0,
    });
  });

  it.each([
    [{ yrc: 'x'.repeat(2 * 1024 * 1024 + 1), lrc: '' }, 'response-too-large'],
    [{ yrc: '[broken]', lrc: '' }, 'invalid-record'],
    [{ yrc: null, lrc: 42 }, 'invalid-record'],
  ])('rejects malformed or oversized provider lyrics %#', (value, reason) => {
    expect(classifyNeteaseLyrics(value)).toEqual({
      status: 'error',
      reason,
    });
  });
});

describe('NetEase evaluation client', () => {
  it('serializes provider calls at the evaluation rate boundary', async () => {
    let clock = 0;
    const sleep = vi.fn(async (milliseconds) => {
      clock += milliseconds;
    });
    const scheduler = createNeteaseEvaluationScheduler({
      minimumIntervalMs: 500,
      now: () => clock,
      sleep,
    });
    const starts = [];

    await Promise.all([
      scheduler.schedule(async () => starts.push(clock)),
      scheduler.schedule(async () => starts.push(clock)),
      scheduler.schedule(async () => starts.push(clock)),
    ]);

    expect(starts).toEqual([0, 500, 1000]);
    expect(sleep).toHaveBeenNthCalledWith(1, 500, undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 500, undefined);
  });

  it('fetches lyric_new by numeric id and never returns raw lyric content', async () => {
    const api = {
      cloudsearch: vi.fn(),
      lyric_new: vi.fn().mockResolvedValue(
        response({
          code: 200,
          yrc: { version: 1, lyric: validYrc() },
          lrc: { version: 1, lyric: '[00:01.000]fallback line' },
          ytlrc: { lyric: 'private translation' },
        }),
      ),
    };
    const client = createNeteaseEvaluationClient({
      api,
      now: immediateNow(),
    });

    const result = await client.getLyrics(1001);

    expect(api.lyric_new).toHaveBeenCalledWith({ id: 1001, timeout: 10_000 });
    expect(result).toEqual({
      status: 'ok',
      timing: {
        capability: 'T2',
        timingValidation: 'valid',
        lineCount: 2,
        timedLineCount: 2,
        segmentCount: 5,
        invalidLineCount: 0,
        invalidSegmentCount: 0,
      },
      durationMs: 25,
    });
    expect(JSON.stringify(result)).not.toContain('Synthetic');
    expect(JSON.stringify(result)).not.toContain('private translation');
  });

  it('distinguishes a catalog miss, missing YRC fallback, and upstream failure', async () => {
    const missing = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi
          .fn()
          .mockResolvedValue(response({ code: 200, result: { songs: [] } })),
        lyric_new: vi.fn(),
      },
      now: immediateNow(),
    });
    await expect(
      missing.search({ trackName: 'Missing', artistName: 'Nobody' }),
    ).resolves.toMatchObject({ status: 'ok', records: [] });

    const lineOnly = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi.fn(),
        lyric_new: vi.fn().mockResolvedValue(
          response({
            code: 200,
            lrc: { lyric: '[00:01.000]line only' },
          }),
        ),
      },
      now: immediateNow(),
    });
    await expect(lineOnly.getLyrics(1001)).resolves.toMatchObject({
      status: 'ok',
      timing: { capability: 'T1' },
    });

    const failed = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi
          .fn()
          .mockResolvedValue(response({ code: 503, message: 'private body' })),
        lyric_new: vi.fn(),
      },
      now: immediateNow(),
    });
    await expect(
      failed.search({ trackName: 'Synthetic', artistName: 'Example' }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'service-unavailable',
      durationMs: 25,
    });
  });

  it('contains dependency and thrown-provider failures without leaking details', async () => {
    const unavailable = createNeteaseEvaluationClient({
      loadApi: vi.fn().mockRejectedValue(new Error('private module path')),
      now: immediateNow(),
    });
    await expect(
      unavailable.search({ trackName: 'Synthetic', artistName: 'Example' }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'fetch-unavailable',
      durationMs: 25,
    });

    const providerFailure = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi
          .fn()
          .mockRejectedValue(new Error('secret provider response')),
        lyric_new: vi.fn(),
      },
      now: immediateNow(),
    });
    const result = await providerFailure.search({
      trackName: 'Synthetic',
      artistName: 'Example',
    });
    expect(result).toEqual({
      status: 'error',
      reason: 'provider-failure',
      durationMs: 25,
    });
    expect(JSON.stringify(result)).not.toContain('secret');

    const upstream = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi.fn().mockRejectedValue({
          status: 502,
          body: { code: 502, message: 'private upstream body' },
        }),
        lyric_new: vi.fn(),
      },
      now: immediateNow(),
    });
    await expect(
      upstream.search({ trackName: 'Synthetic', artistName: 'Example' }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'service-unavailable',
      durationMs: 25,
    });
  });

  it('distinguishes provider response schema drift from invalid lyric timing', async () => {
    const searchDrift = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi
          .fn()
          .mockResolvedValue(response({ code: 200, result: { songs: {} } })),
        lyric_new: vi.fn(),
      },
      now: immediateNow(),
    });
    await expect(
      searchDrift.search({
        trackName: 'Synthetic Example',
        artistName: 'Example Artist',
      }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'schema-drift',
      durationMs: 25,
    });

    const lyricDrift = createNeteaseEvaluationClient({
      api: {
        cloudsearch: vi.fn(),
        lyric_new: vi
          .fn()
          .mockResolvedValue(
            response({ code: 200, yrc: { lyric: 42 }, lrc: { lyric: '' } }),
          ),
      },
      now: immediateNow(),
    });
    await expect(lyricDrift.getLyrics(1001)).resolves.toEqual({
      status: 'error',
      reason: 'schema-drift',
      durationMs: 25,
    });
  });
});

describe('NetEase isolated evaluation probe', () => {
  it('emits a sanitized reviewed-observation shape while leaving the fixed registry unchanged', async () => {
    const client = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [
          {
            id: 1001,
            title: 'Synthetic Example',
            artists: ['Example Artist'],
            album: 'Example Album',
            durationSeconds: 180,
            aliases: [],
            translatedTitles: [],
          },
        ],
        invalidRecordCount: 0,
        durationMs: 25,
      }),
      getLyrics: vi.fn().mockResolvedValue({
        status: 'ok',
        timing: {
          capability: 'T2',
          timingValidation: 'valid',
          lineCount: 2,
          timedLineCount: 2,
          segmentCount: 5,
          invalidLineCount: 0,
          invalidSegmentCount: 0,
        },
        durationMs: 25,
      }),
    };
    const onCandidateSelected = vi.fn();
    const probe = createNeteaseEvaluationProbe({
      client,
      now: immediateNow(),
      onCandidateSelected,
    });

    await expect(
      probe({ providerId: 'netease', reference: reference() }),
    ).resolves.toEqual({
      providerId: 'netease',
      request: { status: 'ok', durationMs: 25, failureCode: null },
      catalogStatus: 'match',
      matchBand: 'exact',
      reviewVerdict: 'unreviewed',
      capability: 'T2',
      timingValidation: 'valid',
    });
    expect(client.getLyrics).toHaveBeenCalledWith(1001);
    expect(onCandidateSelected).toHaveBeenCalledWith({
      title: 'Synthetic Example',
      artists: ['Example Artist'],
      album: 'Example Album',
      durationSeconds: 180,
      matchBand: 'exact',
      durationDeltaSeconds: 0,
      versionMismatch: false,
    });
    expect(FIXED_LYRICS_PROVIDER_DESCRIPTORS.map(({ id }) => id)).toEqual([
      'lrclib',
      'amll',
    ]);
  });

  it('returns catalog miss for no acceptable recording and typed failure for invalid input', async () => {
    const client = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [
          {
            id: 1001,
            title: 'Synthetic Example (Live)',
            artists: ['Example Artist'],
            album: 'Live Album',
            durationSeconds: 260,
            aliases: [],
            translatedTitles: [],
          },
        ],
        invalidRecordCount: 0,
        durationMs: 25,
      }),
      getLyrics: vi.fn(),
    };
    const probe = createNeteaseEvaluationProbe({
      client,
      now: immediateNow(),
    });

    await expect(
      probe({ providerId: 'netease', reference: reference() }),
    ).resolves.toEqual({
      providerId: 'netease',
      request: { status: 'ok', durationMs: 25, failureCode: null },
      catalogStatus: 'miss',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });
    expect(client.getLyrics).not.toHaveBeenCalled();

    await expect(probe({ providerId: 'netease' })).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-request' },
    });
  });

  it('propagates the client-owned timeout and rejects a fake in-process deadline', async () => {
    const client = {
      search: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'timeout',
        durationMs: 10_000,
      }),
      getLyrics: vi.fn(),
    };
    const probe = createNeteaseEvaluationProbe({
      client,
      now: immediateNow(),
    });

    await expect(
      probe({ providerId: 'netease', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
    });
    expect(() =>
      createNeteaseEvaluationProbe({
        client,
        probeTimeoutMs: 100,
      }),
    ).toThrow(/invalid NetEase evaluation probe options/i);
  });
});
