import { describe, expect, it } from 'vitest';
import { makeInput, modelPayload, SYSTEM } from './contract.mjs';
import {
  makeCondition,
  coarseCandidates,
  validateCondition,
  buildSchedule,
} from './ablation.mjs';

describe('frozen 4B task and candidate ablation', () => {
  const input = makeInput(
    {
      text: '[女] 等到夜色退去，我仍在這裡 [男] 我們一起等黎明（oh oh）🌙',
      language: 'zh-Hant',
    },
    9,
  );
  it('holds A exactly equivalent to the original interface', () => {
    const a = makeCondition(input, 'A');
    expect(a.system).toBe(SYSTEM);
    expect(a.payload).toEqual(modelPayload(input));
  });
  it('isolates task/interface, then candidate rendering, then subset', () => {
    const b = makeCondition(input, 'B'),
      c = makeCondition(input, 'C'),
      d = makeCondition(input, 'D');
    expect(b.system).toBe(c.system);
    expect(c.system).toBe(d.system);
    expect(b.input.boundaries).toEqual(c.input.boundaries);
    expect(Object.keys(b.schema.properties)).toEqual(['lineId', 'breakIds']);
    expect(
      c.payload.boundaries.every((p) => p.left + p.right === input.text),
    ).toBe(true);
    expect(d.input.boundaries.length).toBeLessThanOrEqual(8);
    expect(
      d.input.boundaries.every((p) =>
        input.boundaries.some((q) => q.id === p.id && q.offset === p.offset),
      ),
    ).toBe(true);
    for (const v of [b, c, d])
      expect(JSON.stringify(v.payload)).not.toMatch(
        /reference|group|startMs|endMs|offset/,
      );
  });
  it('never consults an oracle to prune or renumbers original IDs', () => {
    const withPoison = {
      ...input,
      get referencePartitions() {
        throw Error('oracle leak');
      },
    };
    expect(coarseCandidates(withPoison)).toEqual(coarseCandidates(input));
    expect(
      coarseCandidates(input).every(
        (b) => !/\]\s*$/u.test(input.text.slice(0, b.offset)),
      ),
    ).toBe(true);
  });
  it('keeps split outputs lossless and rejects unsupported data or orphaned roles', () => {
    for (const arm of ['B', 'C', 'D']) {
      const v = makeCondition(input, arm);
      const good = validateCondition(v, { lineId: input.lineId, breakIds: [] });
      expect(good.parts.join('')).toBe(input.text);
      expect(good.hidden).toBe(false);
      expect(() =>
        validateCondition(v, {
          lineId: input.lineId,
          breakIds: [],
          text: 'rewrite',
        }),
      ).toThrow();
      expect(() =>
        validateCondition(v, { lineId: input.lineId, breakIds: ['unknown'] }),
      ).toThrow();
    }
    const c = makeCondition(input, 'C');
    const afterRole = input.boundaries.find((b) => b.offset === 4);
    if (afterRole)
      expect(() =>
        validateCondition(c, {
          lineId: input.lineId,
          breakIds: [afterRole.id],
        }),
      ).toThrow();
  });
  it('classification cannot emit split, time or hide instructions', () => {
    const e = makeCondition(input, 'E');
    expect(Object.keys(e.payload)).toEqual(['lineId', 'language', 'target']);
    for (const kind of ['lyric', 'ambiguous', 'credit-candidate'])
      expect(
        validateCondition(e, { lineId: input.lineId, kind }).parts,
      ).toEqual([input.text]);
    for (const extra of [{ breakIds: [] }, { hidden: true }, { startMs: 1 }])
      expect(() =>
        validateCondition(e, { lineId: input.lineId, kind: 'lyric', ...extra }),
      ).toThrow();
  });
  it('schedules exactly the bounded crossed cases and counterbalances arm order', () => {
    const cases = ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].flatMap(
      (language, i) =>
        ['l1', 'l2', 'l4', 'c3', 's2', 's3', 's4'].map((f) => ({
          id: `${i}-${f}`,
          language,
        })),
    );
    const inputs = cases.map((c, i) => ({
      caseId: c.id,
      input: { ...input, lineId: String(i) },
    }));
    const plan = buildSchedule(cases, inputs);
    expect(plan.length).toBe(100);
    expect(
      Object.fromEntries(
        ['A', 'B', 'C', 'D', 'E'].map((a) => [
          a,
          plan.filter((p) => p.arm === a).length,
        ]),
      ),
    ).toEqual({ A: 35, B: 15, C: 15, D: 15, E: 20 });
    expect(new Set(plan.map((p) => p.requestId)).size).toBe(100);
  });
});
