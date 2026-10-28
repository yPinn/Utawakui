import { expect, it } from 'vitest';
import {
  editLineTiming,
  validTimingDraft,
  canEditLineTiming,
} from './lyricsLineTiming.js';
import { validateLyricsTimingDocument } from '../../electron/lib/library/lyricsTiming.js';
const doc = () => ({
  schemaVersion: 1,
  documentId: 'doc',
  normalizerProfileId: 'lyrics-source-v3',
  source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
  granularity: 'T2',
  lines: [
    {
      lineId: 'one',
      text: 'la',
      startMs: 1000,
      endMs: 3000,
      endInferred: true,
    },
    {
      lineId: 'two',
      text: 'la',
      startMs: 3000,
      endMs: 6000,
      segments: [
        { segmentId: 's1', text: 'l', startMs: 3000, endMs: 3800 },
        { segmentId: 's2', text: 'a', startMs: 4200, endMs: 5500 },
      ],
    },
    { lineId: 'three', text: '尾', startMs: 5000, endMs: null },
  ],
});
it('moves a line and all known segment times equally, updates its inferred predecessor and preserves overlap/identity', () => {
  const original = doc();
  const result = editLineTiming(original, 'two', 'move', 200);
  expect(result.reason).toBe(null);
  expect(result.document.lines[0]).toMatchObject({
    endMs: 3200,
    endInferred: true,
  });
  expect(result.document.lines[1]).toMatchObject({
    startMs: 3200,
    endMs: 6200,
    segments: [
      { segmentId: 's1', text: 'l', startMs: 3200, endMs: 4000 },
      { segmentId: 's2', text: 'a', startMs: 4400, endMs: 5700 },
    ],
  });
  expect(result.document.lines[2]).toBe(original.lines[2]);
  expect(original.lines[0].endMs).toBe(3000);
  expect(() => validateLyricsTimingDocument(result.document)).not.toThrow();
});
it('authors an inferred end without creating segments or changing its original timestamp', () => {
  const original = doc();
  const result = editLineTiming(original, 'one', 'end', 3000);
  expect(result.document.lines[0]).not.toHaveProperty('endInferred');
  expect(result.document.lines[0]).not.toHaveProperty('segments');
  expect(() => validateLyricsTimingDocument(result.document)).not.toThrow();
});
it('keeps an unknown tail unknown on move and allows an explicit tail without inventing T2', () => {
  const original = doc();
  const moved = editLineTiming(original, 'three', 'move', 100);
  expect(moved.document.lines[2]).toMatchObject({ startMs: 5100, endMs: null });
  const ended = editLineTiming(original, 'three', 'end', 7000);
  expect(ended.document.lines[2].segments).toBeUndefined();
  expect(() => validateLyricsTimingDocument(ended.document)).not.toThrow();
});
it.each([
  ['start', 3100],
  ['end', 5400],
  ['move', 2500],
  ['move', -4000],
  ['end', 3000],
  ['start', NaN],
  ['move', 0.5],
])('refuses %s %s atomically without trimming segments', (kind, value) => {
  const original = doc(),
    before = JSON.stringify(original);
  expect(editLineTiming(original, 'two', kind, value).document).toBe(null);
  expect(JSON.stringify(original)).toBe(before);
});
it('rejects a shortened inferred predecessor when its existing segments would be cut', () => {
  const original = doc();
  original.lines[0].segments = [
    { segmentId: 'previous', text: 'la', startMs: 1000, endMs: 2900 },
  ];
  expect(editLineTiming(original, 'two', 'start', 2800).document).toBe(null);
});
it('allows an earlier start or longer tail while preserving every existing segment', () => {
  const original = doc();
  const value = editLineTiming(original, 'two', 'start', 2800).document;
  expect(value.lines[1].segments).toEqual(original.lines[1].segments);
  expect(value.lines[0].endMs).toBe(2800);
  expect(() => validateLyricsTimingDocument(value)).not.toThrow();
});
it('distinguishes incomplete segment drafts from complete saveable documents, and never edits T0', () => {
  const original = doc();
  original.lines[1].segments[1].startMs = null;
  expect(validTimingDraft(original)).toBe(false);
  expect(validTimingDraft(original, { allowIncomplete: true })).toBe(true);
  expect(canEditLineTiming({ startMs: null, endMs: null })).toBe(false);
  expect(
    editLineTiming(
      { lines: [{ lineId: 't0', startMs: null, endMs: null }] },
      't0',
      'start',
      1000,
    ).document,
  ).toBe(null);
});
