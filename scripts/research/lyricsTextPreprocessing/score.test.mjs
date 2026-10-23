import { describe, expect, it } from 'vitest';
import { scoreQuality, describeNumbers } from './score.mjs';

describe('pilot scoring keeps failure and ambiguity denominators', () => {
  it('uses scheduled counts and separates unresolvable pairs from other sung cases', () => {
    const cases = [
      {
        id: 'a',
        language: 'en',
        group: 'credit',
        text: 'Written by: A',
        indistinguishablePair: 'x',
      },
      {
        id: 'b',
        language: 'en',
        group: 'performed',
        text: 'Written by: A',
        indistinguishablePair: 'x',
      },
      { id: 'c', language: 'en', group: 'performed', text: '[Both] oh oh' },
      {
        id: 'd',
        language: 'en',
        group: 'long',
        text: 'a b',
        referencePartitions: [['a ', 'b']],
      },
      {
        id: 'e',
        language: 'en',
        group: 'long',
        text: 'x y',
        referencePartitions: [['x ', 'y']],
      },
    ];
    const rows = [
      {
        caseId: 'a',
        status: 'accepted',
        suggestion: { kind: 'credit-candidate', offsets: [] },
      },
      {
        caseId: 'b',
        status: 'accepted',
        suggestion: { kind: 'credit-candidate', offsets: [] },
      },
      {
        caseId: 'c',
        status: 'fallback',
        error: 'timeout',
        suggestion: { offsets: [] },
      },
      {
        caseId: 'd',
        status: 'accepted',
        suggestion: { kind: 'lyric', offsets: [2] },
      },
    ];
    const score = scoreQuality(cases, rows);
    expect(score.scheduled).toBe(5);
    expect(score.missing).toBe(1);
    expect(score.fallback).toBe(1);
    expect(score.creditCandidates).toBe(1);
    expect(score.ambiguousPerformedCandidateCount).toBe(1);
    expect(score.otherPerformedFalseCandidates).toBe(0);
    expect(score.longExact).toBe(1);
    expect(score.longCount).toBe(2);
    expect(score.referenceBoundaryRecall).toBe(0.5);
  });
  it('does not turn failure retention or a different valid grouping into exact agreement', () => {
    const cases = [
      {
        id: 'a',
        group: 'long',
        text: 'a b c',
        referencePartitions: [['a ', 'b c']],
      },
    ];
    for (const row of [
      { caseId: 'a', status: 'fallback', suggestion: { offsets: [2] } },
      { caseId: 'a', status: 'accepted', suggestion: { offsets: [4] } },
    ])
      expect(scoreQuality(cases, [row]).longExact).toBe(0);
  });
  it('still counts raw credit misclassification when the boundary validator rejected the response', () => {
    const cases = [{ id: 'a', group: 'performed', text: '[Both] oh oh' }];
    const rows = [
      {
        caseId: 'a',
        status: 'fallback',
        raw: {
          choices: [{ message: { content: '{"kind":"credit-candidate"}' } }],
        },
      },
    ];
    const score = scoreQuality(cases, rows);
    expect(score.fallback).toBe(1);
    expect(score.otherPerformedFalseCandidates).toBe(0);
    expect(score.rawOtherPerformedFalseCandidates).toBe(1);
    expect(score.rawUnclassified).toBe(0);
  });
  it('describes all numeric observations and leaves missing samples null', () => {
    expect(describeNumbers([])).toBeNull();
    expect(describeNumbers([1, 2, 3, 30, null])).toEqual({
      n: 4,
      p50: 2,
      p95: 30,
      min: 1,
      max: 30,
      sum: 36,
    });
  });
});
