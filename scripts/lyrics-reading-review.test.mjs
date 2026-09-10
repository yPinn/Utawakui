import { describe, expect, it } from 'vitest';

import { buildLocalLyricsReadingCorpus } from './lib/lyricsReadingCorpus/localCorpus.mjs';
import {
  applyLocalReadingReview,
  createLocalReadingReviewManifest,
  exportLocalReadingBenchmark,
  localReadingCorpusSha256,
  parseSegmentReadingEdits,
  summarizeLocalReadingReviews,
  undoLastLocalReadingReview,
  validateLocalReadingReviewManifest,
} from './lib/lyricsReadingCorpus/review.mjs';
import { validateLyricsReadingBenchmark } from './lyrics-reading-evaluation.mjs';

const COHORTS = [
  'standard',
  'proper-noun',
  'mixed',
  'jukujikun',
  'song-specific',
];
const REQUIRED_COHORTS = COHORTS.filter((cohort) => cohort !== 'song-specific');

function readingDocument(lines) {
  return {
    schemaVersion: 3,
    script: 'ja',
    analyzer: { id: 'kuromoji-wanakana', version: '0.1.2+5.3.1' },
    lines,
  };
}

function readingLine(text, reading, options = {}) {
  return {
    text,
    segments: [{ t: text, r: reading }],
    edited: options.edited === true,
  };
}

function corpus(caseCount = 105) {
  const records = Array.from({ length: caseCount }, (_, index) => ({
    trackId: `track-${index}`,
    document: readingDocument([
      readingLine(`漢字${index}`, `かんじ${index}`, {
        edited: index === 0,
      }),
    ]),
  }));
  return buildLocalLyricsReadingCorpus(records, {
    generatedAt: '2026-09-10T00:00:00.000Z',
    identitySalt: 'private-test-run',
    limit: Math.max(100, caseCount),
    perRecordingLimit: 4,
  });
}

function sourceCases(value) {
  return [...value.goldSeed.cases, ...value.reviewQueue.cases];
}

function approve(
  manifest,
  source,
  count = sourceCases(source).length,
  cohorts = REQUIRED_COHORTS,
) {
  const cases = sourceCases(source);
  for (let index = 0; index < count; index += 1) {
    const cohort = cohorts[index % cohorts.length];
    applyLocalReadingReview(source, manifest, {
      caseId: cases[index].id,
      decision: 'approved',
      cohort,
    });
  }
  return manifest;
}

