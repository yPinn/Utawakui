import { describe, expect, it, vi } from 'vitest';
import {
  classifyKugouLrc,
  createKugouLineEvaluationProbe,
} from './lyrics-provider-kugou.mjs';

const LRC =
  '[ti:Synthetic Song]\n[ar:Synthetic Artist]\n[00:01.00]First synthetic line\n[00:03.00]Second synthetic line';
const reference = {
  title: 'Synthetic Song',
  artist: 'Synthetic Artist',
  album: null,
  durationSeconds: 180,
  version: 'studio',
};
const response = (value, init) => new Response(JSON.stringify(value), init);
function fixtures({ song = {}, candidate = {}, text = LRC } = {}) {
  return [
    {
      data: {
        info: [
          {
            hash: 'a'.repeat(32),
            songname: reference.title,
            singername: reference.artist,
            duration: 180,
            ...song,
          },
        ],
      },
    },
    {
      candidates: [
        { id: '42', accesskey: 'private-key', duration: 180000, ...candidate },
      ],
    },
    { content: Buffer.from(text).toString('base64') },
  ];
}
function run(values, options = {}) {
  const fetch = vi.fn(async () => response(values.shift()));
  const probe = createKugouLineEvaluationProbe({
    fetch,
    scheduler: { schedule: (task) => task() },
    now: () => 1000,
    ...options,
  });
  return { fetch, search: () => probe({ providerId: 'kugou', reference }) };
}

