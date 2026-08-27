import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildReplacementCandidateSetFromSelection,
  buildV3CandidateSetFromSelection,
  carryForwardApprovedReviews,
  carryForwardReplacementReviews,
  runLyricsProviderCorpusSwitch,
} from './lyrics-provider-corpus-switch.mjs';
import {
  createPrivateLyricsReviewManifest,
  validatePrivateLyricsReviewManifest,
} from './lyrics-provider-corpus-review.mjs';
import { createLegacyV2CandidateSet } from './lyrics-provider-corpus-test-fixtures.mjs';

const temporaryDirectories = [];

function temporaryWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-switch-'));
  temporaryDirectories.push(directory);
  return directory;
}

function selectionFor(candidateSet) {
  return {
    schemaVersion: 1,
    targetCandidateSetVersion: 3,
    recordingMbids: [
      ...new Set(candidateSet.candidates.map(({ stratum }) => stratum)),
    ].flatMap((stratum) =>
      candidateSet.candidates
        .filter(
          (candidate) =>
            candidate.stratum === stratum &&
            Number(candidate.reference.firstReleaseDate.slice(0, 4)) >= 2010,
        )
        .slice(0, 8)
        .map(({ source }) => source.recordingMbid),
    ),
    supplements: [],
  };
}

function approve(review, candidate) {
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

function replacementSelectionFor(candidateSet, rejectedCandidates) {
  const rejectedIds = new Set(
    rejectedCandidates.map(({ source }) => source.recordingMbid),
  );
  const supplements = [
    {
      stratum: 'japanese-catalog',
      languageTag: 'japanese',
      recordingMbid: '00000000-0000-4000-8000-999999999901',
      primaryArtistMbid: '00000000-0000-4000-8000-999999999902',
      workQid: 'Q999999901',
      workMbid: '00000000-0000-4000-8000-999999999903',
      title: 'Replacement Japanese mainstream',
      artist: 'Replacement Japanese artist',
      album: null,
      durationMs: 240_000,
      firstReleaseDate: '2024-01-01',
      listenCount: 999_999,
      userCount: 99_999,
      classificationBasis: 'work-metadata',
    },
    {
      stratum: 'korean-catalog',
      languageTag: 'korean',
      recordingMbid: '00000000-0000-4000-8000-999999999911',
      primaryArtistMbid: '00000000-0000-4000-8000-999999999912',
      workQid: 'Q999999911',
      workMbid: '00000000-0000-4000-8000-999999999913',
      title: 'Replacement Korean long-tail',
      artist: 'Replacement Korean artist',
      album: null,
      durationMs: 220_000,
      firstReleaseDate: '2024-01-01',
      listenCount: 0,
      userCount: 0,
      classificationBasis: 'work-metadata',
    },
  ];
  return {
    schemaVersion: 1,
    targetCandidateSetVersion: 4,
    recordingMbids: [
      ...candidateSet.candidates
        .filter(({ source }) => !rejectedIds.has(source.recordingMbid))
        .map(({ source }) => source.recordingMbid),
      ...supplements.map(({ recordingMbid }) => recordingMbid),
    ],
    supplements,
  };
}

function reviewedReplacementFixture() {
  const legacy = createLegacyV2CandidateSet();
  const current = buildV3CandidateSetFromSelection(
    legacy,
    selectionFor(legacy),
  );
  const currentReviews = createPrivateLyricsReviewManifest(current);
  const pending = current.candidates[0];
  const rejected = [
    current.candidates.find(
      ({ stratum, catalogReach }) =>
        stratum === 'japanese-catalog' && catalogReach === 'mainstream',
    ),
    current.candidates.find(
      ({ stratum, catalogReach }) =>
        stratum === 'korean-catalog' && catalogReach === 'long-tail',
    ),
  ];
  for (const candidate of current.candidates) {
    const review = currentReviews.reviews.find(
      ({ candidateId }) => candidateId === candidate.id,
    );
    if (candidate.id === pending.id) continue;
    if (rejected.some(({ id }) => id === candidate.id)) {
      review.decision = 'rejected';
      review.rejectionReason = 'other';
    } else {
      approve(review, candidate);
    }
  }
  return {
    current,
    currentReviews,
    rejected,
    selection: replacementSelectionFor(current, rejected),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('private lyrics provider corpus switch', () => {
  it('revises v3 into v4, carries 37 exact approvals, and resets only two replacements to pending', () => {
    const { current, currentReviews, rejected, selection } =
      reviewedReplacementFixture();

    const target = buildReplacementCandidateSetFromSelection(
      current,
      selection,
    );
    const result = carryForwardReplacementReviews(
      current,
      currentReviews,
      target,
    );

    expect(target.candidateSetId).toBe('lyrics-provider-private-candidates-v4');
    expect(
      target.candidates.some(({ source }) =>
        rejected.some(
          (candidate) =>
            candidate.source.recordingMbid === source.recordingMbid,
        ),
      ),
    ).toBe(false);
    expect(result).toMatchObject({ carriedCount: 37 });
    expect(
      result.manifest.reviews.filter(({ decision }) => decision === 'approved'),
    ).toHaveLength(37);
    expect(
      result.manifest.reviews.filter(({ decision }) => decision === 'pending'),
    ).toHaveLength(3);
    expect(
      result.manifest.reviews.filter(({ decision }) => decision === 'rejected'),
    ).toHaveLength(0);
    expect(() =>
      validatePrivateLyricsReviewManifest(target, result.manifest),
    ).not.toThrow();
  });

  it('archives reviewed v3 byte-for-byte and switches fixed artifacts to v4', () => {
    const cwd = temporaryWorkspace();
    const directory = path.join(cwd, '.benchmarks', 'lyrics-provider');
    fs.mkdirSync(directory, { recursive: true });
    const { current, currentReviews, selection } = reviewedReplacementFixture();
    const candidateText = `${JSON.stringify(current, null, 2)}\n`;
    const reviewText = `${JSON.stringify(currentReviews, null, 2)}\n`;
    fs.writeFileSync(path.join(directory, 'candidates.json'), candidateText);
    fs.writeFileSync(path.join(directory, 'reviews.json'), reviewText);
    fs.writeFileSync(
      path.join(directory, 'v4-selection.json'),
      `${JSON.stringify(selection, null, 2)}\n`,
    );

    const result = runLyricsProviderCorpusSwitch({
      cwd,
      consoleLike: { log: vi.fn() },
    });

    expect(result).toEqual({ candidateCount: 40, carriedCount: 37 });
    expect(
      fs.readFileSync(
        path.join(directory, 'candidates-v3-reviewed-40.json'),
        'utf8',
      ),
    ).toBe(candidateText);
    expect(
      fs.readFileSync(
        path.join(directory, 'reviews-v3-reviewed-40.json'),
        'utf8',
      ),
    ).toBe(reviewText);
    const target = JSON.parse(
      fs.readFileSync(path.join(directory, 'candidates.json'), 'utf8'),
    );
    const targetReviews = JSON.parse(
      fs.readFileSync(path.join(directory, 'reviews.json'), 'utf8'),
    );
    expect(target.candidateSetId).toBe('lyrics-provider-private-candidates-v4');
    expect(
      targetReviews.reviews.filter(({ decision }) => decision === 'approved'),
    ).toHaveLength(37);
    expect(
      targetReviews.reviews.filter(({ decision }) => decision === 'pending'),
    ).toHaveLength(3);
  });

  it('builds the exact v3 40-case shortlist and labels Chinese recording evidence explicitly', () => {
    const legacy = createLegacyV2CandidateSet();
    const target = buildV3CandidateSetFromSelection(
      legacy,
      selectionFor(legacy),
    );

    expect(target.candidateSetId).toBe('lyrics-provider-private-candidates-v3');
    expect(target.candidates).toHaveLength(40);
    expect(
      target.candidates
        .filter(({ stratum }) => stratum.startsWith('chinese-'))
        .every(
          ({ source }) => source.classificationBasis === 'recording-shortlist',
        ),
    ).toBe(true);
    expect(
      target.candidates
        .filter(({ stratum }) => !stratum.startsWith('chinese-'))
        .every(({ source }) => source.classificationBasis === 'work-metadata'),
    ).toBe(true);
  });

  it('carries only exact non-Chinese approvals and leaves Chinese shortlist decisions pending', () => {
    const legacy = createLegacyV2CandidateSet();
    const legacyReviews = createPrivateLyricsReviewManifest(legacy);
    const selectedIds = new Set(selectionFor(legacy).recordingMbids);
    const chinese = legacy.candidates.find(
      (candidate) =>
        selectedIds.has(candidate.source.recordingMbid) &&
        candidate.stratum.startsWith('chinese-'),
    );
    const nonChinese = legacy.candidates.find(
      (candidate) =>
        selectedIds.has(candidate.source.recordingMbid) &&
        !candidate.stratum.startsWith('chinese-'),
    );
    approve(
      legacyReviews.reviews.find(
        ({ candidateId }) => candidateId === chinese.id,
      ),
      chinese,
    );
    approve(
      legacyReviews.reviews.find(
        ({ candidateId }) => candidateId === nonChinese.id,
      ),
      nonChinese,
    );
    const target = buildV3CandidateSetFromSelection(
      legacy,
      selectionFor(legacy),
    );

    const result = carryForwardApprovedReviews(legacy, legacyReviews, target);

    expect(result.carriedCount).toBe(1);
    expect(
      result.manifest.reviews.filter(({ decision }) => decision === 'approved'),
    ).toHaveLength(1);
    expect(
      result.manifest.reviews.find(({ decision }) => decision === 'approved')
        ?.stratum,
    ).toBe(nonChinese.stratum);
    expect(() =>
      validatePrivateLyricsReviewManifest(target, result.manifest),
    ).not.toThrow();
  });

  it('archives v2 byte-for-byte and switches both fixed artifacts to v3', () => {
    const cwd = temporaryWorkspace();
    const directory = path.join(cwd, '.benchmarks', 'lyrics-provider');
    fs.mkdirSync(directory, { recursive: true });
    const legacy = createLegacyV2CandidateSet();
    const legacyReviews = createPrivateLyricsReviewManifest(legacy);
    const selection = selectionFor(legacy);
    const candidateText = `${JSON.stringify(legacy, null, 2)}\n`;
    const reviewText = `${JSON.stringify(legacyReviews, null, 2)}\n`;
    fs.writeFileSync(path.join(directory, 'candidates.json'), candidateText);
    fs.writeFileSync(path.join(directory, 'reviews.json'), reviewText);
    fs.writeFileSync(
      path.join(directory, 'v3-selection.json'),
      `${JSON.stringify(selection, null, 2)}\n`,
    );
    const log = vi.fn();

    const result = runLyricsProviderCorpusSwitch({
      cwd,
      consoleLike: { log },
    });

    expect(result).toEqual({ candidateCount: 40, carriedCount: 0 });
    expect(
      fs.readFileSync(
        path.join(directory, 'candidates-v2-legacy-100.json'),
        'utf8',
      ),
    ).toBe(candidateText);
    expect(
      fs.readFileSync(
        path.join(directory, 'reviews-v2-legacy-100.json'),
        'utf8',
      ),
    ).toBe(reviewText);
    const current = JSON.parse(
      fs.readFileSync(path.join(directory, 'candidates.json'), 'utf8'),
    );
    const reviews = JSON.parse(
      fs.readFileSync(path.join(directory, 'reviews.json'), 'utf8'),
    );
    expect(current.candidateSetId).toBe(
      'lyrics-provider-private-candidates-v3',
    );
    expect(reviews.candidateSetId).toBe(current.candidateSetId);
    expect(log.mock.calls.flat()).toEqual([
      'candidate-count=40',
      'carried-review-count=0',
    ]);
  });

  it('refuses to overwrite a mismatched legacy archive', () => {
    const cwd = temporaryWorkspace();
    const directory = path.join(cwd, '.benchmarks', 'lyrics-provider');
    fs.mkdirSync(directory, { recursive: true });
    const legacy = createLegacyV2CandidateSet();
    fs.writeFileSync(
      path.join(directory, 'candidates.json'),
      JSON.stringify(legacy),
    );
    fs.writeFileSync(
      path.join(directory, 'reviews.json'),
      JSON.stringify(createPrivateLyricsReviewManifest(legacy)),
    );
    fs.writeFileSync(
      path.join(directory, 'v3-selection.json'),
      JSON.stringify(selectionFor(legacy)),
    );
    fs.writeFileSync(
      path.join(directory, 'candidates-v2-legacy-100.json'),
      'mismatch',
    );

    expect(() => runLyricsProviderCorpusSwitch({ cwd })).toThrow(
      /archive.*does not match/i,
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(directory, 'candidates.json'), 'utf8'),
      ).candidateSetId,
    ).toBe('lyrics-provider-private-candidates-v2');
  });
});
