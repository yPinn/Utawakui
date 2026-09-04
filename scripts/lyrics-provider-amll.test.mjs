import { describe, expect, it, vi } from 'vitest';
import {
  AMLL_API_BASE_URL,
  buildAmllSearchUrl,
  createAmllEvaluationClient,
  createAmllEvaluationProbe,
  createAmllEvaluationScheduler,
  rankAmllEvaluationCandidates,
  toAmllEvaluationObservation,
} from './lyrics-provider-amll.mjs';
import { classifyAmllTtml } from './lyrics-provider-amll-ttml.mjs';

function songItem(overrides = {}) {
  return {
    id: 123456789,
    filename: 'synthetic-example.ttml',
    musicNames: ['Synthetic Example'],
    artistNames: ['Example Artist'],
    albumNames: ['Example Album'],
    ncmMusicIds: ['1001'],
    qqMusicIds: [],
    appleMusicIds: [],
    spotifyIds: [],
    isrcs: ['EXAAA2600001'],
    authorIds: ['42'],
    authorUsernames: ['example-author'],
    format: 'ttml',
    ...overrides,
  };
}

function envelope(data, status = 200) {
  return { status, data };
}

function searchEnvelope(items = [songItem()]) {
  return envelope({
    items,
    pagination: {
      page: 1,
      pageSize: 10,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      hasMore: false,
    },
  });
}

function wordTtml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"
    itunes:timing="Word">
  <body dur="00:10.000">
    ${
      body ||
      `<p begin="00:01.000" end="00:03.000"><span begin="00:01.000" end="00:02.000">Synthetic</span> <span begin="00:02.000" end="00:03.000">line</span></p>`
    }
  </body>
</tt>`;
}

function lineTtml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"
    itunes:timing="Line">
  <body dur="10s">
    <p begin="1s" end="3s">Synthetic line</p>
  </body>
</tt>`;
}

function immediateNow() {
  let value = 1000;
  return () => {
    value += 25;
    return value;
  };
}

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

