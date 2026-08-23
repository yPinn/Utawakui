import { describe, expect, it } from 'vitest';
import {
  analyzeLrclibRecord,
  rankLrclibCandidateMatches,
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

  it('keeps invalid or unknown Lyricsfile visible but non-automatic', () => {
    expect(
      analyzeLrclibRecord(
        record({ lyricsfile: "version: '2.0'\nfuture: true\n" }),
      ),
    ).toMatchObject({
      capability: { level: 'unsupported', partial: false },
      compatibility: { t0: false, t1: false, t2: false },
      warnings: ['unsupported-lyricsfile-version'],
      autoUsable: false,
    });
  });

  it('falls back to bounded T0 and instrumental legacy capabilities', () => {
    expect(analyzeLrclibRecord(record({ syncedLyrics: null }))).toMatchObject({
      capability: { level: 'T0' },
      compatibility: { t0: true, t1: false, t2: false },
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

  it('marks structurally invalid Lyricsfile as unsupported provider content', () => {
    expect(
      analyzeLrclibRecord(record({ lyricsfile: 'not: [valid' })),
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
});
