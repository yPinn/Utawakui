import { describe, expect, it } from 'vitest';
import {
  analyzeLrclibRecord,
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
} from './candidate.js';

function record(overrides = {}) {
  return {
    id: 1,
    name: 'Song - Artist',
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello world',
    syncedLyrics: '[00:01.00]Hello world',
    lyricsfile: null,
    ...overrides,
  };
}

const identity = {
  trackName: 'Song',
  artistName: 'Artist',
  albumName: 'Album',
  duration: 180,
};

describe('analyzeLrclibRecord', () => {
  it('uses validated Lyricsfile word timing as T2 capability', () => {
    const analysis = analyzeLrclibRecord(
      record({
        lyricsfile: `version: '1.0'
metadata: { title: Song, artist: Artist }
lines:
  - text: Hello world
    start_ms: 1000
    words:
      - { text: 'Hello ', start_ms: 1000, end_ms: 1500 }
      - { text: world, start_ms: 1500 }
`,
      }),
    );

    expect(analysis).toMatchObject({
      capability: { level: 'T2', partial: false },
      compatibility: { t0: false, t1: true, t2: true },
      warnings: [],
      lineCount: 1,
      segmentCount: 2,
    });
  });

  it('keeps reliable Lyricsfile language in the bounded candidate summary', () => {
    const [match] = rankLrclibCandidateMatches(identity, [
      record({
        lyricsfile: `version: '1.0'
metadata: { title: Song, artist: Artist, language: ja }
lines:
  - text: 歌詞
    start_ms: 1000
`,
      }),
    ]);

    expect(summarizeLrclibCandidate(match)).toMatchObject({
      language: 'ja',
      capability: { level: 'T1' },
    });
  });

  it('projects Lyricsfile plain content as a truthful T0 preview', () => {
    const analysis = analyzeLrclibRecord(
      record({
        plainLyrics: null,
        syncedLyrics: null,
        lyricsfile: `version: '1.0'
metadata: { title: Song, artist: Artist }
plain: |-
  First plain line

  Second plain line
`,
      }),
    );

    expect(analysis).toMatchObject({
      capability: { level: 'T0', partial: false },
      compatibility: { t0: true, t1: false, t2: false },
      lineCount: 2,
      segmentCount: 0,
      previewLines: [
        { start: null, text: 'First plain line' },
        { start: null, text: 'Second plain line' },
      ],
    });
  });

  it('bounds provider-controlled candidate text while preserving the raw record', () => {
    const longText = '長'.repeat(600);
    const [match] = rankLrclibCandidateMatches(identity, [
      record({
        trackName: longText,
        artistName: longText,
        albumName: longText,
        lyricsfile: `version: '1.0'
metadata: { title: Song, artist: Artist, language: ${'x'.repeat(80)} }
lines:
  - text: ${longText}
    start_ms: 1000
`,
      }),
    ]);

    const summary = summarizeLrclibCandidate(match);

    expect(summary.trackName.length).toBeLessThanOrEqual(256);
    expect(summary.artistName.length).toBeLessThanOrEqual(256);
    expect(summary.albumName.length).toBeLessThanOrEqual(256);
    expect(summary.previewLines[0].text.length).toBeLessThanOrEqual(240);
    expect(summary).not.toHaveProperty('language');
    expect(match.record.trackName).toBe(longText);
  });

  it('falls back from an unknown Lyricsfile version to synced lyrics', () => {
    expect(
      analyzeLrclibRecord(
        record({ lyricsfile: "version: '2.0'\nfuture: true\n" }),
      ),
    ).toMatchObject({
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      warnings: ['unsupported-lyricsfile-version-fallback'],
      lineCount: 1,
      previewLines: [{ start: 1, text: 'Hello world' }],
      autoUsable: true,
    });
  });

  it('falls back from blank or invalid Lyricsfile content before declaring it unsupported', () => {
    expect(
      analyzeLrclibRecord(
        record({
          syncedLyrics: null,
          plainLyrics: 'Fallback plain line',
          lyricsfile: '  ',
        }),
      ),
    ).toMatchObject({
      capability: { level: 'T0' },
      warnings: ['lyricsfile-missing'],
      lineCount: 1,
      previewLines: [{ start: null, text: 'Fallback plain line' }],
    });
    expect(
      analyzeLrclibRecord(
        record({
          syncedLyrics: null,
          plainLyrics: 'Fallback after invalid YAML',
          lyricsfile: 'not: [valid',
        }),
      ),
    ).toMatchObject({
      capability: { level: 'T0' },
      warnings: ['invalid-lyricsfile-fallback'],
      lineCount: 1,
    });
  });

  it('falls back to bounded T0 and instrumental legacy capabilities', () => {
    expect(
      analyzeLrclibRecord(
        record({
          plainLyrics: ' First line \r\n\r\nSecond line\nThird line ',
          syncedLyrics: null,
        }),
      ),
    ).toMatchObject({
      capability: { level: 'T0' },
      compatibility: { t0: true, t1: false, t2: false },
      lineCount: 3,
      segmentCount: 0,
      previewLines: [
        { start: null, text: 'First line' },
        { start: null, text: 'Second line' },
        { start: null, text: 'Third line' },
      ],
      autoUsable: false,
    });
    expect(
      analyzeLrclibRecord(
        record({ instrumental: true, plainLyrics: null, syncedLyrics: null }),
      ),
    ).toMatchObject({
      capability: { level: 'instrumental' },
      compatibility: { t0: false, t1: false, t2: false },
      warnings: ['lyricsfile-missing', 'instrumental-record'],
    });
  });

  it('bounds plain-text previews with the same summary limits as timed lyrics', () => {
    const [match] = rankLrclibCandidateMatches(identity, [
      record({
        plainLyrics: Array.from(
          { length: 8 },
          (_, index) => `${index + 1} ${'長'.repeat(300)}`,
        ).join('\n'),
        syncedLyrics: null,
      }),
    ]);

    const summary = summarizeLrclibCandidate(match, 5);

    expect(summary.lineCount).toBe(8);
    expect(summary.previewLines).toHaveLength(4);
    expect(summary.previewLines.every((line) => line.start === null)).toBe(
      true,
    );
    expect(
      summary.previewLines.reduce((count, line) => count + line.text.length, 0),
    ).toBeLessThanOrEqual(800);
  });

  it('marks structurally invalid Lyricsfile as unsupported provider content', () => {
    expect(
      analyzeLrclibRecord(
        record({
          plainLyrics: null,
          syncedLyrics: null,
          lyricsfile: 'not: [valid',
        }),
      ),
    ).toMatchObject({
      capability: { level: 'unsupported' },
      warnings: ['invalid-lyricsfile'],
      autoUsable: false,
    });
  });
});