describe('AMLL evaluation query contract', () => {
  it('builds a bounded structured search against the official endpoint', () => {
    const url = buildAmllSearchUrl({
      trackName: '合成歌曲 & Example',
      artistName: 'Example Artist',
      albumName: '',
    });

    expect(url.origin).toBe(AMLL_API_BASE_URL);
    expect(url.pathname).toBe('/v1/lyrics/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      musicName: '合成歌曲 & Example',
      artistName: 'Example Artist',
      page: '1',
      pageSize: '10',
    });
    expect(() => buildAmllSearchUrl({ trackName: '' })).toThrow(
      /invalid AMLL search request/i,
    );
  });

  it.each([
    null,
    {},
    { trackName: '' },
    { trackName: 'x'.repeat(257) },
    { trackName: 'Synthetic', pageSize: 26 },
    { trackName: 'Synthetic', extra: 'not-allowed' },
  ])(
    'rejects an invalid search query without issuing a request %#',
    async (query) => {
      const fetch = vi.fn();
      const client = createAmllEvaluationClient({ fetch });

      await expect(client.search(query)).resolves.toEqual({
        status: 'error',
        reason: 'invalid-request',
        durationMs: 0,
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('AMLL evaluation scheduler', () => {
  it('serializes concurrent work and enforces a provider-local interval', async () => {
    let clock = 0;
    const sleep = vi.fn(async (milliseconds) => {
      clock += milliseconds;
    });
    const scheduler = createAmllEvaluationScheduler({
      minimumIntervalMs: 100,
      now: () => clock,
      sleep,
    });
    const starts = [];

    await Promise.all([
      scheduler.schedule(async () => starts.push(clock)),
      scheduler.schedule(async () => starts.push(clock)),
      scheduler.schedule(async () => starts.push(clock)),
    ]);

    expect(starts).toEqual([0, 100, 200]);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 100);
  });

  it('cancels a queued task without starting it', async () => {
    let clock = 0;
    const sleep = vi.fn((_milliseconds, signal) => {
      if (!signal) return Promise.reject(new Error('missing abort signal'));
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const scheduler = createAmllEvaluationScheduler({
      minimumIntervalMs: 100,
      now: () => clock,
      sleep,
    });
    await scheduler.schedule(async () => {
      clock = 1;
    });
    const operation = vi.fn();
    const controller = new AbortController();
    const pending = scheduler.schedule(operation, {
      signal: controller.signal,
    });
    controller.abort(
      Object.assign(new Error('probe deadline exceeded'), {
        name: 'TimeoutError',
      }),
    );

    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(operation).not.toHaveBeenCalled();
  });
});

describe('AMLL evaluation candidate ranking', () => {
  it('ranks exact, strong, and related metadata deterministically', () => {
    const ranked = rankAmllEvaluationCandidates(
      {
        title: 'Synthetic Example',
        artist: 'Example Artist',
        album: 'Example Album',
        durationSeconds: 180,
        version: 'studio',
      },
      [
        songItem({
          id: 30,
          musicNames: ['Different Song'],
          artistNames: ['Another Artist'],
        }),
        songItem({ id: 20, albumNames: ['Different Album'] }),
        songItem({ id: 10 }),
        songItem({ id: 10 }),
      ],
    );

    expect(
      ranked.map(({ record, matchBand }) => [record.id, matchBand]),
    ).toEqual([
      [10, 'exact'],
      [20, 'strong'],
      [30, 'related'],
    ]);
  });

  it('demotes incompatible recording versions and rejects malformed references', () => {
    const ranked = rankAmllEvaluationCandidates(
      {
        title: 'Synthetic Example',
        artist: 'Example Artist',
        album: 'Example Album',
        durationSeconds: 180,
        version: 'studio',
      },
      [songItem({ musicNames: ['Synthetic Example (Live)'] })],
    );
    expect(ranked[0]).toMatchObject({
      matchBand: 'related',
      versionMismatch: true,
    });
    expect(() => rankAmllEvaluationCandidates(null, [])).toThrow(
      /invalid AMLL evaluation reference/i,
    );
  });

  it('does not detect live inside ordinary Latin words', () => {
    const [match] = rankAmllEvaluationCandidates(
      {
        title: 'Deliver Me',
        artist: 'Example Artist',
        album: 'Olive Branch',
        durationSeconds: 180,
        version: 'studio',
      },
      [
        songItem({
          musicNames: ['Deliver Me'],
          artistNames: ['Example Artist'],
          albumNames: ['Olive Branch'],
        }),
      ],
    );

    expect(match).toMatchObject({
      matchBand: 'exact',
      versionMismatch: false,
    });
  });

  it('detects uppercase version markers independently of the host locale', () => {
    const originalLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const hostLocale = vi
      .spyOn(String.prototype, 'toLocaleLowerCase')
      .mockImplementation(function localeLowerCaseForTurkishHost() {
        return originalLocaleLowerCase.call(this, 'tr');
      });
    try {
      const [match] = rankAmllEvaluationCandidates(reference(), [
        songItem({ musicNames: ['Synthetic Example (LIVE)'] }),
      ]);
      expect(match).toMatchObject({
        matchBand: 'related',
        versionMismatch: true,
      });
    } finally {
      hostLocale.mockRestore();
    }
  });
});

describe('AMLL TTML capability validation', () => {
  it('accepts fully bounded word timing as validated T2', () => {
    expect(classifyAmllTtml(wordTtml())).toEqual({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      timingMode: 'word',
      lineCount: 1,
      timedLineCount: 1,
      segmentCount: 2,
      invalidSegmentCount: 0,
    });
  });

  it('keeps explicit line timing at T1 even when nested spans exist', () => {
    const value = lineTtml().replace(
      'Synthetic line',
      '<span begin="1s" end="2s">Synthetic</span> line',
    );

    expect(classifyAmllTtml(value)).toMatchObject({
      status: 'ok',
      capability: 'T1',
      timingValidation: 'not-applicable',
      timingMode: 'line',
      lineCount: 1,
      segmentCount: 0,
    });
  });

  it('reports mixed word timing as partial instead of full T2', () => {
    const value = wordTtml(`
      <p begin="1s" end="3s"><span begin="1s" end="2s">Timed</span></p>
      <p begin="4s" end="6s">Line only</p>
    `);

    expect(classifyAmllTtml(value)).toMatchObject({
      status: 'ok',
      capability: 'partial-T2',
      timingValidation: 'partial',
      lineCount: 2,
      timedLineCount: 1,
      segmentCount: 1,
    });
  });

  it('marks explicit word timing invalid when no line has valid segments', () => {
    const value = wordTtml(
      '<p begin="1s" end="3s"><span begin="3s" end="2s">Broken</span></p>',
    );

    expect(classifyAmllTtml(value)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'invalid',
      timedLineCount: 0,
      segmentCount: 0,
      invalidSegmentCount: 1,
    });
  });

  it('recognizes undeclared timing from valid spans and enforces parent bounds', () => {
    const automatic = wordTtml().replace('    itunes:timing="Word"', '');
    expect(classifyAmllTtml(automatic)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      timingMode: 'word',
    });

    const outsideParent = wordTtml(
      '<p begin="1s" end="3s"><span begin="0.5s" end="2s">Outside</span></p>',
    );
    expect(classifyAmllTtml(outsideParent)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'invalid',
      invalidSegmentCount: 1,
    });

    const outsideBody = lineTtml().replace('end="3s"', 'end="11s"');
    expect(classifyAmllTtml(outsideBody)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it('accepts untimed formatting containers around timed word spans', () => {
    const nested = wordTtml(`
      <p begin="1s" end="3s">
        <span><span begin="1s" end="2s">Nested</span> <span begin="2s" end="3s">words</span></span>
      </p>
    `);

    expect(classifyAmllTtml(nested)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      timedLineCount: 1,
      segmentCount: 2,
      invalidSegmentCount: 0,
    });

    const formattingLeaf = wordTtml(`
      <p begin="1s" end="3s"><span begin="1s" end="3s"><span>Formatted word</span></span></p>
    `);
    expect(classifyAmllTtml(formattingLeaf)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      segmentCount: 1,
      invalidSegmentCount: 0,
    });
  });

  it('parses legal millisecond fractions without floating-point rejection', () => {
    const precise = wordTtml(`
      <p begin="1.001s" end="2.001s"><span begin="1.001s" end="2.001s">Seconds</span></p>
      <p begin="00:03.001" end="00:04.001"><span begin="00:03.001" end="00:04.001">Clock</span></p>
    `);

    expect(classifyAmllTtml(precise)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      lineCount: 2,
      timedLineCount: 2,
      segmentCount: 2,
      invalidSegmentCount: 0,
    });
  });

  it('ignores official untimed auxiliary readings and validates nested parent bounds', () => {
    const auxiliary = wordTtml(`
      <p begin="1s" end="4s">
        <span begin="1s" end="2s">Main</span>
        <span ttm:role="x-translation">Translation</span>
        <span ttm:role="x-roman">Reading</span>
      </p>
    `).replace(
      'xmlns:itunes=',
      'xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes=',
    );
    expect(classifyAmllTtml(auxiliary)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'valid',
      segmentCount: 1,
      invalidSegmentCount: 0,
    });

    const outsideTimedParent = wordTtml(`
      <p begin="1s" end="4s">
        <span begin="1s" end="2.5s"><span begin="2s" end="3s">Outside parent</span></span>
      </p>
    `);
    expect(classifyAmllTtml(outsideTimedParent)).toMatchObject({
      status: 'ok',
      capability: 'T2',
      timingValidation: 'invalid',
      invalidSegmentCount: 1,
    });

    const outsideTimedDiv = wordTtml(`
      <div begin="2s" end="4s">
        <p begin="1s" end="3s"><span begin="1s" end="3s">Outside section</span></p>
      </div>
    `);
    expect(classifyAmllTtml(outsideTimedDiv)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it('rejects excessive XML nesting through the bounded parser path', () => {
    const nested = `${'<div>'.repeat(129)}<p begin="1s" end="2s">Line</p>${'</div>'.repeat(129)}`;
    const value = wordTtml(nested);

    expect(classifyAmllTtml(value)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it.each([
    ['missing content', '', 'invalid-ttml'],
    ['UTF-8 BOM', `\ufeff${lineTtml()}`, 'invalid-ttml'],
    ['malformed XML', '<tt><body><p></body></tt>', 'invalid-ttml'],
    [
      'external declarations',
      '<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///secret">]><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s" end="2s">&x;</p></body></tt>',
      'unsafe-ttml',
    ],
    [
      'SGML declarations',
      '<!ENTITY example "value"><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s" end="2s">Synthetic</p></body></tt>',
      'unsafe-ttml',
    ],
    [
      'unknown timing mode',
      wordTtml().replace('Word', 'Character'),
      'invalid-ttml',
    ],
    ['wrong namespace', '<tt><body /></tt>', 'invalid-ttml'],
    ['oversized content', 'x'.repeat(2 * 1024 * 1024 + 1), 'ttml-too-large'],
  ])('rejects %s without returning parser details', (_, value, reason) => {
    expect(classifyAmllTtml(value)).toEqual({ status: 'error', reason });
  });
});

describe('AMLL evaluation client', () => {
  it('normalizes search metadata and drops unsafe records and provider markup', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          searchEnvelope([
            {
              ...songItem(),
              matchContext: { snippet: '<mark>ignored</mark>' },
            },
            songItem({ filename: '../unsafe.ttml' }),
          ]),
        ),
      ),
    );
    const client = createAmllEvaluationClient({ fetch, now: immediateNow() });

    await expect(
      client.search({ trackName: 'Synthetic', artistName: 'Example Artist' }),
    ).resolves.toEqual({
      status: 'ok',
      records: [songItem()],
      invalidRecordCount: 1,
      pagination: {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
        hasMore: false,
      },
      durationMs: 25,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      Accept: 'application/json',
      'User-Agent': expect.stringMatching(
        /^Utawakui\/\d+\.\d+\.\d+ \(lyrics-provider-evaluation\)$/u,
      ),
    });
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });

  it('fetches and validates TTML without returning raw lyrics', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(envelope(songItem({ lyrics: wordTtml() }))),
        ),
      );
    const client = createAmllEvaluationClient({ fetch, now: immediateNow() });

    const result = await client.getById(123456789);

    expect(result).toEqual({
      status: 'ok',
      record: songItem(),
      timing: {
        capability: 'T2',
        timingValidation: 'valid',
        timingMode: 'word',
        lineCount: 1,
        timedLineCount: 1,
        segmentCount: 2,
        invalidSegmentCount: 0,
      },
      durationMs: 25,
    });
    expect(JSON.stringify(result)).not.toContain('Synthetic line');
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: '123456789' });
  });

  it('rejects oversized Content-Length and streamed responses before JSON use', async () => {
    const declared = createAmllEvaluationClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response('small', { headers: { 'Content-Length': '101' } }),
        ),
      maxSearchResponseBytes: 100,
      now: immediateNow(),
    });
    await expect(declared.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
      durationMs: 25,
    });

    const streamed = createAmllEvaluationClient({
      fetch: vi.fn().mockResolvedValue(new Response('x'.repeat(101))),
      maxSearchResponseBytes: 100,
      now: immediateNow(),
    });
    await expect(streamed.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
      durationMs: 25,
    });
  });

  it('contains body-read and configuration failures without leaking exceptions', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('private cancel error'));
    const declared = createAmllEvaluationClient({
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => '101' },
        body: { cancel },
      }),
      maxSearchResponseBytes: 100,
      now: immediateNow(),
    });
    await expect(declared.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'response-too-large',
      durationMs: 25,
    });
    expect(cancel).toHaveBeenCalledOnce();

    const releaseLock = vi.fn();
    const unreadable = createAmllEvaluationClient({
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: () => Promise.reject(new Error('private read error')),
            releaseLock,
          }),
        },
      }),
      now: immediateNow(),
    });
    await expect(
      unreadable.search({ trackName: 'Synthetic' }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'offline',
      durationMs: 25,
    });
    expect(releaseLock).toHaveBeenCalledOnce();

    const invalidConfiguration = createAmllEvaluationClient({ fetch: null });
    await expect(
      invalidConfiguration.search({ trackName: 'Synthetic' }),
    ).resolves.toEqual({
      status: 'error',
      reason: 'fetch-unavailable',
      durationMs: 0,
    });
  });

  it.each([
    [new Response('', { status: 429 }), 'rate-limited'],
    [new Response('', { status: 502 }), 'service-unavailable'],
    [new Response('{bad json'), 'invalid-json'],
    [
      new Response(JSON.stringify({ status: 200, data: null })),
      'invalid-record',
    ],
  ])(
    'returns bounded typed failures for hostile responses %#',
    async (response, reason) => {
      const client = createAmllEvaluationClient({
        fetch: vi.fn().mockResolvedValue(response),
        now: immediateNow(),
      });

      await expect(client.search({ trackName: 'Synthetic' })).resolves.toEqual({
        status: 'error',
        reason,
        durationMs: 25,
      });
    },
  );

  it('classifies 404 as a catalog miss and transport exceptions without leaking text', async () => {
    const missing = createAmllEvaluationClient({
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 404 })),
      now: immediateNow(),
    });
    await expect(missing.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'ok',
      records: [],
      invalidRecordCount: 0,
      pagination: null,
      durationMs: 25,
    });

    const failed = createAmllEvaluationClient({
      fetch: vi.fn().mockRejectedValue(new Error('secret provider body')),
      now: immediateNow(),
    });
    await expect(failed.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'offline',
      durationMs: 25,
    });

    const timeout = new Error('private timeout detail');
    timeout.name = 'TimeoutError';
    const timedOut = createAmllEvaluationClient({
      fetch: vi.fn().mockRejectedValue(timeout),
      now: immediateNow(),
    });
    await expect(timedOut.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
      durationMs: 25,
    });
  });

  it('validates selected ids and fetched TTML failures', async () => {
    const client = createAmllEvaluationClient({ fetch: vi.fn() });
    await expect(client.getById(0)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
      durationMs: 0,
    });

    const unavailable = createAmllEvaluationClient({
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 404 })),
    });
    await expect(unavailable.getById(42)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'not-found',
    });

    const invalidTtml = createAmllEvaluationClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify(envelope(songItem({ lyrics: '<not-ttml />' }))),
          ),
        ),
    });
    await expect(invalidTtml.getById(42)).resolves.toMatchObject({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it('classifies an abort while reading a response body as timeout', async () => {
    const fetch = vi.fn(async (_url, options) => {
      const body = new ReadableStream({
        start(controller) {
          options.signal.addEventListener(
            'abort',
            () => controller.error(options.signal.reason),
            { once: true },
          );
        },
      });
      return new Response(body);
    });
    const client = createAmllEvaluationClient({ fetch, timeoutMs: 10 });

    await expect(client.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
      durationMs: expect.any(Number),
    });
  });

  it('passes an acquisition signal through the scheduler', async () => {
    const controller = new AbortController();
    controller.abort(
      Object.assign(new Error('probe deadline exceeded'), {
        name: 'TimeoutError',
      }),
    );
    const scheduler = {
      schedule: vi.fn((_operation, options) =>
        Promise.reject(options.signal.reason),
      ),
    };
    const fetch = vi.fn();
    const client = createAmllEvaluationClient({
      fetch,
      scheduler,
      signal: controller.signal,
    });

    await expect(client.search({ trackName: 'Synthetic' })).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
      durationMs: expect.any(Number),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(scheduler.schedule).toHaveBeenCalledWith(expect.any(Function), {
      signal: controller.signal,
    });
  });
});