describe('isolated native Kugou LRC', () => {
  it('retrieves hash-bound authored T1 without requesting or relaxing KRC', async () => {
    const evidence = vi.fn();
    const { fetch, search } = run(fixtures(), { onEvidence: evidence });
    const result = await search();
    expect(result).toMatchObject({
      request: { status: 'ok' },
      catalogStatus: 'match',
      matchBand: 'exact',
      capability: 'T1',
      timingValidation: 'not-applicable',
      reviewVerdict: 'unreviewed',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls.map((url) => url.origin)).toEqual([
      'https://mobileservice.kugou.com',
      'https://krcs.kugou.com',
      'https://lyrics.kugou.com',
    ]);
    expect(urls[1].searchParams.get('hash')).toBe('a'.repeat(32));
    expect(urls[2].searchParams.get('fmt')).toBe('lrc');
    expect(JSON.stringify(result)).not.toMatch(/Synthetic|private-key|aaaa/);
    expect(evidence).toHaveBeenCalledWith(
      expect.objectContaining({
        trackName: reference.title,
        artistName: reference.artist,
        lineCount: 2,
        durationDelta: 0,
      }),
    );
    expect(JSON.stringify(evidence.mock.calls)).not.toMatch(/private-key|aaaa/);
    expect(
      fetch.mock.calls.every(([, init]) => init.redirect === 'error'),
    ).toBe(true);
  });
  it.each([
    [{ singername: 'Unrelated Artist' }],
    [{ songname: 'Synthetic Song (Live)' }],
    [{ duration: 190 }],
  ])(
    'does not fall back to keyword lyrics for rejected catalog identity %j',
    async (song) => {
      const { fetch, search } = run(fixtures({ song }));
      expect(await search()).toMatchObject({
        request: { status: 'ok' },
        catalogStatus: 'miss',
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it('rejects a lyric candidate for a different duration before download', async () => {
    const { fetch, search } = run(
      fixtures({ candidate: { duration: 195000 } }),
    );
    expect(await search()).toMatchObject({ catalogStatus: 'miss' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    LRC.replace('Synthetic Artist', 'Other Singer'),
    LRC.replace('Synthetic Song', 'Another Song'),
    LRC.replace('[00:03.00]', '[03:05.00]'),
    '[00:01.00]Only one line',
    'Untimed plain lyrics',
    `${LRC}\n[00:99.00]Malformed timestamp`,
  ])('rejects malformed timing or contradictory LRC tags %#', async (text) => {
    const evidence = vi.fn();
    const { search } = run(fixtures({ text }), { onEvidence: evidence });
    expect(await search()).toMatchObject({
      request: { status: 'failed', failureCode: 'invalid-record' },
    });
    expect(evidence).not.toHaveBeenCalled();
  });
  it('stops immediately on a service error', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429 }));
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(await probe({ providerId: 'kugou', reference })).toMatchObject({
      request: { failureCode: 'rate-limited' },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('shares Retry-After cooldown across isolated probe instances', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { 'Retry-After': '60' } }),
    );
    const options = { fetch, scheduler: { schedule: (task) => task() } };
    const one = createKugouLineEvaluationProbe(options);
    const two = createKugouLineEvaluationProbe(options);
    await one({ providerId: 'kugou', reference });
    expect(await two({ providerId: 'kugou', reference })).toMatchObject({
      request: { failureCode: 'rate-limited' },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('bounds untrusted response sizes and invalid references', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { headers: { 'content-length': '999999999' } }),
    );
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(await probe({ providerId: 'kugou', reference })).toMatchObject({
      request: { failureCode: 'response-too-large' },
    });
    expect(await probe({ providerId: 'other', reference })).toMatchObject({
      request: { failureCode: 'invalid-request' },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('validates the native LRC independently of any word timing', () => {
    expect(classifyKugouLrc(LRC, 180)).toMatchObject({
      status: 'ok',
      capability: 'T1',
      lineCount: 2,
    });
    expect(classifyKugouLrc(null, 180)).toMatchObject({ status: 'error' });
    expect(classifyKugouLrc(LRC, NaN)).toMatchObject({ status: 'error' });
    expect(
      classifyKugouLrc('x'.repeat(2 * 1024 * 1024 + 1), 180),
    ).toMatchObject({ status: 'error' });
  });
  it.each([
    'hash:00000000000000000000000000000000',
    'sign:',
    'qq:',
    'total:180000',
  ])(
    'accepts the bounded native metadata tag %s without treating it as lyrics',
    (metadata) => {
      expect(classifyKugouLrc(`[${metadata}]\n${LRC}`, 180)).toMatchObject({
        status: 'ok',
        lineCount: 2,
      });
    },
  );
  it.each(['unknown:metadata', `hash:${'x'.repeat(257)}`, 'hash:bad]extra'])(
    'continues rejecting unsupported or malformed metadata %s',
    (metadata) => {
      expect(classifyKugouLrc(`[${metadata}]\n${LRC}`, 180)).toMatchObject({
        status: 'error',
      });
    },
  );
  it.each([
    `[ti:${'x'.repeat(257)}]\n[00:01]One\n[00:02]Two`,
    `[offset:]\n${LRC}`,
    `[offset:60001]\n${LRC}`,
    `[ar:Other Artist]\n${LRC}`,
  ])('rejects oversized metadata or invalid offsets %#', (text) => {
    expect(classifyKugouLrc(text, 180)).toMatchObject({
      status: 'error',
      reason: 'invalid-record',
    });
  });
  it('accepts repeated timing and keeps a bounded offset for explicit review', () => {
    expect(
      classifyKugouLrc(
        `[offset:+100]\n${LRC}\n[00:04][00:06]Repeated line`,
        180,
      ),
    ).toMatchObject({ status: 'ok', offsetMs: 100, lineCount: 4 });
  });
  it('rejects missing reverse version evidence and malformed download bytes', async () => {
    const { fetch } = run(fixtures());
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(
      await probe({
        providerId: 'kugou',
        reference: {
          ...reference,
          title: 'Synthetic Song (Live)',
          version: 'live',
        },
      }),
    ).toMatchObject({ catalogStatus: 'miss' });
    expect(fetch).toHaveBeenCalledOnce();
    const values = fixtures();
    values[2] = { content: '//8=' };
    expect(await run(values).search()).toMatchObject({
      request: { failureCode: 'invalid-record' },
    });
  });
  it('rejects a live catalog match whose lyric title drops the recording version', async () => {
    const values = fixtures({ song: { songname: 'Synthetic Song (Live)' } });
    const { fetch } = run(values);
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(
      await probe({
        providerId: 'kugou',
        reference: {
          ...reference,
          title: 'Synthetic Song (Live)',
          version: 'live',
        },
      }),
    ).toMatchObject({ request: { failureCode: 'invalid-record' } });
  });
  it('rejects invalid factory options without side effects', () => {
    expect(() => createKugouLineEvaluationProbe(null)).toThrow();
    expect(() =>
      createKugouLineEvaluationProbe({ onEvidence: 'invalid' }),
    ).toThrow();
    expect(() =>
      createKugouLineEvaluationProbe({ url: 'https://example.com' }),
    ).toThrow();
  });
});
