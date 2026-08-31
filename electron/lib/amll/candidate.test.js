import { describe, expect, it } from 'vitest';

import {
  evaluateAmllMetadata,
  fingerprintAmllRecord,
  rankAmllCandidates,
  rankAmllMetadata,
  summarizeAmllCandidate,
} from './candidate.js';

const TTML =
  '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions" itunes:timing="Word"><body><p begin="1s" end="2s"><span begin="1s" end="2s">Song</span></p></body></tt>';

function record(overrides = {}) {
  return {
    id: 42,
    filename: '1700000000000-1-test.ttml',
    trackName: 'Song',
    artistName: 'A B C D',
    albumName: 'Album',
    musicNames: ['Song'],
    artistNames: ['A B C D'],
    albumNames: ['Album'],
    ncmMusicIds: [],
    qqMusicIds: [],
    appleMusicIds: [],
    spotifyIds: [],
    isrcs: [],
    authorIds: ['1'],
    authorUsernames: ['author'],
    ttml: TTML,
    ...overrides,
  };
}

describe('AMLL candidate matching', () => {
  it('classifies exact, strong, and related metadata matches', () => {
    expect(
      evaluateAmllMetadata(
        { title: 'Song', artist: 'A B C D', album: 'Album' },
        record(),
      ),
    ).toMatchObject({ matchBand: 'exact', durationDelta: null });
    expect(
      evaluateAmllMetadata(
        { title: 'Song Extended', artist: 'A B C D', album: 'Album' },
        record(),
      ),
    ).toMatchObject({ matchBand: 'strong' });
    expect(
      evaluateAmllMetadata(
        { title: 'Song Foo Bar Baz', artist: 'A B C D', album: '' },
        record({
          trackName: 'Song Foo Bar Qux',
          musicNames: ['Song Foo Bar Qux'],
        }),
      ),
    ).toMatchObject({ matchBand: 'related' });
  });

  it('fails closed for weak identity and conflicting recording versions', () => {
    expect(
      evaluateAmllMetadata({ title: 'Different', artist: 'A B C D' }, record()),
    ).toBeNull();
    expect(
      evaluateAmllMetadata({ title: 'Song', artist: 'Different' }, record()),
    ).toBeNull();
    expect(
      evaluateAmllMetadata(
        { title: 'Song', artist: 'A B C D' },
        record({ trackName: 'Song Live', musicNames: ['Song Live'] }),
      ),
    ).toBeNull();
  });

  it('orders deterministic matches and filters invalid TTML', () => {
    const later = record({ id: 43 });
    expect(rankAmllMetadata({}, null)).toEqual([]);
    expect(
      rankAmllMetadata({ title: 'Song', artist: 'A B C D', album: 'Album' }, [
        later,
        record(),
      ]).map((match) => match.record.id),
    ).toEqual([42, 43]);
    expect(
      rankAmllCandidates({ title: 'Song', artist: 'A B C D' }, [
        record(),
        record({ id: 43, ttml: '<invalid>' }),
      ]).map((match) => match.record.id),
    ).toEqual([42]);
  });

  it('fingerprints provenance and exposes a bounded candidate summary', () => {
    const source = record({
      authorUsernames: Array.from(
        { length: 10 },
        (_, index) => `author-${index}`,
      ),
    });
    expect(fingerprintAmllRecord(source)).not.toBe(
      fingerprintAmllRecord({ ...source, ttml: `${TTML} ` }),
    );
    const [match] = rankAmllCandidates({ title: 'Song', artist: 'A B C D' }, [
      source,
    ]);
    expect(summarizeAmllCandidate(match)).toMatchObject({
      id: 42,
      duration: null,
      lineCount: 1,
      segmentCount: 1,
      contributors: [
        'author-0',
        'author-1',
        'author-2',
        'author-3',
        'author-4',
        'author-5',
        'author-6',
        'author-7',
      ],
      previewLines: [{ text: 'Song', start: 1 }],
    });
  });
});
