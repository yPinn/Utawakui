import { describe, expect, it } from 'vitest';
import { buildLyricsExport } from './lyricsExport.js';
import { parseLrc } from '../../../src/utils/lyrics.js';

const line = (text, startMs, endMs = null, endInferred = false) => ({
  text,
  startMs,
  endMs,
  endInferred,
});

describe('single-song lyric serialization', () => {
  it('round trips standard LRC text and rounded starts after the stored offset', () => {
    const result = buildLyricsExport(
      [line('同一句', 1005), line('한글\nことば', 3322), line('同一句', 6132)],
      { format: 'lrc', durationMs: 15000, offsetMs: 200 },
    );
    expect(result.issues).toMatchObject({ untimed: 0, invalid: 0 });
    expect(result.text).not.toContain('[offset:');
    expect(
      parseLrc(result.text).map(({ text, start }) => [text, start]),
    ).toEqual([
      ['同一句', 0.81],
      ['한글 ことば', 3.12],
      ['同一句', 5.93],
    ]);
  });

  it('honors explicit SRT ends and bounds estimates while leaving long gaps', () => {
    const result = buildLyricsExport(
      [
        line('一行\n둘째', 1000, 3000),
        line('三', 6000, 13000, true),
        line('四', 13000),
      ],
      { format: 'srt', durationMs: 15000, offsetMs: -200 },
    );
    expect(result.issues).toMatchObject({
      estimatedEnds: 2,
      invalid: 0,
      overlaps: 0,
    });
    expect(result.text).toBe(
      '1\r\n00:00:01,200 --> 00:00:03,200\r\n一行\r\n둘째\r\n\r\n' +
        '2\r\n00:00:06,200 --> 00:00:10,200\r\n三\r\n\r\n' +
        '3\r\n00:00:13,200 --> 00:00:15,000\r\n四\r\n',
    );
  });

  it('counts omitted T0 rows and refuses invalid bounds and SRT overlaps', () => {
    const result = buildLyricsExport(
      [
        line('zero', 100),
        line('timed', 1200, 5200),
        line('part', null),
        line('overlap', 3000, 5000),
      ],
      { format: 'srt', durationMs: 6000, offsetMs: 200 },
    );
    expect(result.issues).toMatchObject({
      untimed: 1,
      invalid: 1,
      overlaps: 1,
    });
    expect(result.text).toBeNull();
    expect(result.overlapDetails).toEqual([
      { earlier: 2, later: 4, start: 2800, end: 4800, text: 'overlap' },
    ]);
  });

  it('reports a late overlap against the earlier subtitle that still covers it', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      line(String(i + 1), i * 1000, i * 1000 + 500),
    );
    lines[6].endMs = 9500;
    const result = buildLyricsExport(lines, {
      format: 'srt',
      durationMs: 11000,
      offsetMs: 0,
    });
    expect(result.issues.overlaps).toBe(3);
    expect(result.overlapDetails.at(-1)).toMatchObject({
      earlier: 7,
      later: 10,
      start: 9000,
      end: 9500,
      text: '10',
    });
  });

  it('warns when LRC centisecond rounding combines starts and blocks ambiguous literal tags', () => {
    const options = { format: 'lrc', durationMs: 2000, offsetMs: 0 };
    const two = buildLyricsExport(
      [line('one', 999), line('two', 1002)],
      options,
    );
    expect(two.issues.sameTime).toBe(1);
    expect(two.rows.map((row) => row.start)).toEqual([1000, 1000]);
    const ambiguous = buildLyricsExport(
      [line('[00:03.40]唱詞', 1000)],
      options,
    );
    expect(ambiguous.issues.invalid).toBe(1);
    expect(ambiguous.text).toBeNull();
  });
});