describe('AMLL corpus evaluation probe', () => {
  it('ranks search metadata, fetches one TTML record, and contains raw provider data', async () => {
    const client = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        records: [
          songItem({
            id: 20,
            musicNames: ['Different Song'],
            artistNames: ['Another Artist'],
          }),
          songItem({ id: 10 }),
        ],
        invalidRecordCount: 0,
        pagination: null,
        durationMs: 10,
      }),
      getById: vi.fn().mockResolvedValue({
        status: 'ok',
        record: songItem({ id: 10 }),
        timing: {
          capability: 'T2',
          timingValidation: 'valid',
          timingMode: 'word',
          lineCount: 1,
          timedLineCount: 1,
          segmentCount: 2,
          invalidSegmentCount: 0,
        },
        durationMs: 15,
      }),
    };
    const probe = createAmllEvaluationProbe({
      client,
      now: immediateNow(),
    });

    const result = await probe({
      caseId: 'case-001',
      providerId: 'amll',
      tags: ['english', 'mainstream', 'studio'],
      reference: reference(),
    });

    expect(client.search).toHaveBeenCalledWith({
      trackName: 'Synthetic Example',
      artistName: 'Example Artist',
      albumName: 'Example Album',
      page: 1,
      pageSize: 10,
    });
    expect(client.getById).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      providerId: 'amll',
      request: { status: 'ok', durationMs: 25, failureCode: null },
      catalogStatus: 'match',
      matchBand: 'exact',
      reviewVerdict: 'unreviewed',
      capability: 'T2',
      timingValidation: 'valid',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Synthetic Example');
    expect(serialized).not.toContain('synthetic-example.ttml');
    expect(serialized).not.toContain('<tt');
  });

  it.each([
    [
      {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
          pagination: null,
          durationMs: 10,
        }),
        getById: vi.fn(),
      },
      { request: { status: 'ok' }, catalogStatus: 'miss' },
    ],
    [
      {
        search: vi.fn().mockResolvedValue({
          status: 'error',
          reason: 'rate-limited',
          durationMs: 10,
        }),
        getById: vi.fn(),
      },
      { request: { status: 'failed', failureCode: 'rate-limited' } },
    ],
    [
      {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [songItem()],
          invalidRecordCount: 0,
          pagination: null,
          durationMs: 10,
        }),
        getById: vi.fn().mockResolvedValue({
          status: 'error',
          reason: 'invalid-ttml',
          durationMs: 15,
        }),
      },
      { request: { status: 'failed', failureCode: 'invalid-ttml' } },
    ],
  ])(
    'keeps catalog miss distinct from request failure %#',
    async (client, expected) => {
      const probe = createAmllEvaluationProbe({ client, now: immediateNow() });
      await expect(
        probe({ providerId: 'amll', reference: reference() }),
      ).resolves.toMatchObject(expected);
    },
  );

  it('preserves provider-authored line timing as T1', async () => {
    const probe = createAmllEvaluationProbe({
      client: {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [songItem()],
          invalidRecordCount: 0,
          pagination: null,
          durationMs: 10,
        }),
        getById: vi.fn().mockResolvedValue({
          status: 'ok',
          record: songItem(),
          timing: {
            capability: 'T1',
            timingValidation: 'not-applicable',
            timingMode: 'line',
            lineCount: 1,
            timedLineCount: 1,
            segmentCount: 0,
            invalidSegmentCount: 0,
          },
          durationMs: 15,
        }),
      },
      now: immediateNow(),
    });

    await expect(
      probe({ providerId: 'amll', reference: reference() }),
    ).resolves.toMatchObject({
      capability: 'T1',
      timingValidation: 'not-applicable',
    });
  });

  it('fails closed when the fetched record differs from the ranked candidate', async () => {
    const probe = createAmllEvaluationProbe({
      client: {
        search: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [songItem({ id: 10 })],
          invalidRecordCount: 0,
          pagination: null,
          durationMs: 10,
        }),
        getById: vi.fn().mockResolvedValue({
          status: 'ok',
          record: songItem({ id: 11 }),
          timing: {
            capability: 'T1',
            timingValidation: 'not-applicable',
          },
          durationMs: 15,
        }),
      },
      now: immediateNow(),
    });

    await expect(
      probe({ providerId: 'amll', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('cancels scheduler waiting at the acquisition-wide deadline', async () => {
    const fetch = vi.fn(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/search')) {
        return new Response(JSON.stringify(searchEnvelope([songItem()])));
      }
      return new Response(
        JSON.stringify(envelope(songItem({ lyrics: wordTtml() }))),
      );
    });
    const probe = createAmllEvaluationProbe({
      fetch,
      scheduler: createAmllEvaluationScheduler({ minimumIntervalMs: 100 }),
      probeTimeoutMs: 20,
    });

    await expect(
      probe({ providerId: 'amll', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'timeout' },
      catalogStatus: 'not-evaluated',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sanitizes invalid inputs and thrown private errors', async () => {
    const secret = 'PRIVATE PROVIDER BODY';
    const probe = createAmllEvaluationProbe({
      client: {
        search: vi.fn().mockRejectedValue(new Error(secret)),
        getById: vi.fn(),
      },
    });
    const invalid = await probe({
      providerId: 'lrclib',
      reference: reference(),
    });
    const thrown = await probe({ providerId: 'amll', reference: reference() });

    expect(invalid).toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-request' },
    });
    expect(thrown).toMatchObject({
      request: { status: 'failed', failureCode: 'probe-error' },
    });
    expect(JSON.stringify(thrown)).not.toContain(secret);
  });
});

