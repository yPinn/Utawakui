import { expect, it } from 'vitest';
import {
  assertMatched,
  aggregateRows,
  applyContentMask,
} from './hubertComparison.cjs';
const base = () => ({
  inputSha256: 'a',
  referenceSha256: 'b',
  cases: [
    {
      id: 'case-a',
      canonical: {
        lines: [{ lineId: 'l1', text: '春天花開', startMs: 1000, endMs: 4000 }],
      },
      estimate: {
        preview: {
          lines: [
            {
              lineId: 'l1',
              status: 'ready',
              chunks: [
                { from: 0, startMs: 1000 },
                { from: 2, startMs: 2000 },
              ],
            },
          ],
        },
      },
    },
  ],
});
it('requires identical case order, canonical text and coarse clocks with the same input/reference hashes', () => {
  const a = base(),
    b = base();
  expect(() => assertMatched([{ id: 'case-a' }], a, b)).not.toThrow();
  b.cases[0].canonical.lines[0].startMs++;
  expect(() => assertMatched([{ id: 'case-a' }], a, b)).toThrow();
  for (const key of ['inputSha256', 'referenceSha256']) {
    const c = base();
    c[key] = 'changed';
    expect(() => assertMatched([{ id: 'case-a' }], a, c)).toThrow();
  }
  const c = base();
  c.cases[0].id = 'other';
  expect(() => assertMatched([{ id: 'case-a' }], a, c)).toThrow();
});
it('keeps the full scorable denominator and distinguishes missing from unreferenced cuts', () => {
  const r = aggregateRows([{ requested: 4, scorable: 3, errorsMs: [50, 700] }]);
  expect(r).toMatchObject({
    requested: 4,
    scorable: 3,
    measured: 2,
    missing: 1,
    within100: 1,
    over500: 1,
    over1000: 0,
  });
  expect(
    aggregateRows([{ requested: 2, scorable: 0, errorsMs: [] }]).onset100,
  ).toBe(null);
});
it('applies only a matching content mask as a counterfactual without mutating original estimates', () => {
  const original = base().cases,
    bytes = JSON.stringify(original),
    filtered = applyContentMask(original, [
      { id: 'case-a', decisions: [{ reject: true }] },
    ]);
  expect(filtered[0].estimate.preview.lines[0].chunks).toEqual([]);
  expect(JSON.stringify(original)).toBe(bytes);
  expect(() =>
    applyContentMask(original, [
      { id: 'wrong', decisions: [{ reject: true }] },
    ]),
  ).toThrow();
  expect(() =>
    applyContentMask(original, [{ id: 'case-a', decisions: [] }]),
  ).toThrow();
});
