import { describe, expect, it } from 'vitest';
import {
  formatChapterTimestamp,
  parseObsTimecode,
  projectYoutubeChapters,
} from './obsChapters.js';

function trackEntry(overrides = {}) {
  return {
    type: 'track',
    trackId: 'track-1',
    title: 'Song A',
    artist: null,
    stream: null,
    record: null,
    occurredAt: '2026-09-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('parseObsTimecode', () => {
  it('parses hours:minutes:seconds.fraction', () => {
    expect(parseObsTimecode('01:02:03.456')).toBe(3_723_456);
  });

  it('parses a timecode with no fractional part', () => {
    expect(parseObsTimecode('00:00:10')).toBe(10_000);
  });

  it.each([null, undefined, '', 'not-a-timecode', 123])(
    'returns null for invalid input %j',
    (value) => {
      expect(parseObsTimecode(value)).toBe(null);
    },
  );
});

describe('formatChapterTimestamp', () => {
  it('formats under an hour as M:SS (unpadded minutes)', () => {
    expect(formatChapterTimestamp(83_000)).toBe('1:23');
  });

  it('formats zero as 0:00', () => {
    expect(formatChapterTimestamp(0)).toBe('0:00');
  });

  it('formats past an hour as H:MM:SS', () => {
    expect(formatChapterTimestamp(3_723_000)).toBe('1:02:03');
  });
});

describe('projectYoutubeChapters', () => {
  it('keeps each entry at its real computed time — no silent 0:00 relabeling', () => {
    const entries = [
      trackEntry({
        trackId: 't1',
        title: 'Song A',
        stream: { timecode: '00:00:07.000', durationMs: 7000 },
      }),
      trackEntry({
        trackId: 't2',
        title: 'Song B',
        stream: { timecode: '00:00:30.000', durationMs: 30_000 },
      }),
      trackEntry({
        trackId: 't3',
        title: 'Song C',
        stream: { timecode: '00:00:50.000', durationMs: 50_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.text).toBe('0:07 Song A\n0:30 Song B\n0:50 Song C');
  });

  it('flags first-chapter-not-zero instead of relabeling when the first entry is not at 0:00', () => {
    const entries = [
      trackEntry({
        title: 'Song A',
        stream: { timecode: '00:02:00.000', durationMs: 120_000 },
      }),
      trackEntry({
        title: 'Song B',
        stream: { timecode: '00:02:30.000', durationMs: 150_000 },
      }),
      trackEntry({
        title: 'Song C',
        stream: { timecode: '00:03:00.000', durationMs: 180_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'first-chapter-not-zero' }),
    ]);
  });

  it('is valid with no first-chapter issue when an explicit marker sits at the true 0:00', () => {
    const entries = [
      {
        type: 'marker',
        label: '開場',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
        record: null,
        occurredAt: '2026-09-24T12:00:00.000Z',
      },
      trackEntry({
        title: 'Song A',
        stream: { timecode: '00:02:00.000', durationMs: 120_000 },
      }),
      trackEntry({
        title: 'Song B',
        stream: { timecode: '00:02:30.000', durationMs: 150_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.valid).toBe(true);
    expect(result.lines[0]).toMatchObject({ ms: 0, label: '開場' });
  });

  it('subtracts offsetMs from every timestamp, clamping negative results to zero', () => {
    const entries = [
      trackEntry({
        trackId: 't1',
        title: 'Song A',
        stream: { timecode: '00:05:00.000', durationMs: 300_000 },
      }),
      trackEntry({
        trackId: 't2',
        title: 'Song B',
        stream: { timecode: '00:05:20.000', durationMs: 320_000 },
      }),
      trackEntry({
        trackId: 't3',
        title: 'Song C',
        stream: { timecode: '00:05:40.000', durationMs: 340_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries, { offsetMs: 300_000 });

    expect(result.text).toBe('0:00 Song A\n0:20 Song B\n0:40 Song C');
  });

  it('includes the artist in the label when present', () => {
    const entries = [
      trackEntry({
        title: 'Song A',
        artist: 'Artist A',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
      }),
    ];

    expect(projectYoutubeChapters(entries).lines[0].label).toBe(
      'Song A - Artist A',
    );
  });

  it('labels a marker with its own text, falling back to a generic label', () => {
    const entries = [
      {
        type: 'marker',
        label: 'Talking break',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
        record: null,
        occurredAt: '2026-09-24T12:00:00.000Z',
      },
      {
        type: 'marker',
        label: null,
        stream: { timecode: '00:00:15.000', durationMs: 15_000 },
        record: null,
        occurredAt: '2026-09-24T12:00:15.000Z',
      },
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.lines.map((line) => line.label)).toEqual([
      'Talking break',
      '標記',
    ]);
  });

  it('drops entries missing a timecode for the selected source', () => {
    const entries = [
      trackEntry({
        title: 'Has stream',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
        record: null,
      }),
      trackEntry({
        title: 'Missing stream (record-only)',
        stream: null,
        record: { timecode: '00:00:20.000', durationMs: 20_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries, { source: 'stream' });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].label).toBe('Has stream');
  });

  it('reads from the record output when source is "record"', () => {
    const entries = [
      trackEntry({
        title: 'Recorded only',
        stream: null,
        record: { timecode: '00:01:00.000', durationMs: 60_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries, { source: 'record' });

    expect(result.lines[0]).toMatchObject({ ms: 60_000, time: '1:00' });
  });

  it('sorts entries by timecode regardless of input order', () => {
    const entries = [
      trackEntry({
        title: 'Second',
        stream: { timecode: '00:01:00.000', durationMs: 60_000 },
      }),
      trackEntry({
        title: 'First',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
      }),
      trackEntry({
        title: 'Third',
        stream: { timecode: '00:02:00.000', durationMs: 120_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.lines.map((line) => line.label)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('flags too-few-chapters when fewer than 3 usable entries exist', () => {
    const entries = [
      trackEntry({
        title: 'Song A',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
      }),
      trackEntry({
        title: 'Song B',
        stream: { timecode: '00:00:30.000', durationMs: 30_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'too-few-chapters' }),
    ]);
    // Still produces usable text even though it's flagged invalid.
    expect(result.text).toBe('0:00 Song A\n0:30 Song B');
  });

  it('flags chapters-too-close when two entries are under 10s apart', () => {
    const entries = [
      trackEntry({
        title: 'Song A',
        stream: { timecode: '00:00:00.000', durationMs: 0 },
      }),
      trackEntry({
        title: 'Song B',
        stream: { timecode: '00:00:05.000', durationMs: 5000 },
      }),
      trackEntry({
        title: 'Song C',
        stream: { timecode: '00:00:30.000', durationMs: 30_000 },
      }),
    ];

    const result = projectYoutubeChapters(entries);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'chapters-too-close', index: 1 }),
    ]);
  });

  it('returns an empty, invalid result for no entries', () => {
    const result = projectYoutubeChapters([]);

    expect(result.lines).toEqual([]);
    expect(result.text).toBe('');
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'too-few-chapters' }),
    ]);
  });

  it('tolerates null/undefined entries input', () => {
    expect(projectYoutubeChapters(null).lines).toEqual([]);
    expect(projectYoutubeChapters(undefined).lines).toEqual([]);
  });
});
