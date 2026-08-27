import { beforeEach, describe, expect, it } from 'vitest';

import { buildPrivateCandidateSet } from './lyrics-provider-corpus-candidates.mjs';
import {
  createPrivateLyricsReviewManifest,
  exportReviewedLyricsCorpus,
  PRIVATE_LYRICS_CORPUS_ACCEPTANCE,
  validatePrivateLyricsReviewManifest,
} from './lyrics-provider-corpus-review.mjs';
import { FIXED_LYRICS_PROVIDER_DESCRIPTORS } from './lyrics-provider-probe-registry.mjs';
import { createLegacyV2CandidateSet } from './lyrics-provider-corpus-test-fixtures.mjs';

const STRATA = [
  ['chinese-rap', 'mandarin'],
  ['chinese-pop', 'mandarin'],
  ['english-catalog', 'english'],
  ['japanese-catalog', 'japanese'],
  ['korean-catalog', 'korean'],
];

function recordingId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function candidateSet(version = 4) {
  let sequence = 1;
  const raw = STRATA.flatMap(([stratum, languageTag]) =>
    Array.from({ length: 60 }, (_, index) => {
      const candidate = {
        stratum,
        languageTag,
        recordingMbid: recordingId(sequence),
        primaryArtistMbid: recordingId(500_000 + sequence),
        workQid: `Q${100_000 + sequence}`,
        workMbid: recordingId(100_000 + sequence),
        title: `Private title ${sequence}`,
        artist: `Private artist ${sequence}`,
        album: index % 2 === 0 ? `Private album ${sequence}` : null,
        durationMs: 180_000 + index,
        firstReleaseDate: index % 2 === 0 ? '2010' : '2024-01-02',
        listenCount: 100_000 - index * 100,
        userCount: 10_000 - index,
      };
      sequence += 1;
      return candidate;
    }),
  );
  return buildPrivateCandidateSet(raw, { candidateSetVersion: version });
}

function approveAll(candidates, manifest) {
  const byId = new Map(candidates.candidates.map((item) => [item.id, item]));
  for (const review of manifest.reviews) {
    const candidate = byId.get(review.candidateId);
    Object.assign(review, {
      decision: 'approved',
      rejectionReason: null,
      stratum: candidate.stratum,
      languageTag: candidate.languageTag,
      version: 'studio',
      eraTag: 'recent-release',
      versionTrap: false,
      reference: {
        title: candidate.reference.title,
        artist: candidate.reference.artist,
        album: candidate.reference.album,
        durationSeconds: candidate.reference.durationSeconds,
        version: 'studio',
      },
    });
  }
  return manifest;
}

let candidates;
let pending;

beforeEach(() => {
  candidates = candidateSet();
  pending = structuredClone(createPrivateLyricsReviewManifest(candidates));
});

