import { describe, expect, it } from 'vitest';
import {
  fingerprintNeteaseRecord,
  rankNeteaseCandidates,
  rankNeteaseMetadata,
  summarizeNeteaseCandidate,
} from './candidate.js';

function record(overrides = {}) {
  return {
    id: 42,
    trackName: 'Song',
    artistName: 'Artist',
    artists: ['Artist'],
    albumName: 'Album',
    duration: 180,
    aliases: [],
    translatedTitles: [],
    yrcLyrics: '[1000,1000](1000,1000,0)Word',
    lrcLyrics: '[00:01.000]Word',
    ...overrides,
  };
}

describe('NetEase candidate projection', () => {
  it('ranks identity matches and truthfully projects word timing capability', () => {
    const track = {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
    };
    const [match] = rankNeteaseCandidates(track, [record()]);
    const candidate = summarizeNeteaseCandidate(match);

    expect(candidate).toMatchObject({
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      albumName: 'Album',
      duration: 180,
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      matchBand: 'exact',
      lineCount: 1,
      segmentCount: 1,
      previewLines: [{ text: 'Word', start: 1 }],
      previewFingerprint: fingerprintNeteaseRecord(record()),
    });
  });

  it('keeps a valid line-timed candidate as T1 and rejects unrelated versions', () => {
    const track = { title: 'Song', artist: 'Artist', duration: 180 };
    const matches = rankNeteaseCandidates(track, [
      record({ yrcLyrics: '', lrcLyrics: '[00:01.000]Line' }),
      record({ id: 99, trackName: 'Unrelated live', duration: 600 }),
    ]);

    expect(matches).toHaveLength(1);
    expect(summarizeNeteaseCandidate(matches[0])).toMatchObject({
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      segmentCount: 0,
    });
  });

  it('keeps a bounded plain-text preview without inventing timestamps', () => {
    const [match] = rankNeteaseCandidates(
      { title: 'Song', artist: 'Artist', duration: 180 },
      [record({ yrcLyrics: '', lrcLyrics: 'First line\nSecond line' })],
    );

    expect(summarizeNeteaseCandidate(match)).toMatchObject({
      capability: { level: 'T0', partial: false },
      previewLines: [{ text: 'First line' }, { text: 'Second line' }],
    });
  });

  it('filters and ranks metadata before any lyrics payload exists', () => {
    const matches = rankNeteaseMetadata(
      { title: 'Song', artist: 'Artist', duration: 180 },
      [
        record({ id: 1, yrcLyrics: undefined, lrcLyrics: undefined }),
        record({
          id: 2,
          trackName: 'Unrelated live',
          duration: 600,
          yrcLyrics: undefined,
          lrcLyrics: undefined,
        }),
      ],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      record: { id: 1 },
      matchBand: 'exact',
      titleScore: 1,
      artistScore: 1,
    });
  });

  it('treats traditional and simplified Chinese recording metadata as the same identity', () => {
    const [match] = rankNeteaseMetadata(
      { title: '七里香', artist: '周杰倫', duration: 299 },
      [
        record({
          trackName: '七里香',
          artistName: '周杰伦',
          artists: ['周杰伦'],
          duration: 299,
          yrcLyrics: undefined,
          lrcLyrics: undefined,
        }),
      ],
    );

    expect(match).toMatchObject({
      matchBand: 'exact',
      titleScore: 1,
      artistScore: 1,
    });
  });
});
