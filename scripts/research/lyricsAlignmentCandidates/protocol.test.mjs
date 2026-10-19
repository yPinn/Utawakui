import { describe, it, expect } from 'vitest';
import { alignStarts, decodeWhisperTokens } from './protocol.cjs';
const line = (text, lineId = 'line:0') => ({
  text,
  lineId,
  startMs: 1000,
  endMs: 10000,
});
describe('candidate original-text alignment boundary', () => {
  it('separates token onset milliseconds from the DTW output point', () => {
    const document = {
      transcription: [
        {
          tokens: [
            {
              id: 1,
              text: Buffer.from(' 你好').toString('latin1'),
              t_dtw: 190,
              offsets: { from: 1200, to: 2200 },
            },
          ],
        },
      ],
    };
    const spans = decodeWhisperTokens(document, 5, 'token-start');
    expect(spans.map((s) => [s.text, s.start, s.boundary])).toEqual([
      [' 你好', 1.2, true],
    ]);
    expect([
      ...alignStarts([line('你好')], spans, { mode: 'asr' }).get('line:0'),
    ]).toEqual([[0, 1200]]);
    expect(() =>
      decodeWhisperTokens(
        { transcription: [{ tokens: [{ id: 1, text: 'x', t_dtw: 190 }] }] },
        5,
        'token-start',
      ),
    ).toThrow('clock');
    expect(() => decodeWhisperTokens(document, 5, 'unrecognized')).toThrow();
    expect(
      decodeWhisperTokens(document, 5, 'dtw-point').find((s) => s.text === '你')
        .start,
    ).toBe(1.9);
  });
  it('preserves repeated occurrences, punctuation and original UTF-16 ranges', () => {
    const rows = [line('你好，你好！')];
    const starts = alignStarts(
      rows,
      [
        { text: '你好', start: 1, end: 2 },
        { text: '你好', start: 3, end: 4 },
      ],
      { mode: 'exact', windowStartMs: 500, offsetMs: 100 },
    );
    expect([...starts.get('line:0')]).toEqual([
      [0, 1600],
      [3, 3600],
    ]);
    expect(rows[0].text).toBe('你好，你好！');
  });
  it('does not fabricate a boundary inside one model unit or accept mismatched exact text', () => {
    expect([
      ...alignStarts(
        [line('你好世界')],
        [{ text: '你好世界', start: 1, end: 3 }],
        { mode: 'exact' },
      ).get('line:0'),
    ]).toEqual([[0, 1000]]);
    expect(() =>
      alignStarts([line('你好')], [{ text: '您好', start: 1, end: 2 }], {
        mode: 'exact',
      }),
    ).toThrow('text mismatch');
  });
  it('rejects ambiguous ASR repetition but recovers unique complete matched chunks', () => {
    expect([
      ...alignStarts([line('你好你好')], [{ text: '你好', start: 1, end: 2 }], {
        mode: 'asr',
      }).get('line:0'),
    ]).toEqual([]);
    const rows = [line('青い空が見える')];
    const result = alignStarts(
      rows,
      [
        { text: '青い', start: 1, end: 2 },
        { text: '海', start: 2, end: 3 },
        { text: 'が', start: 3, end: 4 },
        { text: '見える', start: 4, end: 5 },
      ],
      { mode: 'asr', language: 'ja' },
    );
    expect(result.get('line:0').get(3)).toBe(3000);
    expect(result.get('line:0').get(2)).toBeUndefined();
  });
  it('keeps same text in different lines independent and rejects invalid clocks/budgets', () => {
    const rows = [line('你好', 'a'), line('你好', 'b')];
    const result = alignStarts(
      rows,
      [
        { text: '你', start: 1, end: 2 },
        { text: '好', start: 2, end: 3 },
        { text: '你', start: 3, end: 4 },
        { text: '好', start: 4, end: 5 },
      ],
      { mode: 'exact' },
    );
    expect(result.get('a').get(0)).toBe(1000);
    expect(result.get('b').get(0)).toBe(3000);
    for (const spans of [
      [{ text: '你', start: NaN, end: 2 }],
      [{ text: '你', start: 3, end: 2 }],
      [
        { text: '你', start: 2, end: 3 },
        { text: '好', start: 1, end: 3 },
      ],
    ])
      expect(() =>
        alignStarts([line('你好')], spans, { mode: 'exact' }),
      ).toThrow();
    expect(() =>
      alignStarts([line('你'.repeat(2100))], [], { mode: 'asr' }),
    ).toThrow('budget');
  });
  it('reassembles split UTF-8 tokens and uses DTW onset without inventing inside-token cuts', () => {
    const bytes = Buffer.from('你好');
    const tokens = [
      { id: 1, text: bytes.subarray(0, 2).toString('latin1'), t_dtw: 10 },
      { id: 2, text: bytes.subarray(2).toString('latin1'), t_dtw: 20 },
      { id: 50257, text: '[end]', t_dtw: 30 },
    ];
    const spans = decodeWhisperTokens({ transcription: [{ tokens }] }, 30);
    expect(spans.map((x) => [x.text, x.start, x.boundary])).toEqual([
      ['你', 0.1, true],
      ['好', 0.2, false],
    ]);
    expect(() =>
      decodeWhisperTokens(
        { transcription: [{ tokens: [{ id: 1, text: 'x', t_dtw: -1 }] }] },
        30,
      ),
    ).toThrow();
  });
});