describe('AMLL evaluation observation projection', () => {
  it('projects misses, failures, and validated matches into the shared contract', () => {
    expect(
      toAmllEvaluationObservation(
        {
          status: 'ok',
          records: [],
          invalidRecordCount: 0,
          pagination: null,
          durationMs: 40,
        },
        { providerId: 'amll' },
      ),
    ).toMatchObject({
      request: { status: 'ok', durationMs: 40, failureCode: null },
      catalogStatus: 'miss',
    });

    expect(
      toAmllEvaluationObservation(
        { status: 'error', reason: 'rate-limited', durationMs: 50 },
        { providerId: 'amll' },
      ),
    ).toMatchObject({
      request: {
        status: 'failed',
        durationMs: 50,
        failureCode: 'rate-limited',
      },
      catalogStatus: 'not-evaluated',
    });

    expect(
      toAmllEvaluationObservation(
        {
          status: 'ok',
          record: songItem(),
          timing: {
            capability: 'T2',
            timingValidation: 'valid',
            timingMode: 'word',
            lineCount: 1,
            timedLineCount: 1,
            segmentCount: 2,
            invalidSegmentCount: 0,
          },
          durationMs: 60,
        },
        {
          providerId: 'amll',
          matchBand: 'strong',
          reviewVerdict: 'correct',
        },
      ),
    ).toEqual({
      providerId: 'amll',
      request: { status: 'ok', durationMs: 60, failureCode: null },
      catalogStatus: 'match',
      matchBand: 'strong',
      reviewVerdict: 'correct',
      capability: 'T2',
      timingValidation: 'valid',
    });
  });

  it('treats an all-invalid provider response as failure rather than a catalog miss', () => {
    expect(
      toAmllEvaluationObservation(
        {
          status: 'ok',
          records: [],
          invalidRecordCount: 2,
          pagination: {
            page: 1,
            pageSize: 10,
            total: 2,
            totalPages: 1,
            hasMore: false,
          },
          durationMs: 45,
        },
        { providerId: 'amll' },
      ),
    ).toEqual({
      providerId: 'amll',
      request: {
        status: 'failed',
        durationMs: 45,
        failureCode: 'invalid-record',
      },
      catalogStatus: 'not-evaluated',
      matchBand: null,
      reviewVerdict: null,
      capability: null,
      timingValidation: 'not-applicable',
    });
  });

  it('fails closed for malformed observation projections', () => {
    expect(() => toAmllEvaluationObservation(null)).toThrow(
      /invalid AMLL evaluation result/i,
    );
    expect(() =>
      toAmllEvaluationObservation(
        {
          status: 'ok',
          record: songItem(),
          timing: {
            capability: 'T1',
            timingValidation: 'not-applicable',
          },
          durationMs: 10,
        },
        { providerId: 'amll' },
      ),
    ).toThrow(/invalid AMLL matched evaluation result/i);
    expect(() =>
      toAmllEvaluationObservation(
        {
          status: 'garbage',
          records: [],
          invalidRecordCount: 0,
          durationMs: 10,
        },
        { providerId: 'amll' },
      ),
    ).toThrow(/invalid AMLL matched evaluation result/i);
  });
});