describe('local lyrics reading review domain', () => {
  it('creates a separate all-pending manifest bound to the exact corpus', () => {
    const source = corpus();
    const manifest = createLocalReadingReviewManifest(source);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpusId: 'utawakui-local-reading-review-v1',
      corpusSha256: localReadingCorpusSha256(source),
      status: 'in-review',
    });
    expect(manifest.reviews).toHaveLength(105);
    expect(
      manifest.reviews.every(
        (review) =>
          review.decision === 'pending' &&
          review.cohort === null &&
          review.analyzerAddressable === null &&
          review.expectedKana === null &&
          review.expectedSegments === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(manifest)).not.toMatch(/漢字|currentKana|track-/u);
  });

  it('binds the manifest to source content and rejects malformed review entries', () => {
    const source = corpus();
    const manifest = createLocalReadingReviewManifest(source);
    const changedSource = structuredClone(source);
    changedSource.reviewQueue.cases[0].currentKana = 'べつ';
    changedSource.reviewQueue.cases[0].currentSegments = [
      { t: changedSource.reviewQueue.cases[0].text, r: 'べつ' },
    ];

    expect(() =>
      validateLocalReadingReviewManifest(changedSource, manifest),
    ).toThrow(/digest/i);

    const extraField = structuredClone(manifest);
    extraField.reviews[0].notes = 'must not be retained';
    expect(() =>
      validateLocalReadingReviewManifest(source, extraField),
    ).toThrow(/invalid fields/i);

    const duplicate = structuredClone(manifest);
    duplicate.reviews[1].caseId = duplicate.reviews[0].caseId;
    expect(() => validateLocalReadingReviewManifest(source, duplicate)).toThrow(
      /duplicate/i,
    );
  });

  it('accepts complete persisted scan statistics but rejects a partial extension', () => {
    const source = corpus();
    Object.assign(source.summary, {
      documentsSeen: 120,
      directoryEntriesSeen: 240,
      sourceBytesRead: 4096,
    });
    expect(() => createLocalReadingReviewManifest(source)).not.toThrow();

    delete source.summary.sourceBytesRead;
    expect(() => createLocalReadingReviewManifest(source)).toThrow(
      /scan fields/i,
    );
  });

  it.each(['\u009b', '\u2028', '\u202e', '\u2066'])(
    'rejects terminal-control text before interactive display: %j',
    (control) => {
      const source = corpus();
      const sourceCase = source.reviewQueue.cases[0];
      sourceCase.text += control;
      sourceCase.currentSegments[0].t += control;

      expect(() => createLocalReadingReviewManifest(source)).toThrow(
        /source text/i,
      );
    },
  );

  it('accepts the current segmented reading and derives addressability from cohort', () => {
    const source = corpus();
    const manifest = createLocalReadingReviewManifest(source);
    const automaticCase = source.reviewQueue.cases[0];

    applyLocalReadingReview(source, manifest, {
      caseId: automaticCase.id,
      decision: 'approved',
      cohort: 'proper-noun',
    });

    const review = manifest.reviews.find(
      ({ caseId }) => caseId === automaticCase.id,
    );
    expect(review).toMatchObject({
      decision: 'approved',
      cohort: 'proper-noun',
      analyzerAddressable: true,
      expectedKana: automaticCase.currentKana,
      expectedSegments: automaticCase.currentSegments,
    });
  });

  it('applies bounded one-based segment reading edits without changing canonical text', () => {
    const source = corpus();
    const manifest = createLocalReadingReviewManifest(source);
    const automaticCase = source.reviewQueue.cases[0];

    applyLocalReadingReview(source, manifest, {
      caseId: automaticCase.id,
      decision: 'approved',
      cohort: 'song-specific',
      segmentEdits: parseSegmentReadingEdits(
        '1=そら',
        automaticCase.currentSegments.length,
      ),
    });

    const review = manifest.reviews.find(
      ({ caseId }) => caseId === automaticCase.id,
    );
    expect(review).toMatchObject({
      decision: 'approved',
      cohort: 'song-specific',
      analyzerAddressable: false,
      expectedKana: 'そら',
      expectedSegments: [{ t: automaticCase.text, r: 'そら' }],
    });
    expect(review.expectedSegments.map(({ t }) => t).join('')).toBe(
      automaticCase.text,
    );
  });

  it.each([
    ['', /edit/i],
    ['0=そら', /index/i],
    ['2=そら', /index/i],
    ['1=', /reading/i],
    ['1=そら,1=うちゅう', /duplicate/i],
    [`1=${'a'.repeat(641)}`, /length/i],
  ])('rejects an invalid segment edit expression: %j', (value, message) => {
    expect(() => parseSegmentReadingEdits(value, 1)).toThrow(message);
  });

  it('skips uncertain cases, summarizes without text, and can undo the last decision', () => {
    const source = corpus();
    const manifest = createLocalReadingReviewManifest(source);
    const first = sourceCases(source)[0];

    applyLocalReadingReview(source, manifest, {
      caseId: first.id,
      decision: 'skipped',
    });
    const summary = summarizeLocalReadingReviews(source, manifest);
    expect(summary).toMatchObject({
      total: 105,
      pending: 104,
      approved: 0,
      skipped: 1,
    });
    expect(JSON.stringify(summary)).not.toContain(first.text);

    expect(undoLastLocalReadingReview(source, manifest)).toBe(first.id);
    expect(summarizeLocalReadingReviews(source, manifest)).toMatchObject({
      pending: 105,
      skipped: 0,
    });
  });

  it('exports 100 approved addressable cases without inventing song-specific evidence', () => {
    const source = corpus();
    const manifest = approve(
      createLocalReadingReviewManifest(source),
      source,
      100,
    );
    const benchmark = exportLocalReadingBenchmark(source, manifest);

    expect(() => validateLyricsReadingBenchmark(benchmark)).not.toThrow();
    expect(benchmark).toMatchObject({
      schemaVersion: 1,
      benchmarkId: 'utawakui-local-reading-benchmark-v1',
      baselineAnalyzerId: 'kuromoji-wanakana',
      acceptance: {
        minimumCases: 100,
        requiredCohorts: REQUIRED_COHORTS,
        minimumCanonicalIntegrityRate: 1,
        maximumAnalysisFailureRate: 0,
        maximumShadowFalsePositiveCount: 0,
      },
    });
    expect(benchmark.cases).toHaveLength(100);
    expect(
      benchmark.cases.every(
        (benchmarkCase) => benchmarkCase.cohort !== 'song-specific',
      ),
    ).toBe(true);
    expect(
      benchmark.cases.every(
        (benchmarkCase) =>
          benchmarkCase.lines.length === 1 &&
          benchmarkCase.expectedShadowCorrectionIds.length === 0,
      ),
    ).toBe(true);
  });

  it('blocks export below 100 approved cases or without every required cohort', () => {
    const source = corpus();
    const tooSmall = approve(
      createLocalReadingReviewManifest(source),
      source,
      99,
    );
    expect(() => exportLocalReadingBenchmark(source, tooSmall)).toThrow(
      /100 approved/i,
    );

    const missingCohort = createLocalReadingReviewManifest(source);
    for (const sourceCase of sourceCases(source).slice(0, 100)) {
      applyLocalReadingReview(source, missingCohort, {
        caseId: sourceCase.id,
        decision: 'approved',
        cohort: 'standard',
      });
    }
    expect(() => exportLocalReadingBenchmark(source, missingCohort)).toThrow(
      /required cohort/i,
    );
  });
});