describe('rankLrclibCandidateMatches', () => {
  it('groups exact and strong identity ahead of richer but related timing', () => {
    const relatedT2 = record({
      id: 2,
      trackName: 'Different Song',
      artistName: 'Different Artist',
      lyricsfile: `version: '1.0'
metadata: { title: Different Song, artist: Different Artist }
lines:
  - text: Rich timing
    start_ms: 1000
    words: [{ text: Rich timing, start_ms: 1000 }]
`,
    });
    const exactT1 = record({ id: 1, lyricsfile: null });

    const result = rankLrclibCandidateMatches(identity, [relatedT2, exactT1]);

    expect(result.map((match) => [match.record.id, match.band])).toEqual([
      [1, 'exact'],
      [2, 'related'],
    ]);
    expect(result[0].autoUsable).toBe(true);
    expect(result[1].autoUsable).toBe(false);
  });

  it('classifies a close identity as strong with bounded reasons', () => {
    const [match] = rankLrclibCandidateMatches(identity, [
      record({ artistName: 'Artist feat. Guest', duration: 184 }),
    ]);

    expect(match).toMatchObject({
      band: 'strong',
      matchReasons: expect.arrayContaining(['artist-close', 'duration-close']),
    });
    expect(match.matchReasons).not.toContain('raw-score');
  });

  it('orders timing capability descending within the best-match group', () => {
    const exactT0 = record({
      id: 1,
      syncedLyrics: null,
      plainLyrics: 'Plain only',
    });
    const strongT2 = record({
      id: 2,
      artistName: 'Artist feat. Guest',
      duration: 184,
      syncedLyrics: null,
      lyricsfile: `version: '1.0'
metadata: { title: Song, artist: Artist }
lines:
  - text: Rich timing
    start_ms: 1000
    words: [{ text: Rich timing, start_ms: 1000 }]
`,
    });

    const result = rankLrclibCandidateMatches(identity, [exactT0, strongT2]);

    expect(result.map((match) => [match.record.id, match.band])).toEqual([
      [2, 'strong'],
      [1, 'exact'],
    ]);
  });

  it('uses lyric timeline coverage when provider duration is internally impossible', () => {
    const [match] = rankLrclibCandidateMatches(
      {
        trackName: '月面着陸計画 - Moon Landing Plan',
        artistName: 'tuki.',
        albumName: '15',
        duration: 243,
      },
      [
        record({
          trackName: '月面着陸計画 - Moon Landing Plan',
          artistName: 'tuki.',
          albumName: '15',
          duration: 80,
          syncedLyrics: '[00:14.98]First\n[03:40.32]Last',
        }),
      ],
    );

    expect(match).toMatchObject({
      band: 'strong',
      durationDelta: 163,
      effectiveDurationDelta: 23,
      warnings: expect.arrayContaining(['provider-duration-inconsistent']),
    });
  });

  it('deduplicates records by id before ranking', () => {
    expect(
      rankLrclibCandidateMatches(identity, [record(), record()]),
    ).toHaveLength(1);
  });

  it('keeps a version mismatch related and non-automatic', () => {
    const [match] = rankLrclibCandidateMatches(identity, [
      record({ trackName: 'Song Live' }),
    ]);

    expect(match).toMatchObject({
      band: 'related',
      autoUsable: false,
      warnings: expect.arrayContaining(['version-mismatch']),
    });
  });

  it('treats From THE FIRST TAKE as a distinct recording version', () => {
    const [match] = rankLrclibCandidateMatches(
      {
        trackName: 'Kakurenbo',
        artistName: 'Yuuri',
        albumName: 'Ichi',
        duration: 271,
      },
      [
        record({
          trackName: 'Kakurenbo - From THE FIRST TAKE',
          artistName: 'Yuuri',
          albumName: 'Kakurenbo - From THE FIRST TAKE',
          duration: 296,
        }),
      ],
    );

    expect(match).toMatchObject({
      band: 'related',
      autoUsable: false,
      warnings: expect.arrayContaining(['version-mismatch']),
    });
  });

  it('orders an exact-title native-artist candidate before another recording version', () => {
    const result = rankLrclibCandidateMatches(
      {
        trackName: 'Kakurenbo',
        artistName: 'Yuuri',
        albumName: 'Ichi',
        duration: 271,
      },
      [
        record({
          id: 1,
          trackName: 'Kakurenbo - From THE FIRST TAKE',
          artistName: 'Yuuri',
          albumName: 'Kakurenbo - From THE FIRST TAKE',
          duration: 296,
        }),
        record({
          id: 2,
          trackName: 'Kakurenbo',
          artistName: '優里',
          albumName: 'Ichi',
          duration: 271,
        }),
      ],
    );

    expect(result.map((match) => match.record.id)).toEqual([2, 1]);
    expect(result.every((match) => match.band === 'related')).toBe(true);
  });
});
