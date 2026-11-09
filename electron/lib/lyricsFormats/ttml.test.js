import { describe, expect, it } from 'vitest';

import { analyzeTtml, parseTtmlTime } from './ttml.js';

function wordTtml(body = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"
    itunes:timing="Word">
  <body dur="10s">
    <p begin="1s" end="3s"><span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span></p>
    ${body}
  </body>
</tt>`;
}

describe('provider-neutral TTML normalization golden behavior', () => {
  it.each([
    ['1.25s', 1250],
    ['01:02.003', 62003],
    ['1:02:03.004', 3723004],
    [undefined, null],
    ['1:60.000', null],
    ['1:2:3:4', null],
    ['1:nope', null],
  ])('parses bounded TTML clock %j as %j', (value, expected) => {
    expect(parseTtmlTime(value)).toBe(expected);
  });

  it('preserves inter-span whitespace and emits complete canonical T2 timing', () => {
    expect(analyzeTtml(wordTtml())).toMatchObject({
      status: 'ok',
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      sourceText: '[00:01.000]Hello world\n',
      document: {
        lines: [
          {
            text: 'Hello world',
            startMs: 1000,
            endMs: 3000,
            words: [
              { text: 'Hello', startMs: 1000, endMs: 1500 },
              { text: ' world', startMs: 1500, endMs: 3000 },
            ],
          },
        ],
      },
    });
  });

  it.each([
    [
      'inside the first and last words',
      '<span begin="5s" end="5.5s">  First</span>  <span begin="5.5s" end="6s">last </span>',
    ],
    [
      'in separate timed spans',
      '<span begin="4s" end="5s">  </span><span begin="5s" end="5.5s">First</span>  <span begin="5.5s" end="6s">last</span><span begin="6s" end="7s"> </span>',
    ],
  ])(
    'trims line-boundary whitespace %s without retiming words',
    (_label, spans) => {
      const result = analyzeTtml(
        wordTtml(`<p begin="4s" end="7s">${spans}</p>`),
      );
      expect(result).toMatchObject({
        status: 'ok',
        capability: { level: 'T2', partial: false },
        warnings: [],
        sourceText: '[00:01.000]Hello world\n[00:04.000]First  last\n',
      });
      expect(result.document.lines[1]).toEqual({
        text: 'First  last',
        startMs: 4000,
        endMs: 7000,
        words: [
          { text: 'First', startMs: 5000, endMs: 5500 },
          { text: '  last', startMs: 5500, endMs: 6000 },
        ],
      });
    },
  );

  it('treats declared line timing as T1 without inventing word timing', () => {
    const value = wordTtml()
      .replace('itunes:timing="Word"', 'itunes:timing="Line"')
      .replace(
        '<span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span>',
        'Hello world',
      );
    const result = analyzeTtml(value);
    expect(result).toMatchObject({
      status: 'ok',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
    });
    expect(result.document.lines[0].words).toEqual([]);
  });

  it('accepts a short body duration only for declared line timing within a known track', () => {
    const value = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Line"><body dur="5:40.376"><div begin="5:11.814" end="5:46.961"><p begin="5:40.000" end="5:46.961">Final line</p></div></body></tt>`;
    expect(analyzeTtml(value, { trackDurationMs: 371000 })).toMatchObject({
      status: 'ok',
      capability: { level: 'T1', partial: false },
      warnings: ['inconsistent-body-duration'],
      document: {
        lines: [
          { startMs: 340000, endMs: 346961, text: 'Final line', words: [] },
        ],
      },
    });
    expect(analyzeTtml(value).status).toBe('error');
    expect(analyzeTtml(value, { trackDurationMs: 345000 }).status).toBe(
      'error',
    );
  });

  it('keeps strict nested bounds, malformed durations and word timing despite a known track', () => {
    const value = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Line"><body dur="2s"><div begin="1s" end="4s"><p begin="1s" end="3s">Line</p></div></body></tt>`;
    for (const invalid of [
      value.replace('end="3s"', 'end="4.001s"'),
      value.replace('dur="2s"', 'dur="nope"'),
      value.replace('dur="2s"', 'dur="0s"'),
      value.replace('timing="Line"', 'timing="Word"'),
      value.replace('itunes:timing="Line"', ''),
    ]) {
      expect(analyzeTtml(invalid, { trackDurationMs: 5000 }).status).toBe(
        'error',
      );
    }
    for (const trackDurationMs of [
      0,
      -1,
      NaN,
      Infinity,
      1.5,
      '5000',
      86400001,
    ]) {
      expect(analyzeTtml(value, { trackDurationMs }).status).toBe('error');
    }
  });

  it('bounds direct line timing by the track without warning for consistent body timing', () => {
    const value = wordTtml().replace('timing="Word"', 'timing="Line"');
    expect(analyzeTtml(value, { trackDurationMs: 15000 }).warnings).toEqual([]);
    expect(
      analyzeTtml(
        value
          .replace('<body dur="10s">', '<body dur="10s"><div>')
          .replace('</body>', '</div></body>'),
        {
          trackDurationMs: 15000,
        },
      ).warnings,
    ).toEqual([]);
    expect(
      analyzeTtml(value.replace('dur="10s"', 'dur="2s"'), {
        trackDurationMs: 5000,
      }),
    ).toMatchObject({ status: 'ok', warnings: ['inconsistent-body-duration'] });
  });

  it('keeps the primary T2 lane when auxiliary background and translation lanes overlap', () => {
    const value = wordTtml().replace(
      '</span></p>',
      '</span><span ttm:role="x-bg"><span begin="1.2s" end="2.2s">Backing</span></span><span ttm:role="x-translation">翻譯</span></p>',
    );
    expect(analyzeTtml(value)).toMatchObject({
      status: 'ok',
      capability: { level: 'T2', partial: false },
      sourceText: '[00:01.000]Hello world\n',
      document: { lines: [{ text: 'Hello world' }] },
    });
  });

  it('downgrades incomplete primary word timing instead of persisting partial T2', () => {
    const value = wordTtml(
      '<p begin="4s" end="6s"><span begin="4s" end="5s">Part</span> missing</p>',
    );
    expect(analyzeTtml(value)).toMatchObject({
      status: 'ok',
      capability: { level: 'T1', partial: true },
      compatibility: { t0: true, t1: true, t2: false },
      warnings: ['partial-word-timing'],
    });
  });

  it('normalizes only a one-millisecond authored boundary jitter', () => {
    const value = wordTtml().replace(
      'begin="1.5s" end="3s"',
      'begin="1.499s" end="3s"',
    );
    const result = analyzeTtml(value);
    expect(result).toMatchObject({
      status: 'ok',
      capability: { level: 'T2', partial: false },
      warnings: ['normalized-boundary-jitter'],
    });
    expect(result.document.lines[0].words).toEqual([
      { text: 'Hello', startMs: 1000, endMs: 1499 },
      { text: ' world', startMs: 1499, endMs: 3000 },
    ]);
  });

  it('rejects complete T2 output that exceeds the canonical line text limit', () => {
    const text = 'a'.repeat(2001);
    const value = wordTtml().replace(
      '<span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span>',
      `<span begin="1s" end="3s">${text}</span>`,
    );
    expect(analyzeTtml(value)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it('rejects complete T2 output with too many segments on one line', () => {
    const spans = Array.from(
      { length: 1001 },
      (_, index) =>
        `<span begin="${(index / 1000).toFixed(3)}s" end="${(
          (index + 1) /
          1000
        ).toFixed(3)}s">a</span>`,
    ).join('');
    const value = wordTtml()
      .replace('dur="10s"', 'dur="2s"')
      .replace(
        '<p begin="1s" end="3s"><span begin="1s" end="1.5s">Hello</span> <span begin="1.5s" end="3s">world</span></p>',
        `<p begin="0s" end="1.001s">${spans}</p>`,
      );
    expect(analyzeTtml(value)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it('rejects non-monotonic line starts through the canonical timing validator', () => {
    const value = wordTtml(
      '<p begin="0.1s" end="0.9s"><span begin="0.1s" end="0.9s">Earlier</span></p>',
    );
    expect(analyzeTtml(value)).toEqual({
      status: 'error',
      reason: 'invalid-ttml',
    });
  });

  it.each([
    [
      'unsafe entity',
      '<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///secret">]><tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s" end="2s">&x;</p></body></tt>',
      'unsafe-ttml',
    ],
    [
      'overlapping words',
      wordTtml().replace('begin="1.5s" end="3s"', 'begin="1.4s" end="3s"'),
      'invalid-ttml',
    ],
    [
      'outside parent',
      wordTtml().replace('begin="1.5s" end="3s"', 'begin="1.5s" end="4s"'),
      'invalid-ttml',
    ],
    [
      'wrong namespace',
      '<tt><body><p begin="1s" end="2s">No namespace</p></body></tt>',
      'invalid-ttml',
    ],
  ])('rejects %s', (_label, value, reason) => {
    expect(analyzeTtml(value)).toEqual({ status: 'error', reason });
  });
});
