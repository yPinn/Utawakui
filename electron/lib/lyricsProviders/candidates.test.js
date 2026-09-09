import {
  aggregateLyricsProviderResults,
  compareUnifiedLyricsCandidates,
  selectAutomaticLyricsCandidate,
} from './candidates.js';
import { describe, expect, it } from 'vitest';

function candidate(overrides = {}) {
  return {
    id: 1,
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    capability: { level: 'T1', partial: false },
    compatibility: { t0: true, t1: true, t2: false },
    warnings: [],
    previewLines: [{ start: 1, text: 'Line' }],
    previewFingerprint: 'a'.repeat(64),
    matchBand: 'exact',
    ...overrides,
  };
}

function result(provider, candidates, overrides = {}) {
  return {
    provider,
    status: 'ok',
    candidates,
    groups: null,
    invalidRecordCount: 0,
    ...overrides,
  };
}

const track = {
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
};

describe('unified lyrics provider candidates', () => {
  it('keeps recording relevance ahead of richer timing', () => {
    const exactLineTimed = {
      ...candidate(),
      providerId: 'lrclib',
      candidateKey: 'lrclib:1',
      matchBand: 'exact',
    };
    const relatedWordTimed = {
      ...candidate({
        id: 2,
        trackName: 'Song (Live)',
        capability: { level: 'T2', partial: false },
      }),
      providerId: 'netease',
      candidateKey: 'netease:2',
      matchBand: 'related',
    };

    expect(
      [relatedWordTimed, exactLineTimed].sort(compareUnifiedLyricsCandidates),
    ).toEqual([exactLineTimed, relatedWordTimed]);
  });

  it('prefers complete line timing over partial word timing in the same band', () => {
    const completeLineTimed = {
      ...candidate(),
      providerId: 'lrclib',
      candidateKey: 'lrclib:1',
      matchBand: 'exact',
    };
    const partialWordTimed = {
      ...candidate({
        id: 2,
        capability: { level: 'T2', partial: true },
      }),
      providerId: 'netease',
      candidateKey: 'netease:2',
      matchBand: 'exact',
    };

    expect(
      [partialWordTimed, completeLineTimed].sort(
        compareUnifiedLyricsCandidates,
      ),
    ).toEqual([completeLineTimed, partialWordTimed]);
  });

  it('groups the same recording and recommends its best usable source', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      result('lrclib', [candidate({ id: 7 })]),
      result('netease', [
        candidate({
          id: 9,
          capability: { level: 'T2', partial: false },
          compatibility: { t0: true, t1: true, t2: true },
          previewFingerprint: 'b'.repeat(64),
        }),
      ]),
    ]);

    expect(aggregated.status).toBe('ok');
    expect(aggregated.candidates.map((item) => item.candidateKey)).toEqual([
      'netease:9',
      'lrclib:7',
    ]);
    expect(aggregated.recordingGroups.best).toHaveLength(1);
    expect(
      aggregated.recordingGroups.best[0].candidates.map(
        (item) => item.candidateKey,
      ),
    ).toEqual(['netease:9', 'lrclib:7']);
    expect(aggregated.recordingGroups.best[0].recommendedCandidateKey).toBe(
      'netease:9',
    );
  });

  it('selects full T2 ahead of T1 for exact automatic acquisition', () => {
    const exactT1 = {
      ...candidate({ id: 7 }),
      providerId: 'lrclib',
      candidateKey: 'lrclib:7',
    };
    const exactT2 = {
      ...candidate({
        id: 9,
        capability: { level: 'T2', partial: false },
        compatibility: { t0: true, t1: true, t2: true },
        previewFingerprint: 'b'.repeat(64),
      }),
      providerId: 'netease',
      candidateKey: 'netease:9',
    };

    expect(selectAutomaticLyricsCandidate([exactT1, exactT2])).toBe(exactT2);
  });

  it('never promotes a strong or related T2 result over an exact T1 result', () => {
    const exactT1 = {
      ...candidate({ id: 7 }),
      providerId: 'lrclib',
      candidateKey: 'lrclib:7',
    };
    const strongT2 = {
      ...candidate({
        id: 9,
        capability: { level: 'T2', partial: false },
        compatibility: { t0: true, t1: true, t2: true },
        matchBand: 'strong',
      }),
      providerId: 'netease',
      candidateKey: 'netease:9',
    };

    expect(selectAutomaticLyricsCandidate([strongT2, exactT1])).toBe(exactT1);
    expect(selectAutomaticLyricsCandidate([strongT2])).toBeNull();
  });

  it('does not merge a different recording version into the same group', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      result('lrclib', [candidate({ id: 7 })]),
      result('netease', [
        candidate({
          id: 9,
          trackName: 'Song (Live)',
          albumName: 'Song Live',
          duration: 205,
          capability: { level: 'T2', partial: false },
          previewFingerprint: 'b'.repeat(64),
        }),
      ]),
    ]);

    expect([
      ...aggregated.recordingGroups.best,
      ...aggregated.recordingGroups.related,
    ]).toHaveLength(2);
  });

  it('returns useful candidates when another provider fails', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      {
        provider: 'lrclib',
        status: 'error',
        reason: 'offline',
        candidates: [],
        groups: null,
      },
      result('netease', [candidate({ id: 9 })]),
    ]);

    expect(aggregated).toMatchObject({
      provider: 'all',
      status: 'ok',
      partial: true,
    });
    expect(aggregated.providerStatuses).toEqual([
      { provider: 'lrclib', status: 'error', reason: 'offline' },
      { provider: 'netease', status: 'ok' },
    ]);
    expect(aggregated.candidates[0]).toMatchObject({
      providerId: 'netease',
      candidateKey: 'netease:9',
    });
  });

  it('returns a bounded aggregate failure when no provider succeeds', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      {
        provider: 'lrclib',
        status: 'error',
        reason: 'offline',
        candidates: [],
      },
      {
        provider: 'netease',
        status: 'unavailable',
        reason: 'not-found',
        candidates: [],
      },
    ]);

    expect(aggregated).toMatchObject({
      provider: 'all',
      status: 'error',
      reason: 'all-providers-failed',
      candidates: [],
      partial: false,
    });
  });

  it('distinguishes an all-unavailable result from an operational failure', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      {
        provider: 'lrclib',
        status: 'unavailable',
        reason: 'not-found',
        candidates: [],
      },
      {
        provider: 'netease',
        status: 'unavailable',
        reason: 'not-found',
        candidates: [],
      },
    ]);

    expect(aggregated).toMatchObject({
      status: 'unavailable',
      reason: 'all-providers-unavailable',
      partial: false,
    });
  });

  it('keeps same-title recordings separate when artists conflict', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      result('lrclib', [candidate({ id: 7 })]),
      result('netease', [
        candidate({
          id: 9,
          artistName: 'Another Performer',
          previewFingerprint: 'b'.repeat(64),
        }),
      ]),
    ]);

    expect([
      ...aggregated.recordingGroups.best,
      ...aggregated.recordingGroups.related,
    ]).toHaveLength(2);
  });

  it('uses a strong band when title evidence exists without an artist hint', () => {
    const aggregated = aggregateLyricsProviderResults(
      { trackName: 'Song', duration: 180 },
      [result('lrclib', [candidate()])],
    );

    expect(aggregated.candidates[0].matchBand).toBe('strong');
  });

  it('bounds invalid counts and ignores malformed provider outcomes', () => {
    const aggregated = aggregateLyricsProviderResults(track, [
      null,
      { provider: 42, status: 'ok', candidates: [candidate()] },
      result('lrclib', [candidate()], { invalidRecordCount: 2_000 }),
      result('netease', [], { invalidRecordCount: -4 }),
    ]);

    expect(aggregated.invalidRecordCount).toBe(1_000);
    expect(aggregated.providerStatuses).toEqual([
      { provider: 'lrclib', status: 'ok' },
      { provider: 'netease', status: 'ok' },
    ]);
  });

  it('provides deterministic fallbacks for incomplete candidate summaries', () => {
    const first = {
      id: 'not-numeric',
      providerId: 'z-provider',
      candidateKey: 'z-provider:not-numeric',
      matchBand: 'unknown',
    };
    const second = {
      id: 'also-not-numeric',
      providerId: 'a-provider',
      candidateKey: 'a-provider:also-not-numeric',
      matchBand: 'unknown',
    };

    expect([first, second].sort(compareUnifiedLyricsCandidates)).toEqual([
      second,
      first,
    ]);
  });
});
