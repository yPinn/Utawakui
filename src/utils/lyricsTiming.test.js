import { describe, expect, it } from 'vitest';
import { canEditTimingLine, timingSegmentsFor } from './lyricsTiming.js';
const line = { lineId: 'a', text: '歌う声', startMs: 0, endMs: 3000 };
const reading = {
  lineId: 'a',
  text: '歌う声',
  segments: [{ t: '歌う' }, { t: '声' }],
};
describe('lossless timing suggestions', () => {
  it('requires real bounds and at least two exact text spans', () => {
    expect(canEditTimingLine(line)).toBe(false);
    expect(canEditTimingLine(line, reading)).toBe(true);
    for (const endMs of [null, undefined, NaN, 0, -1])
      expect(canEditTimingLine({ ...line, endMs }, reading)).toBe(false);
    expect(canEditTimingLine(null)).toBe(false);
    expect(timingSegmentsFor(null)).toEqual([]);
  });
  it.each([
    { ...reading, lineId: 'old' },
    { ...reading, text: 'old' },
    { ...reading, segments: [{ t: '歌' }, { t: '声' }] },
    { ...reading, segments: [{ t: '' }, { t: '歌う声' }] },
  ])('rejects stale or lossy reading suggestions: %j', (stale) => {
    expect(canEditTimingLine(line, stale)).toBe(false);
  });
  it('preserves provider segment ids and times ahead of reading suggestions', () => {
    const segments = [
      { segmentId: 'kept-1', text: '歌', startMs: 0, endMs: 1200 },
      { segmentId: 'kept-2', text: 'う声', startMs: 1200, endMs: 3000 },
    ];
    const result = timingSegmentsFor({ ...line, segments }, reading);
    expect(result).toEqual(segments);
    expect(result[0]).not.toBe(segments[0]);
  });
  it('preserves whitespace exactly and never supplies estimated inner times', () => {
    const result = timingSegmentsFor({ ...line, text: ' Hello  world ' });
    expect(result.map((s) => s.text).join('')).toBe(' Hello  world ');
    expect(result[1].startMs).toBe(null);
    expect(result[0].startMs).toBe(0);
    expect(result.at(-1).endMs).toBe(3000);
  });
});
