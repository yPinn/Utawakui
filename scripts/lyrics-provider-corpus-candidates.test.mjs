import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_STRATA,
  buildPrivateCandidateSet,
  validatePrivateLyricsCandidateSet,
} from './lyrics-provider-corpus-candidates.mjs';
import { createLegacyV2CandidateSet } from './lyrics-provider-corpus-test-fixtures.mjs';

function recordingId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function rawCandidates(perStratum = 60) {
  let sequence = 1;
  return CANDIDATE_STRATA.flatMap(({ id, languageTag }) =>
    Array.from({ length: perStratum }, (_, index) => {
      const candidate = {
        stratum: id,
        languageTag,
        recordingMbid: recordingId(sequence),
        primaryArtistMbid: recordingId(50_000 + Math.floor(index / 2)),
        workQid: `Q${10_000 + sequence}`,
        workMbid: recordingId(10_000 + sequence),
        title: `Private candidate ${sequence}`,
        artist: `Private artist ${Math.floor(index / 2)}`,
        album: index % 2 === 0 ? `Private album ${sequence}` : null,
        durationMs: 180_000 + index,
        firstReleaseDate: index % 2 === 0 ? '2012-01-02' : '2024',
        listenCount: 10_000 - index * 10,
        userCount: 1_000 - index,
      };
      sequence += 1;
      return candidate;
    }),
  );
}

