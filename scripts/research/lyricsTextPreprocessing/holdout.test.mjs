import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  buildHoldoutSchedule,
  evaluateSplit,
  referenceCoverage,
  validateCorpus,
} from './holdout.mjs';

const source = {
  lineId: '91d524ba35d84f20',
  language: 'en',
  text: 'aaa bbb ccc ddd',
  source: { startMs: 100, endMs: 200 },
};
const answer = {
  lineId: source.lineId,
  caseId: 'test-M1a',
  language: 'en',
  primary: 'split',
  family: 'test-M1',
  joint: true,
  referencePartitions: [
    ['aaa ', 'bbb ccc ', 'ddd'],
    ['aaa bbb ', 'ccc ddd'],
  ],
  forbiddenSpans: [{ start: 0, end: 3, reason: 'dependency' }],
};
describe('synthetic holdout scoring and data isolation', () => {
  it('accepts alternative complete partitions, never their boundary union', () => {
    const row = (offsets) => ({ status: 'accepted', suggestion: { offsets } });
    expect(evaluateSplit(answer, row([4, 12])).acceptable).toBe(true);
    expect(evaluateSplit(answer, row([8])).acceptable).toBe(true);
    expect(evaluateSplit(answer, row([4, 8])).acceptable).toBe(false);
    expect(evaluateSplit(answer, row([4, 8])).bestReference.index).toBe(1);
    expect(evaluateSplit(answer, row([4, 8])).bestReference.f1).toBeCloseTo(
      2 / 3,
    );
  });
  it('does not award a no-cut fallback or missing result as a semantic success', () => {
    const zero = { ...answer, referencePartitions: [[source.text]] };
    expect(
      evaluateSplit(zero, { status: 'fallback', suggestion: { offsets: [] } })
        .acceptable,
    ).toBe(false);
    expect(evaluateSplit(zero, undefined).missing).toBe(true);
    expect(
      evaluateSplit(zero, { status: 'accepted', suggestion: { offsets: [] } })
        .acceptable,
    ).toBe(true);
  });
  it('counts forbidden raw choices even when structural validation rejects them', () => {
    const input = { boundaries: [{ id: 'b0', offset: 2 }] };
    const row = {
      status: 'fallback',
      raw: {
        choices: [
          { message: { content: JSON.stringify({ breakIds: ['b0'] }) } },
        ],
      },
      suggestion: { offsets: [] },
    };
    expect(evaluateSplit(answer, row, input).rawForbidden).toEqual([
      'dependency',
    ]);
    expect(evaluateSplit(answer, row, input).acceptable).toBe(false);
  });
  it('measures whether any whole reference is feasible, keeping infeasible in the schedule', () => {
    expect(
      referenceCoverage(answer, { boundaries: [{ offset: 8 }] }).anyFeasible,
    ).toBe(true);
    expect(
      referenceCoverage(answer, { boundaries: [{ offset: 4 }] }).anyFeasible,
    ).toBe(false);
  });
  it('sends no timing, answer, family, task label or hidden intent to C/E', () => {
    const poison = {
      ...answer,
      get referencePartitions() {
        throw Error('answer leaked into scheduling');
      },
    };
    const schedule = buildHoldoutSchedule([source], [poison]);
    expect(schedule.map((s) => s.arm).sort()).toEqual(['C', 'E']);
    for (const entry of schedule) {
      expect(Object.keys(entry.condition.payload).sort()).toEqual(
        entry.arm === 'C'
          ? ['boundaries', 'language', 'lineId', 'target']
          : ['language', 'lineId', 'target'],
      );
      expect(entry.condition.payload.lineId).toBe(source.lineId);
      expect(JSON.stringify(entry.condition.payload)).not.toMatch(
        /startMs|endMs|family|hiddenIntent|reference/,
      );
      if (entry.arm === 'C')
        expect(
          entry.condition.payload.boundaries.every(
            (b) => b.left + b.right === source.text,
          ),
        ).toBe(true);
    }
    expect(buildHoldoutSchedule([source], [poison])).toEqual(schedule);
  });
  it('checks the authored 100 occurrences and schedules exactly the frozen 70/50 design', () => {
    const read = (name) =>
      JSON.parse(
        fs.readFileSync(
          new URL(
            `../../../docs/research/lyrics-text-holdout/${name}-2026-10-23.json`,
            import.meta.url,
          ),
          'utf8',
        ),
      ).cases;
    const inputs = read('inputs'),
      answers = read('answers');
    const report = validateCorpus(inputs, answers);
    expect(report.occurrences).toBe(100);
    expect(
      report.languages.every(
        (l) =>
          l.split === 12 && l.classification === 8 && l.splitFamilies === 10,
      ),
    ).toBe(true);
    expect(report.indistinguishablePairs).toBe(5);
    const plan = buildHoldoutSchedule(inputs, answers);
    expect(plan).toHaveLength(120);
    expect(plan.filter((p) => p.arm === 'C')).toHaveLength(70);
    expect(plan.filter((p) => p.arm === 'E')).toHaveLength(50);
    expect(plan.filter((p) => p.cohort === 'main')).toHaveLength(100);
    expect(plan.filter((p) => p.cohort === 'joint-extra')).toHaveLength(20);
    expect(new Set(plan.map((p) => p.requestId)).size).toBe(120);
  });
  it('rejects missing inputs and invalid source reconstruction', () => {
    expect(() => buildHoldoutSchedule([], [answer])).toThrow('missing-input');
    expect(() =>
      validateCorpus(
        [source],
        [{ ...answer, referencePartitions: [['changed']] }],
      ),
    ).toThrow();
  });
});
