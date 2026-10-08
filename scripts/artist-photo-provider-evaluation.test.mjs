import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evaluateArtistPhotoProvider,
  selectAutomaticArtistPhotoCandidateRank,
  validateArtistPhotoEvaluationCorpus,
  validateArtistPhotoProviderObservations,
  validateArtistPhotoProviderReviews,
} from './artist-photo-provider-evaluation.mjs';

const corpus = JSON.parse(
  fs.readFileSync(
    new URL(
      './fixtures/artist-photo-provider-evaluation/synthetic-four-case.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const observations = {
  schemaVersion: 1,
  provider: 'synthetic-provider-v1',
  cases: [
    {
      caseId: 'listed-current',
      status: 'ok',
      latencyMs: 100,
      operationalFailures: [],
      candidates: [
        {
          rank: 1,
          entityId: 'UC1111111111111111111111',
          name: 'PRIVATE ARTIST CURRENT',
          portrait: {
            host: 'lh3.googleusercontent.com',
            width: 120,
            height: 120,
          },
          evidence: {
            exactName: true,
            matchedChannelCount: 2,
            matchedVideoCount: 1,
          },
        },
      ],
    },
    {
      caseId: 'listed-recovery-one',
      status: 'ok',
      latencyMs: 200,
      operationalFailures: [],
      candidates: [
        {
          rank: 1,
          entityId: 'UC2222222222222222222222',
          name: 'PRIVATE ARTIST RECOVERY ONE',
          portrait: {
            host: 'yt3.googleusercontent.com',
            width: 120,
            height: 120,
          },
          evidence: {
            exactName: true,
            matchedChannelCount: 2,
            matchedVideoCount: 0,
          },
        },
      ],
    },
    {
      caseId: 'listed-recovery-two',
      status: 'ok',
      latencyMs: 300,
      operationalFailures: [],
      candidates: [
        {
          rank: 1,
          entityId: 'UC3333333333333333333333',
          name: 'WRONG PRIVATE ARTIST',
          portrait: {
            host: 'yt3.googleusercontent.com',
            width: 120,
            height: 120,
          },
          evidence: {
            exactName: false,
            matchedChannelCount: 0,
            matchedVideoCount: 0,
          },
        },
        {
          rank: 2,
          entityId: 'UC4444444444444444444444',
          name: 'PRIVATE ARTIST RECOVERY TWO',
          portrait: {
            host: 'yt3.googleusercontent.com',
            width: 120,
            height: 120,
          },
          evidence: {
            exactName: true,
            matchedChannelCount: 0,
            matchedVideoCount: 1,
          },
        },
      ],
    },
    {
      caseId: 'catalog-miss',
      status: 'error',
      latencyMs: 800,
      candidates: [],
      operationalFailures: [{ stage: 'search', reason: 'provider-error' }],
    },
  ],
};

const reviews = {
  schemaVersion: 1,
  reviewer: 'synthetic-review-v1',
  cases: [
    { caseId: 'listed-current', correctRanks: [1] },
    { caseId: 'listed-recovery-one', correctRanks: [1] },
    { caseId: 'listed-recovery-two', correctRanks: [2] },
    { caseId: 'catalog-miss', correctRanks: [] },
  ],
};

describe('artist photo provider evaluation contract', () => {
  it('accepts a bounded private corpus and rejects unsafe shapes', () => {
    expect(
      validateArtistPhotoEvaluationCorpus(corpus, { requiredCaseCount: 4 }),
    ).toBe(corpus);

    expect(() =>
      validateArtistPhotoEvaluationCorpus(
        {
          ...corpus,
          cases: corpus.cases.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  leakedUrl: 'https://example.invalid/private',
                }
              : entry,
          ),
        },
        { requiredCaseCount: 4 },
      ),
    ).toThrow(/invalid fields/i);
    expect(() =>
      validateArtistPhotoEvaluationCorpus(
        {
          ...corpus,
          cases: corpus.cases.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  recordings: [
                    { ...entry.recordings[0], videoId: '../unsafe' },
                  ],
                }
              : entry,
          ),
        },
        { requiredCaseCount: 4 },
      ),
    ).toThrow(/video id/i);
    expect(() =>
      validateArtistPhotoEvaluationCorpus({
        ...corpus,
        corpusId: 'artist-photo-private-v1',
      }),
    ).toThrow(/case count/i);
  });

  it('accepts only one bounded observation and review per corpus case', () => {
    expect(validateArtistPhotoProviderObservations(observations, corpus)).toBe(
      observations,
    );
    expect(
      validateArtistPhotoProviderReviews(reviews, corpus, observations),
    ).toBe(reviews);

    expect(() =>
      validateArtistPhotoProviderObservations(
        {
          ...observations,
          cases: [...observations.cases, observations.cases[0]],
        },
        corpus,
      ),
    ).toThrow(/unique|exactly once/i);
    expect(() =>
      validateArtistPhotoProviderReviews(
        {
          ...reviews,
          cases: reviews.cases.map((entry, index) =>
            index === 1 ? { ...entry, correctRanks: [3] } : entry,
          ),
        },
        corpus,
        observations,
      ),
    ).toThrow(/candidate rank/i);
  });

  it('computes coverage, retrieval, latency, failure, and safety metrics', () => {
    const result = evaluateArtistPhotoProvider({
      corpus,
      observations,
      reviews,
    });

    expect(result.run).toEqual({
      caseCount: 4,
      listedCaseCount: 3,
      provider: 'synthetic-provider-v1',
      corpusProfile: 'synthetic-v1',
    });
    expect(result.metrics).toMatchObject({
      currentPhotoCount: 1,
      projectedPhotoPresenceCount: 3,
      verifiedAutomaticRecoveryCount: 2,
      currentPresencePlusVerifiedRecoveryCount: 3,
      listedMissingCount: 2,
      listedRecoveredCount: 2,
      top1CorrectCount: 2,
      top3CorrectCount: 3,
      wrongAutoApplyCount: 0,
      currentCoveragePercent: 25,
      projectedPhotoPresencePercent: 75,
      currentPresencePlusVerifiedRecoveryPercent: 75,
      verifiedRecoveryLiftPercentagePoints: 50,
      top3RecallPercent: 75,
      failureRatePercent: 25,
      p95LatencyMs: 800,
    });
    expect(result.gates).toMatchObject({
      zeroWrongAutoApply: true,
      preservesExistingPhotos: true,
      recoversListedMissing: true,
      improvesFullCoverage: true,
      meetsTop3Recall: false,
      meetsFailureRate: false,
    });
    expect(result.decision).toBe('conditional-go');
  });

  it('returns an aggregate report that does not contain private names, ids, or URLs', () => {
    const serialized = JSON.stringify(
      evaluateArtistPhotoProvider({ corpus, observations, reviews }),
    );
    expect(serialized).not.toContain('PRIVATE');
    expect(serialized).not.toContain('AAAAAAAAAAA');
    expect(serialized).not.toContain('UC1111111111111111111111');
    expect(serialized).not.toContain('http');
    expect(serialized).not.toContain('listed-current');
  });

  it('rejects an auto-apply rank that the reviewer did not mark correct', () => {
    const unsafeObservations = {
      ...observations,
      cases: observations.cases.map((entry) =>
        entry.caseId === 'listed-recovery-two'
          ? {
              ...entry,
              candidates: entry.candidates.map((candidate) =>
                candidate.rank === 1
                  ? {
                      ...candidate,
                      evidence: {
                        ...candidate.evidence,
                        matchedVideoCount: 2,
                      },
                    }
                  : {
                      ...candidate,
                      evidence: {
                        ...candidate.evidence,
                        exactName: false,
                        matchedVideoCount: 0,
                      },
                    },
              ),
            }
          : entry,
      ),
    };

    const result = evaluateArtistPhotoProvider({
      corpus,
      observations: unsafeObservations,
      reviews,
    });
    expect(result.metrics).toMatchObject({
      automaticCandidateCount: 2,
      projectedPhotoPresenceCount: 3,
      verifiedAutomaticRecoveryCount: 1,
      currentPresencePlusVerifiedRecoveryCount: 2,
      wrongAutoApplyCount: 1,
    });
    expect(result.gates.zeroWrongAutoApply).toBe(false);
    expect(result.decision).toBe('no-go');
  });

  it('rejects unregistered provider labels before they reach a public report', () => {
    expect(() =>
      validateArtistPhotoProviderObservations(
        { ...observations, provider: 'PRIVATE C:\\Users\\secret' },
        corpus,
      ),
    ).toThrow(/provider/i);
    expect(() =>
      validateArtistPhotoProviderObservations(
        { ...observations, provider: 'https://private.invalid' },
        corpus,
      ),
    ).toThrow(/provider/i);
  });

  it('counts partial enrichment failures and abstains from automatic apply', () => {
    const partialObservations = {
      ...observations,
      cases: observations.cases.map((entry) =>
        entry.caseId === 'listed-recovery-one'
          ? {
              ...entry,
              status: 'partial',
              operationalFailures: [{ stage: 'playlist', reason: 'timeout' }],
            }
          : entry,
      ),
    };

    const result = evaluateArtistPhotoProvider({
      corpus,
      observations: partialObservations,
      reviews,
    });
    expect(result.metrics).toMatchObject({
      verifiedAutomaticRecoveryCount: 1,
      operationalFailureCount: 2,
      failureRatePercent: 50,
    });
    expect(result.gates.meetsFailureRate).toBe(false);
    expect(result.decision).toBe('no-go');
  });

  it('requires the approved multi-evidence or exact-name/no-runner-up gate', () => {
    const oneVideoWrongName = {
      ...observations.cases[1],
      candidates: [
        {
          ...observations.cases[1].candidates[0],
          evidence: {
            exactName: false,
            matchedChannelCount: 0,
            matchedVideoCount: 1,
          },
        },
      ],
    };
    expect(
      selectAutomaticArtistPhotoCandidateRank(oneVideoWrongName, {
        currentPhotoPresent: false,
      }),
    ).toBeNull();

    const duplicateExactName = {
      ...observations.cases[2],
      candidates: observations.cases[2].candidates.map((candidate, index) => ({
        ...candidate,
        evidence:
          index === 0
            ? {
                exactName: true,
                matchedChannelCount: 0,
                matchedVideoCount: 0,
              }
            : {
                exactName: true,
                matchedChannelCount: 0,
                matchedVideoCount: 1,
              },
      })),
    };
    expect(
      selectAutomaticArtistPhotoCandidateRank(duplicateExactName, {
        currentPhotoPresent: false,
      }),
    ).toBeNull();
  });
});