describe('private lyrics candidate selection', () => {
  it('keeps the exact legacy v2 candidate contract readable', () => {
    const legacy = createLegacyV2CandidateSet();

    expect(validatePrivateLyricsCandidateSet(legacy)).toEqual(legacy);
  });

  it('reserves candidate-set version 2 for the legacy contract', () => {
    expect(() =>
      buildPrivateCandidateSet(rawCandidates(), { candidateSetVersion: 2 }),
    ).toThrow(/version 2.*legacy/i);
  });

  it('builds exactly 8 needs-review candidates per language/genre stratum', () => {
    const result = buildPrivateCandidateSet(rawCandidates(), {
      candidateSetVersion: 1,
    });

    expect(result.status).toBe('needs-review');
    expect(result.candidates).toHaveLength(40);
    expect(result.policy).toMatchObject({
      targetCount: 40,
      casesPerStratum: 8,
      mainstreamCasesPerStratum: 7,
      longTailCasesPerStratum: 1,
      minimumFirstReleaseYear: 2010,
      mainstreamSelection: 'highest-user-count-then-listen-count',
    });
    expect(
      result.candidates.every((item) => item.reviewStatus === 'needs-review'),
    ).toBe(true);
    for (const { id } of CANDIDATE_STRATA) {
      expect(
        result.candidates.filter((item) => item.stratum === id),
      ).toHaveLength(8);
    }
  });

  it('classifies catalog reach within each stratum and skips its middle band', () => {
    const result = buildPrivateCandidateSet(rawCandidates(), {
      candidateSetVersion: 1,
    });

    for (const { id } of CANDIDATE_STRATA) {
      const selected = result.candidates.filter((item) => item.stratum === id);
      expect(
        selected.filter((item) => item.catalogReach === 'mainstream'),
      ).toHaveLength(7);
      expect(
        selected.filter((item) => item.catalogReach === 'long-tail'),
      ).toHaveLength(1);
      expect(selected.some((item) => item.source.userCount === 970)).toBe(
        false,
      );
    }
  });

  it('supports an exact eight-recording pilot shortlist without widening the review pool', () => {
    const result = buildPrivateCandidateSet(rawCandidates(8), {
      candidateSetVersion: 3,
    });

    for (const { id } of CANDIDATE_STRATA) {
      const selected = result.candidates.filter((item) => item.stratum === id);
      expect(selected).toHaveLength(8);
      expect(
        selected.filter((item) => item.catalogReach === 'mainstream'),
      ).toHaveLength(7);
      expect(
        selected.find((item) => item.catalogReach === 'long-tail')?.source
          .userCount,
      ).toBe(993);
    }
  });

  it('keeps exact-recording Chinese shortlists explicit and pending human review', () => {
    const candidates = rawCandidates(8).map((candidate) =>
      candidate.stratum.startsWith('chinese-')
        ? {
            ...candidate,
            workQid: null,
            workMbid: null,
            classificationBasis: 'recording-shortlist',
          }
        : candidate,
    );

    const result = buildPrivateCandidateSet(candidates, {
      candidateSetVersion: 3,
    });

    expect(
      result.candidates
        .filter(({ stratum }) => stratum.startsWith('chinese-'))
        .every(
          ({ reviewStatus, source }) =>
            reviewStatus === 'needs-review' &&
            source.classificationBasis === 'recording-shortlist' &&
            source.workQid === null &&
            source.workMbid === null,
        ),
    ).toBe(true);
    expect(
      result.candidates
        .filter(({ stratum }) => !stratum.startsWith('chinese-'))
        .every(({ source }) => source.classificationBasis === 'work-metadata'),
    ).toBe(true);
  });

  it('prioritizes the highest ListenBrainz popularity inside the mainstream band', () => {
    const result = buildPrivateCandidateSet(rawCandidates(), {
      candidateSetVersion: 1,
    });

    for (const { id } of CANDIDATE_STRATA) {
      const users = result.candidates
        .filter(
          (item) => item.stratum === id && item.catalogReach === 'mainstream',
        )
        .map((item) => item.source.userCount)
        .sort((left, right) => right - left);
      expect(users).toEqual(
        Array.from({ length: 7 }, (_, index) => 1000 - index),
      );
    }
  });

  it('filters out pre-2010 and unknown releases before popularity selection', () => {
    const candidates = rawCandidates().map((candidate, index) => ({
      ...candidate,
      firstReleaseDate:
        index % 60 < 10 ? '2009' : index % 60 < 20 ? null : '2010-01-01',
    }));
    const result = buildPrivateCandidateSet(candidates, {
      candidateSetVersion: 1,
    });

    expect(
      result.candidates.every(
        (item) => Number(item.reference.firstReleaseDate.slice(0, 4)) >= 2010,
      ),
    ).toBe(true);
  });

  it('is deterministic without preserving source or popularity order', () => {
    const candidates = rawCandidates();
    const first = buildPrivateCandidateSet(candidates, {
      candidateSetVersion: 7,
    });
    const second = buildPrivateCandidateSet([...candidates].reverse(), {
      candidateSetVersion: 7,
    });

    expect(second).toEqual(first);
    expect(first.candidates[0].source.recordingMbid).not.toBe(
      candidates[0].recordingMbid,
    );
  });

  it('limits repeated primary artists inside each stratum', () => {
    const candidates = rawCandidates(100).map((candidate, index) => ({
      ...candidate,
      artist:
        index % 100 < 20
          ? `Repeated private artist credit ${index}`
          : candidate.artist,
      primaryArtistMbid:
        index % 100 < 20 ? recordingId(999_999) : candidate.primaryArtistMbid,
    }));
    const result = buildPrivateCandidateSet(candidates, {
      candidateSetVersion: 1,
    });

    for (const { id } of CANDIDATE_STRATA) {
      expect(
        result.candidates.filter(
          (item) =>
            item.stratum === id &&
            item.source.primaryArtistMbid === recordingId(999_999),
        ).length,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('keeps provenance private but never upgrades generated records to reviewed gold', () => {
    const result = buildPrivateCandidateSet(rawCandidates(), {
      candidateSetVersion: 1,
    });
    const candidate = result.candidates[0];

    expect(candidate).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^candidate-[a-f0-9]{16}$/u),
        reviewStatus: 'needs-review',
        source: expect.objectContaining({
          recordingMbid: expect.any(String),
          primaryArtistMbid: expect.any(String),
          workQid: expect.any(String),
          workMbid: expect.any(String),
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('goldStatus');
  });

  it.each([1_000, 86_400_000])(
    'accepts runnable duration boundary %i ms',
    (durationMs) => {
      const values = rawCandidates();
      values[0].durationMs = durationMs;
      expect(() =>
        buildPrivateCandidateSet(values, { candidateSetVersion: 1 }),
      ).not.toThrow();
    },
  );

  it.each([
    [() => rawCandidates(7), /eligible candidates.*chinese-rap/i],
    [
      () => {
        const values = rawCandidates();
        values[0].workQid = null;
        values[0].workMbid = null;
        return values;
      },
      /Chinese.*work-level/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].workQid = null;
        values[0].workMbid = null;
        values[0].classificationBasis = 'artist-inference';
        return values;
      },
      /classification basis/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].stratum = 'mainland-rap';
        return values;
      },
      /stratum/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].languageTag = 'mainland-china';
        return values;
      },
      /language/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].recordingMbid = values[1].recordingMbid;
        return values;
      },
      /duplicate recording/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].primaryArtistMbid = 'invalid';
        return values;
      },
      /primary artist MBID/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].workQid = 'invalid';
        return values;
      },
      /Wikidata work id/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].workMbid = 'invalid';
        return values;
      },
      /work MBID/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].firstReleaseDate = 'yesterday';
        return values;
      },
      /first release date/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].title = '';
        return values;
      },
      /title/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].userCount = null;
        return values;
      },
      /user count/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].durationMs = 0;
        return values;
      },
      /duration/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].durationMs = 999;
        return values;
      },
      /duration/i,
    ],
    [
      () => {
        const values = rawCandidates();
        values[0].durationMs = 86_400_001;
        return values;
      },
      /duration/i,
    ],
  ])(
    'rejects malformed or insufficient source candidates',
    (mutate, message) => {
      expect(() =>
        buildPrivateCandidateSet(mutate(), { candidateSetVersion: 1 }),
      ).toThrow(message);
    },
  );

  it.each([
    [
      (value) => {
        value.schemaVersion = 2;
      },
      /schema version/i,
    ],
    [
      (value) => {
        value.candidateSetId = 'descriptive-private-list';
      },
      /set id/i,
    ],
    [
      (value) => {
        value.status = 'reviewed';
      },
      /set status/i,
    ],
    [
      (value) => {
        value.policy.targetCount = 99;
      },
      /policy/i,
    ],
    [
      (value) => {
        value.candidates.pop();
      },
      /exactly 40/i,
    ],
    [
      (value) => {
        value.candidates[0].id = 'invalid';
      },
      /id is invalid/i,
    ],
    [
      (value) => {
        value.candidates[1].id = value.candidates[0].id;
      },
      /duplicate candidate id/i,
    ],
    [
      (value) => {
        value.candidates[0].stratum = 'regional-catalog';
      },
      /stratum/i,
    ],
    [
      (value) => {
        value.candidates[0].languageTag = 'klingon';
      },
      /language/i,
    ],
    [
      (value) => {
        value.candidates[0].catalogReach = 'independent';
      },
      /catalog reach/i,
    ],
    [
      (value) => {
        value.candidates[0].reference.durationSeconds = 0;
      },
      /duration/i,
    ],
    [
      (value) => {
        value.candidates[0].reference.firstReleaseDate = 'recent';
      },
      /release date/i,
    ],
    [
      (value) => {
        value.candidates[0].reference.firstReleaseDate = '2009';
      },
      /2010 or later/i,
    ],
    [
      (value) => {
        value.candidates[0].reference.firstReleaseDate = null;
      },
      /2010 or later/i,
    ],
    [
      (value) => {
        value.candidates[0].source.recordingMbid = 'invalid';
      },
      /recording MBID/i,
    ],
    [
      (value) => {
        value.candidates[0].source.recordingMbid =
          value.candidates[0].source.recordingMbid.replace(
            '00000000',
            '0000000A',
          );
      },
      /recording MBID/i,
    ],
    [
      (value) => {
        value.candidates[1].source.recordingMbid =
          value.candidates[0].source.recordingMbid;
      },
      /duplicate recording MBID/i,
    ],
    [
      (value) => {
        value.candidates[0].source.primaryArtistMbid = 'invalid';
      },
      /primary artist MBID/i,
    ],
    [
      (value) => {
        value.candidates[0].source.workQid = 'invalid';
      },
      /Wikidata work id/i,
    ],
    [
      (value) => {
        value.candidates[0].source.workMbid = 'invalid';
      },
      /work MBID/i,
    ],
    [
      (value) => {
        value.candidates[0].source.userCount = -1;
      },
      /user count/i,
    ],
    [
      (value) => {
        value.candidates[0].id = 'candidate-0000000000000000';
      },
      /does not match its source identity/i,
    ],
    [
      (value) => {
        value.candidates.reverse();
      },
      /order/i,
    ],
    [
      (value) => {
        const sameStratum = value.candidates.filter(
          ({ stratum }) => stratum === value.candidates[0].stratum,
        );
        sameStratum[1].source.primaryArtistMbid =
          sameStratum[0].source.primaryArtistMbid;
        sameStratum[2].source.primaryArtistMbid =
          sameStratum[0].source.primaryArtistMbid;
      },
      /primary artist limit/i,
    ],
  ])('rejects malformed persisted candidate artifact %#', (mutate, message) => {
    const value = structuredClone(
      buildPrivateCandidateSet(rawCandidates(), { candidateSetVersion: 1 }),
    );
    mutate(value);
    expect(() => validatePrivateLyricsCandidateSet(value)).toThrow(message);
  });

  it.each([
    null,
    {},
    { candidateSetVersion: 0 },
    { candidateSetVersion: 1000 },
  ])('rejects malformed build input/options %#', (input) => {
    if (input === null) {
      expect(() => buildPrivateCandidateSet(null, {})).toThrow(
        /raw candidates/i,
      );
    } else if (Object.keys(input).length === 0) {
      expect(() => buildPrivateCandidateSet(rawCandidates(), input)).toThrow(
        /set version/i,
      );
    } else {
      expect(() => buildPrivateCandidateSet(rawCandidates(), input)).toThrow(
        /set version/i,
      );
    }
  });
});
