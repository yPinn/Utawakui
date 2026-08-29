import { describe, expect, it } from 'vitest';
import { analyzeNeteaseLyrics } from './yrc.js';

const VALID_YRC = [
  '{"t":0,"c":[{"tx":"作詞："},{"tx":"Example"}]}',
  '[1000,2000](1000,500,0)Hello(1500,1500,0) world',
  '[4000,1000](4000,1000,0)Again',
].join('\n');

describe('analyzeNeteaseLyrics', () => {
  it('accepts complete provider-authored YRC as canonical T2 word timing', () => {
    expect(
      analyzeNeteaseLyrics({
        yrcLyrics: VALID_YRC,
        lrcLyrics: '[00:01.000]Hello world\n[00:04.000]Again',
      }),
    ).toEqual({
      status: 'ok',
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      warnings: [],
      lineCount: 2,
      segmentCount: 3,
      sourceText: '[00:01.000]Hello world\n[00:04.000]Again\n',
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
          {
            text: 'Again',
            startMs: 4000,
            endMs: 5000,
            words: [{ text: 'Again', startMs: 4000, endMs: 5000 }],
          },
        ],
      },
    });
  });

  it('never reports partial or out-of-bounds YRC as T2 and falls back to line timing', () => {
    const invalidYrc = [
      '[1000,1000](1000,500,0)Valid(1400,800,0)Overlap',
      '[3000,1000]missing segments',
    ].join('\n');

    expect(
      analyzeNeteaseLyrics({
        yrcLyrics: invalidYrc,
        lrcLyrics: '[00:01.000]Line one\n[00:03.000]Line two',
      }),
    ).toMatchObject({
      status: 'ok',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      warnings: ['invalid-yrc'],
      lineCount: 2,
      segmentCount: 0,
      document: null,
    });
  });

  it('classifies line-synced and plain lyrics without inventing word timing', () => {
    expect(
      analyzeNeteaseLyrics({
        yrcLyrics: '',
        lrcLyrics: '[00:01.000]Line one',
      }),
    ).toMatchObject({
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      document: null,
    });
    expect(
      analyzeNeteaseLyrics({ yrcLyrics: '', lrcLyrics: 'Plain lyrics' }),
    ).toMatchObject({
      capability: { level: 'T0', partial: false },
      compatibility: { t0: true, t1: false, t2: false },
      document: null,
    });
  });

  it('rejects oversized and malformed provider payloads', () => {
    expect(
      analyzeNeteaseLyrics({
        yrcLyrics: 'x'.repeat(2 * 1024 * 1024 + 1),
        lrcLyrics: '',
      }),
    ).toEqual({ status: 'error', reason: 'response-too-large' });
    expect(analyzeNeteaseLyrics({ yrcLyrics: null, lrcLyrics: 42 })).toEqual({
      status: 'error',
      reason: 'invalid-record',
    });
  });
});