describe('private lyrics corpus review', () => {
  it('loads legacy v2 reviews but refuses to export them as the current pilot', () => {
    const legacyCandidates = createLegacyV2CandidateSet();
    const legacyReviews = createPrivateLyricsReviewManifest(legacyCandidates);
    Object.assign(legacyReviews.reviews[0], {
      decision: 'rejected',
      rejectionReason: 'release-before-2000',
    });

    expect(() =>
      validatePrivateLyricsReviewManifest(legacyCandidates, legacyReviews),
    ).not.toThrow();
    expect(() =>
      exportReviewedLyricsCorpus(legacyCandidates, legacyReviews),
    ).toThrow(/legacy v2.*cannot be exported/i);
  });

  it('keeps the reviewed v3 batch readable but no longer exportable as current', () => {
    const previousCandidates = candidateSet(3);
    const previousReviews = approveAll(
      previousCandidates,
      createPrivateLyricsReviewManifest(previousCandidates),
    );

    expect(() =>
      validatePrivateLyricsReviewManifest(previousCandidates, previousReviews),
    ).not.toThrow();
    expect(() =>
      exportReviewedLyricsCorpus(previousCandidates, previousReviews),
    ).toThrow(/only the current v4/i);
  });

  it('does not accept the retired pre-2000 reason in a current review set', () => {
    Object.assign(pending.reviews[0], {
      decision: 'rejected',
      rejectionReason: 'release-before-2000',
    });

    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, pending),
    ).toThrow(/rejection reason/i);
  });

  it('creates a separate all-pending manifest without reviewed gold', () => {
    expect(pending).toMatchObject({
      schemaVersion: 1,
      candidateSetId: candidates.candidateSetId,
      status: 'in-review',
    });
    expect(pending.reviews).toHaveLength(40);
    expect(
      pending.reviews.every(
        (review) =>
          review.decision === 'pending' &&
          review.rejectionReason === null &&
          review.stratum === null &&
          review.languageTag === null &&
          review.version === null &&
          review.eraTag === null &&
          review.versionTrap === null &&
          review.reference === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(pending)).not.toContain('goldStatus');
    expect(JSON.stringify(pending)).not.toContain('recordingMbid');
  });

  it('exports only fully approved reviews through the runnable corpus validator', () => {
    const corpus = exportReviewedLyricsCorpus(
      candidates,
      approveAll(candidates, pending),
    );

    expect(corpus).toMatchObject({
      schemaVersion: 1,
      corpusId: 'lyrics-provider-private-v4',
      baselineProviderId: 'lrclib',
      providers: [
        expect.objectContaining({ id: 'lrclib', mode: 'baseline' }),
        expect.objectContaining({ id: 'amll', mode: 'candidate' }),
      ],
      acceptance: {
        minimumCases: 40,
        requiredTags: STRATA.map(([tag]) => ({ tag, minimumCases: 8 })),
        minimumReviewedMatches: 20,
        minimumRequestSuccessRate: 0.95,
        maximumFalseMatchRate: 0.01,
        minimumIncrementalCoverageRate: 0.1,
        minimumUniqueValidT2Count: 10,
      },
    });
    expect(corpus.cases).toHaveLength(40);
    expect(corpus.cases[0].id).toBe('case-001');
    expect(corpus.cases.at(-1).id).toBe('case-040');
    expect(
      corpus.cases.every(({ goldStatus }) => goldStatus === 'reviewed'),
    ).toBe(true);
    expect(JSON.stringify(corpus)).not.toMatch(
      /candidate-|recordingMbid|primaryArtistMbid|workQid|workMbid|listenCount|userCount/u,
    );
    expect(corpus.providers).toEqual(FIXED_LYRICS_PROVIDER_DESCRIPTORS);
    expect(corpus.acceptance).toEqual(PRIVATE_LYRICS_CORPUS_ACCEPTANCE);
  });

  it('binds reviews to the exact validated candidate-set content', () => {
    const changedCandidates = structuredClone(candidates);
    changedCandidates.candidates[0].reference.title = 'Changed private title';

    expect(() =>
      validatePrivateLyricsReviewManifest(changedCandidates, pending),
    ).toThrow(/candidate set digest/i);
  });

  it.each([
    [
      (value) => {
        value.schemaVersion = 2;
      },
      /schema version/i,
    ],
    [
      (value) => {
        value.candidateSetId = 'lyrics-provider-private-candidates-v2';
      },
      /candidate set id/i,
    ],
    [
      (value) => {
        value.candidateSetSha256 = 'invalid';
      },
      /digest/i,
    ],
    [
      (value) => {
        value.status = 'complete';
      },
      /manifest status/i,
    ],
    [
      (value) => {
        value.reviews[0].candidateId = 'invalid';
      },
      /unknown candidate/i,
    ],
    [
      (value) => {
        value.reviews[0].decision = 'included';
      },
      /decision/i,
    ],
    [
      (value) => {
        value.reviews[0].rejectionReason = 'genre-mismatch';
      },
      /pending review rejection reason/i,
    ],
    [
      (value) => {
        value.reviews[0].stratum = 'chinese-pop';
      },
      /non-approved review fields/i,
    ],
  ])('rejects malformed review manifest field %#', (mutate, message) => {
    mutate(pending);
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, pending),
    ).toThrow(message);
  });

  it.each([
    ['title', '', /title/i],
    ['artist', 'x'.repeat(257), /artist/i],
    ['album', 'bad\u0000album', /album/i],
    ['durationSeconds', 0, /duration/i],
    ['durationSeconds', Number.NaN, /duration/i],
    ['durationSeconds', 86_401, /duration/i],
  ])(
    'rejects invalid approved reference field %s=%j',
    (field, value, message) => {
      approveAll(candidates, pending);
      pending.reviews[0].reference[field] = value;
      expect(() =>
        validatePrivateLyricsReviewManifest(candidates, pending),
      ).toThrow(message);
    },
  );

  it('uses reviewed language, reference corrections, era and version-trap tags', () => {
    approveAll(candidates, pending);
    const review = pending.reviews.find(({ candidateId }) => {
      const candidate = candidates.candidates.find(
        ({ id }) => id === candidateId,
      );
      return candidate.stratum === 'chinese-pop';
    });
    review.languageTag = 'cantonese';
    review.version = 'live';
    review.eraTag = 'recent-release';
    review.versionTrap = true;
    review.reference = {
      title: '人工核對標題',
      artist: '人工核對歌手',
      album: null,
      durationSeconds: 241,
      version: 'live',
    };

    const corpus = exportReviewedLyricsCorpus(candidates, pending);
    const reviewedCase = corpus.cases.find(
      ({ reference }) => reference.title === '人工核對標題',
    );
    expect(reviewedCase.tags).toEqual([
      'cantonese',
      'chinese-pop',
      expect.stringMatching(/^(?:mainstream|long-tail)$/u),
      'live',
      'recent-release',
      'version-trap',
    ]);
    expect(reviewedCase.reference).toEqual(review.reference);
  });

  it.each([null, 'older-release'])(
    'rejects an approved review without explicit 2010+ confirmation: %s',
    (eraTag) => {
      approveAll(candidates, pending);
      pending.reviews[0].eraTag = eraTag;
      expect(() => exportReviewedLyricsCorpus(candidates, pending)).toThrow(
        /recent-release/i,
      );
    },
  );

  it.each([
    ['pending', null],
    ['rejected', 'genre-mismatch'],
  ])('blocks export when one review is %s', (decision, rejectionReason) => {
    approveAll(candidates, pending);
    Object.assign(pending.reviews[0], {
      decision,
      rejectionReason,
      stratum: null,
      languageTag: null,
      version: null,
      eraTag: null,
      versionTrap: null,
      reference: null,
    });

    expect(() => exportReviewedLyricsCorpus(candidates, pending)).toThrow(
      /all 40 candidate reviews must be approved/i,
    );
  });

  it('rejects missing, duplicate and unknown candidate review ids', () => {
    const missing = structuredClone(pending);
    missing.reviews.pop();
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, missing),
    ).toThrow(/one review per candidate/i);

    const duplicate = structuredClone(pending);
    duplicate.reviews[1].candidateId = duplicate.reviews[0].candidateId;
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, duplicate),
    ).toThrow(/duplicate candidate/i);

    const unknown = structuredClone(pending);
    unknown.reviews[0].candidateId = 'candidate-ffffffffffffffff';
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, unknown),
    ).toThrow(/unknown candidate/i);
  });

  it('rejects an approved review that changes its reach-defining stratum', () => {
    approveAll(candidates, pending);
    pending.reviews[0].stratum =
      pending.reviews[0].stratum === 'chinese-rap'
        ? 'chinese-pop'
        : 'chinese-rap';

    expect(() => exportReviewedLyricsCorpus(candidates, pending)).toThrow(
      /stratum must confirm its candidate/i,
    );
  });

  it.each([
    ['languageTag', 'mainland-china', /language/i],
    ['version', 'original', /version/i],
    ['eraTag', 'classic', /era/i],
    ['versionTrap', 'yes', /version trap/i],
    ['rejectionReason', 'free-form explanation', /rejection reason/i],
  ])('rejects uncontrolled approved field %s', (field, value, message) => {
    approveAll(candidates, pending);
    pending.reviews[0][field] = value;
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, pending),
    ).toThrow(message);
  });

  it('accepts a controlled pre-2010 rejection reason for replacement', () => {
    Object.assign(pending.reviews[0], {
      decision: 'rejected',
      rejectionReason: 'release-before-2010',
    });
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, pending),
    ).not.toThrow();
  });

  it('requires the version tag to equal the manually reviewed reference version', () => {
    approveAll(candidates, pending);
    pending.reviews[0].version = 'live';

    expect(() => exportReviewedLyricsCorpus(candidates, pending)).toThrow(
      /version.*reference/i,
    );
  });

  it('rejects extra fields instead of accepting notes, urls or provider ids', () => {
    pending.reviews[0].notes = 'do not retain';
    expect(() =>
      validatePrivateLyricsReviewManifest(candidates, pending),
    ).toThrow(/invalid fields/i);
  });

  it('rejects malformed or promoted candidate artifacts', () => {
    const promoted = structuredClone(candidates);
    promoted.candidates[0].reviewStatus = 'reviewed';
    expect(() => createPrivateLyricsReviewManifest(promoted)).toThrow(
      /review status/i,
    );

    const unbalanced = structuredClone(candidates);
    unbalanced.candidates[0].catalogReach =
      unbalanced.candidates[0].catalogReach === 'mainstream'
        ? 'long-tail'
        : 'mainstream';
    expect(() => createPrivateLyricsReviewManifest(unbalanced)).toThrow(
      /7 mainstream and 1 long-tail/i,
    );
  });

  it('is deterministic even when the review array is reordered', () => {
    const approved = approveAll(candidates, pending);
    const first = exportReviewedLyricsCorpus(candidates, approved);
    const reorderedManifest = {
      ...structuredClone(approved),
      reviews: [...approved.reviews].reverse(),
    };

    expect(exportReviewedLyricsCorpus(candidates, reorderedManifest)).toEqual(
      first,
    );
  });
});
