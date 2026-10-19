import { expect, it } from 'vitest';
import { scoreReviewedSamples } from './listeningReview.cjs';
it('counts only explicit reviewed non-uncertain labels and keeps missing word boundaries in the denominator', () => {
  const proposals = {
    hubertfa: { ready: true, chunks: [{ from: 2, startMs: 1000 }] },
    'hubertfa-small-fold': { ready: false, chunks: [] },
  };
  const samples = [
    { sampleId: 'r-001', proposals, completeness: 'unknown' },
    { sampleId: 'r-002', proposals, completeness: 'possible-missing-text' },
    { sampleId: 'r-003', proposals },
  ];
  const entries = [
    {
      sampleId: 'r-001',
      status: 'reviewed',
      content: 'exact',
      onsets: [{ from: 2, timeMs: 1100 }],
    },
    {
      sampleId: 'r-002',
      status: 'reviewed',
      content: 'different-content',
      onsets: [{ from: 2, timeMs: null }],
    },
    { sampleId: 'r-003', status: 'pending', content: null, onsets: [] },
  ];
  const r = scoreReviewedSamples(entries, samples);
  expect(r.reviewed).toBe(2);
  expect(r.methods.hubertfa).toMatchObject({
    mismatch: 1,
    falseAccept: 1,
    exactBaseReady: 1,
    falseReject: 0,
    markedCuts: 1,
    within100: 1,
    missingCuts: 0,
  });
  expect(r.methods['hubertfa-small-fold']).toMatchObject({
    mismatch: 1,
    falseAccept: 0,
    exactBaseReady: 1,
    falseReject: 1,
    markedCuts: 1,
    within100: 0,
    missingCuts: 1,
  });
  expect(
    scoreReviewedSamples(
      entries.map((e) => ({ ...e, status: 'pending' })),
      samples,
    ).reviewed,
  ).toBe(0);
});
