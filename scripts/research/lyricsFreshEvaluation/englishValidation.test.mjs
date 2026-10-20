import { expect, it } from 'vitest';
import { assessCompleteness } from './completeness.cjs';
const line = { text: 'I will always love you', startMs: 1000, endMs: 6000 };
const evidence = (text, start = 2, boundary = true) => ({
  language: 'en',
  windowStartMs: 0,
  offsetMs: 0,
  durationMs: 10000,
  spans: [{ text, start, boundary }],
});
it('compares English words and contractions while preserving original text', () => {
  const source = { ...line, text: 'I don’t want to leave you' };
  const e = evidence('I do not want to leave you');
  const before = JSON.stringify({ source, e });
  expect(assessCompleteness(source, e)).toMatchObject({
    reject: false,
    evidenceState: 'supported',
    insertionWarning: false,
  });
  expect(JSON.stringify({ source, e })).toBe(before);
});
it('separates unsupported evidence from strong wrong-phrase evidence', () => {
  expect(assessCompleteness(line, evidence(''))).toMatchObject({
    reject: false,
    evidenceState: 'insufficient',
  });
  expect(
    assessCompleteness(line, evidence('The morning train arrives at noon')),
  ).toMatchObject({ reject: true, evidenceState: 'contradiction' });
  expect(
    assessCompleteness(
      line,
      evidence('The morning train arrives at noon', 2, false),
    ),
  ).toMatchObject({ reject: false, evidenceState: 'insufficient' });
});
it('warns about uniquely anchored omitted words without rejecting the normal remainder', () => {
  expect(
    assessCompleteness(line, evidence('I will always truly love you')),
  ).toMatchObject({ reject: false, insertionWarning: true });
  expect(
    assessCompleteness(
      { ...line, text: 'I love you I love you' },
      evidence('I love you I love you I love you'),
    ).insertionWarning,
  ).toBe(false);
});
it('does not call untimed matching text supported just because unrelated words have clocks', () => {
  const e = evidence('different words');
  e.spans.push({ text: ' I will always love you', start: 2, boundary: false });
  expect(assessCompleteness(line, e).evidenceState).toBe('insufficient');
});

it('cannot borrow a repeated chorus outside the current occurrence', () => {
  expect(assessCompleteness(line, evidence(line.text, 8))).toMatchObject({
    reject: false,
    evidenceState: 'insufficient',
  });
});

it('uses unique local word anchors for omission warnings despite an unrelated ASR spelling error', () => {
  const l = { ...line, text: "It's no I don't need nothing in return babe" };
  expect(
    assessCompleteness(
      l,
      evidence("It's no concern I don't need nothin in return babe"),
    ),
  ).toMatchObject({ reject: false, insertionWarning: true });
});
