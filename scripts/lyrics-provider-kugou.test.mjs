import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyKugouKrc,
  createKugouEvaluationProbe,
  decodeKugouKrc,
} from './lyrics-provider-kugou.mjs';

const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce,
  0xd2, 0x6e, 0x69,
]);

function encodeKrc(value) {
  const compressed = deflateSync(Buffer.from(value, 'utf8'));
  const encrypted = Buffer.from(
    compressed.map((byte, index) => byte ^ KRC_KEY[index % KRC_KEY.length]),
  );
  return Buffer.concat([Buffer.from('krc1'), encrypted]);
}

function validKrc() {
  return [
    '[ti:Synthetic Example]',
    '[1000,2000]<0,500,0>Syn<500,500,0>thetic<1000,1000,0> line',
    '[3500,1000]<0,500,0>Next<500,500,0> line',
  ].join('\n');
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
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

function immediateScheduler() {
  return { schedule: vi.fn((operation) => operation()) };
}

function probeInput(overrides = {}) {
  return {
    providerId: 'kugou',
    reference: reference(overrides),
  };
}

function probeWithFetch(fetch) {
  return createKugouEvaluationProbe({
    fetch,
    scheduler: immediateScheduler(),
    now: () => 1000,
  });
}

describe('Kugou KRC authored timing validation', () => {
  it('decodes the encrypted KRC envelope and validates relative word offsets as T2', () => {
    const decoded = decodeKugouKrc(encodeKrc(validKrc()));

    expect(decoded).toEqual({ status: 'ok', text: validKrc() });
    expect(classifyKugouKrc(decoded.text)).toEqual({
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

  it.each([
    [{}, 'invalid-record'],
    [Buffer.from('not-krc'), 'invalid-record'],
    [encodeKrc('[1000,1000]<900,200,0>outside'), 'invalid-record'],
    [
      encodeKrc('[1000,1000]<0,700,0>first<500,200,0>overlap'),
      'invalid-record',
    ],
  ])('rejects malformed or partial authored timing %#', (payload, reason) => {
    const decoded = decodeKugouKrc(payload);
    if (decoded.status === 'error') {
      expect(decoded).toEqual({ status: 'error', reason });
      return;
    }
    expect(classifyKugouKrc(decoded.text)).toEqual({
      status: 'error',
      reason,
    });
  });

  it.each([
    [null, 'invalid-record'],
    ['[ti:metadata only]', 'invalid-record'],
    ['[1000,1000]plain text', 'invalid-record'],
    ['[1000,1000]prefix<0,100,0>word', 'invalid-record'],
    ['[1000,0]<0,1,0>word', 'invalid-record'],
    ['[86399999,2]<0,1,0>word', 'invalid-record'],
    [
      '[2000,1000]<0,100,0>later\n[1000,1000]<0,100,0>earlier',
      'invalid-record',
    ],
    ['[1000,1000]<0,100,0>', 'invalid-record'],
    ['[1000,1000]<0,100,0> ', 'invalid-record'],
    [
      Array.from({ length: 20_001 }, () => '[ti:x]').join('\n'),
      'response-too-large',
    ],
  ])('rejects non-complete KRC text %#', (value, reason) => {
    expect(classifyKugouKrc(value)).toEqual({ status: 'error', reason });
  });

  it('accepts krc2 and rejects empty or oversized decoded envelopes', () => {
    const krc2 = encodeKrc(validKrc());
    krc2.write('krc2', 0, 'ascii');

    expect(decodeKugouKrc(krc2)).toMatchObject({ status: 'ok' });
    expect(decodeKugouKrc(new Uint8Array(encodeKrc(validKrc())))).toMatchObject(
      {
        status: 'ok',
      },
    );
    expect(decodeKugouKrc(encodeKrc(' '))).toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
    expect(decodeKugouKrc(Buffer.alloc(2 * 1024 * 1024 + 1))).toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
  });
});

describe('isolated Kugou evaluation probe', () => {
  it('uses fixed HTTPS routes and emits only a sanitized T2 observation', async () => {
    const krc = encodeKrc(validKrc());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 1,
          data: {
            info: [
              {
                hash: 'a'.repeat(32),
                songname: '七里香',
                singername: '周杰伦',
                duration: 297,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          candidates: Array.from({ length: 20 }, (_, index) => ({
            id: String(123 + index),
            accesskey: 'b'.repeat(32),
            duration: 297_000 + index,
            product_from: index === 0 ? '官方推荐歌词' : '',
          })),
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: krc.toString('base64') }));
    const scheduler = immediateScheduler();
    const probe = createKugouEvaluationProbe({
      fetch,
      scheduler,
      now: () => 1000,
    });

    const result = await probe({
      providerId: 'kugou',
      reference: reference({
        title: '七里香',
        artist: '周杰倫',
        album: '七里香',
        durationSeconds: 297,
      }),
    });

    expect(result).toEqual({
      providerId: 'kugou',
      request: { status: 'ok', durationMs: 0, failureCode: null },
      catalogStatus: 'match',
      matchBand: 'exact',
      reviewVerdict: 'unreviewed',
      capability: 'T2',
      timingValidation: 'valid',
    });
    expect(fetch.mock.calls.map(([url]) => new URL(url).origin)).toEqual([
      'https://mobileservice.kugou.com',
      'https://krcs.kugou.com',
      'https://lyrics.kugou.com',
    ]);
    expect(scheduler.schedule).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain('Synthetic');
    expect(JSON.stringify(result)).not.toContain(krc.toString('base64'));
  });

  it('falls back to keyword lyric search when the hash catalog has no KRC', async () => {
    const krc = encodeKrc(validKrc());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 1, data: { info: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          candidates: [
            {
              id: '456',
              accesskey: 'c'.repeat(32),
              duration: 180_000,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: krc.toString('base64') }));
    const probe = createKugouEvaluationProbe({
      fetch,
      scheduler: immediateScheduler(),
      now: () => 1000,
    });

    await expect(
      probe({ providerId: 'kugou', reference: reference() }),
    ).resolves.toMatchObject({
      request: { status: 'ok' },
      catalogStatus: 'match',
      capability: 'T2',
    });
    expect(new URL(fetch.mock.calls[1][0])).toMatchObject({
      origin: 'https://lyrics.kugou.com',
      pathname: '/search',
    });
  });

  it('keeps a bounded strong match when provider duration is expressed in milliseconds', async () => {
    const krc = encodeKrc(validKrc());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 1,
          data: {
            info: [
              {
                hash: 'a'.repeat(32),
                songname: 'Synthetic Example',
                singername: 'Example Artist',
                duration: 190_000,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            { id: '123', accesskey: 'a'.repeat(32), duration: 190_000 },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: krc.toString('base64') }));

    await expect(
      probeWithFetch(fetch)(probeInput({ album: null })),
    ).resolves.toMatchObject({
      request: { status: 'ok' },
      catalogStatus: 'match',
      matchBand: 'strong',
      capability: 'T2',
    });
  });

  it('rejects invalid probe input before any provider request', async () => {
    const fetch = vi.fn();
    const probe = createKugouEvaluationProbe({
      fetch,
      scheduler: immediateScheduler(),
    });

    await expect(probe({ providerId: 'kugou' })).resolves.toMatchObject({
      providerId: 'kugou',
      request: { status: 'failed', failureCode: 'invalid-request' },
      catalogStatus: 'not-evaluated',
    });
    await expect(
      probe(probeInput({ title: 'unsafe\u0001title' })),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-request' },
      catalogStatus: 'not-evaluated',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('late'), { name: 'TimeoutError' }),
        ),
      'timeout',
    ],
    [vi.fn().mockRejectedValue(new Error('offline')), 'offline'],
    [
      vi.fn().mockResolvedValue(new Response('', { status: 429 })),
      'rate-limited',
    ],
    [
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      'service-unavailable',
    ],
    [
      vi.fn().mockResolvedValue(new Response('', { status: 400 })),
      'http-error',
    ],
    [vi.fn().mockResolvedValue(new Response('{')), 'invalid-json'],
    [
      vi
        .fn()
        .mockResolvedValue(
          new Response('x', { headers: { 'Content-Length': '4194305' } }),
        ),
      'response-too-large',
    ],
  ])('bounds mobile request failures %#', async (fetch, failureCode) => {
    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode },
      catalogStatus: 'not-evaluated',
    });
  });

  it('reports fetch-unavailable without attempting a network request', async () => {
    const probe = createKugouEvaluationProbe({
      fetch: undefined,
      scheduler: immediateScheduler(),
    });

    await expect(probe(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'fetch-unavailable' },
    });
  });

  it.each([
    null,
    { unknown: true },
    { fetch: 42 },
    { timeoutMs: 0 },
    { timeoutMs: 120_001 },
    { scheduler: {} },
    { now: 42 },
  ])('rejects invalid probe options %#', (options) => {
    expect(() => createKugouEvaluationProbe(options)).toThrow(
      /invalid Kugou evaluation probe options/i,
    );
  });

  it.each([
    [jsonResponse({ status: 1, data: { info: {} } })],
    [
      jsonResponse({
        status: 1,
        data: { info: Array.from({ length: 11 }, () => ({})) },
      }),
    ],
  ])('rejects invalid mobile catalog schema %#', async (mobileResponse) => {
    const fetch = vi.fn().mockResolvedValue(mobileResponse);

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
    });
  });

  it('filters invalid songs and invalid lyric candidates into a clean miss', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 1,
          data: { info: [{ hash: 'bad', duration: -1 }] },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          candidates: [{ id: '', accesskey: '', duration: 0 }],
        }),
      );

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'ok' },
      catalogStatus: 'miss',
    });
  });

  it('rejects oversized and malformed lyric candidate collections', async () => {
    const selectedSong = {
      hash: 'a'.repeat(32),
      songname: 'Synthetic Example',
      singername: 'Example Artist',
      duration: 180,
    };
    const baseMobile = jsonResponse({
      status: 1,
      data: { info: [selectedSong] },
    });
    const malformed = vi
      .fn()
      .mockResolvedValueOnce(baseMobile)
      .mockResolvedValueOnce(jsonResponse({ candidates: {} }));
    await expect(
      probeWithFetch(malformed)(probeInput()),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
    });

    const oversized = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ status: 1, data: { info: [selectedSong] } }),
      )
      .mockResolvedValueOnce(jsonResponse({ candidates: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: Array.from({ length: 65 }, () => ({})),
        }),
      );
    await expect(
      probeWithFetch(oversized)(probeInput()),
    ).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
    });
  });

  it.each([
    [jsonResponse({ content: '' })],
    [jsonResponse({ content: 'not base64!' })],
    [jsonResponse({ content: Buffer.from('not-krc').toString('base64') })],
  ])('rejects invalid downloaded KRC content %#', async (downloadResponse) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 1, data: { info: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            { id: '123', accesskey: 'a'.repeat(32), duration: 180_000 },
          ],
        }),
      )
      .mockResolvedValueOnce(downloadResponse);

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
    });
  });

  it('bounds failures from hash candidate search', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 1,
          data: {
            info: [
              {
                hash: 'a'.repeat(32),
                songname: 'Synthetic Example',
                singername: 'Example Artist',
                duration: 180,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'service-unavailable' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('bounds failures from keyword candidate search', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 1, data: { info: [] } }))
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'rate-limited' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('bounds failures from KRC download', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 1, data: { info: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            { id: '123', accesskey: 'a'.repeat(32), duration: 180_000 },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'service-unavailable' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('rejects decoded KRC that has no complete authored timing', async () => {
    const krc = encodeKrc('[ti:metadata only]');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: 1, data: { info: [] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            { id: '123', accesskey: 'a'.repeat(32), duration: 180_000 },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: krc.toString('base64') }));

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
      catalogStatus: 'not-evaluated',
    });
  });

  it('contains unexpected response processing failures as probe errors', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get() {
          throw new Error('synthetic header failure');
        },
      },
    });

    await expect(probeWithFetch(fetch)(probeInput())).resolves.toMatchObject({
      request: { status: 'failed', failureCode: 'probe-error' },
      catalogStatus: 'not-evaluated',
    });
  });
});
