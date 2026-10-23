import { describe, expect, it } from 'vitest';
import {
  analyzeLyricsText,
  preprocessLyricsDocument,
  projectLyricsTextSelection,
  isSafeLyricsBreak,
} from './lyricsTextProcessing.mjs';

describe('lossless shared text annotations', () => {
  it.each([
    '作詞：測試',
    '作词：测试',
    'Lyrics by: Test',
    '作詞：テスト',
    '작사: 테스트',
  ])('marks a credit candidate without changing or hiding %s', (text) => {
    const result = analyzeLyricsText(text);
    expect(result.kind).toBe('credit-candidate');
    expect(result.sourceText).toBe(text);
    expect(result.sourceStart).toBe(0);
    expect(result.sourceEnd).toBe(text.length);
  });
  it.each([
    '[女] 作詞：這也是我唱的',
    '【合唱】我們一起',
    '和聲：一起唱',
    'Vocal: sing with me',
    '(oh oh)',
    '「作詞：也是歌詞」',
    'Lyrics are all I sing',
    '작사처럼 노래해',
  ])('retains vocal, quoted and ambiguous text: %s', (text) => {
    expect(analyzeLyricsText(text).kind).toBe('lyric');
  });
  it.each([
    '【今晚，明天】',
    '「今晚，明天」',
    '“Tonight, tomorrow”',
    '"Tonight, tomorrow"',
    '『明日、明後日』',
    '（오늘, 내일）',
  ])('tracks paired text ranges: %s', (text) => {
    const result = analyzeLyricsText(text);
    expect(result.pairedRanges).toContainEqual({
      sourceStart: 0,
      sourceEnd: text.length,
    });
    expect(result.malformedPairs).toBe(false);
  });
  it('does not mistake apostrophes for unpaired quotation marks', () => {
    expect(analyzeLyricsText("don't stop, we're here").malformedPairs).toBe(
      false,
    );
    expect(analyzeLyricsText('【未完').malformedPairs).toBe(true);
    expect(isSafeLyricsBreak('今晚，明天', 2)).toBe(false);
    expect(isSafeLyricsBreak('今晚「明天」', 3)).toBe(false);
    expect(isSafeLyricsBreak('"Tonight" tomorrow', 8)).toBe(false);
    expect(isSafeLyricsBreak('"Tonight" tomorrow', 9)).toBe(true);
    expect(isSafeLyricsBreak('Tonight "tomorrow"', 8)).toBe(true);
    expect(isSafeLyricsBreak('Tonight "tomorrow"', 9)).toBe(false);
  });
  it('requires explicit eligible line ids, preserves intervals and reading, and restores the original object', () => {
    const doc = {
      documentId: 'song',
      source: { sha256: 'a'.repeat(64) },
      lines: [
        { lineId: 'a', text: '作詞：測試', startMs: 0, endMs: 1000 },
        {
          lineId: 'b',
          text: '[女]一起唱（和聲）',
          startMs: 1000,
          endMs: 3000,
          segments: [
            { text: '[女]一起唱（和聲）', startMs: 1000, endMs: 2500 },
          ],
        },
      ],
      reading: { lines: [{ lineId: 'a' }, { lineId: 'b' }] },
    };
    const original = structuredClone(doc);
    expect(
      preprocessLyricsDocument(doc).creditCandidates.map((l) => l.lineId),
    ).toEqual(['a']);
    expect(projectLyricsTextSelection(doc, ['b'])).toBe(doc);
    const projected = projectLyricsTextSelection(doc, ['a']);
    expect(projected.lines).toEqual([doc.lines[1]]);
    expect(projected.reading.lines).toEqual([{ lineId: 'b' }]);
    expect(projected.documentId).not.toBe(doc.documentId);
    expect(projectLyricsTextSelection(doc, [])).toBe(doc);
    expect(doc).toEqual(original);
  });
  it('recomputes the visible tier when the only T2 line is explicitly hidden', () => {
    const doc = {
      documentId: 'tier',
      granularity: 'T2',
      lines: [
        {
          lineId: 'c',
          text: '作詞：測試',
          startMs: 0,
          segments: [{ text: '作詞：測試' }],
        },
        { lineId: 'v', text: '一起唱', startMs: 1000, endMs: 3000 },
      ],
    };
    expect(projectLyricsTextSelection(doc, ['c']).granularity).toBe('T1');
    expect(
      projectLyricsTextSelection({ ...doc, lines: [doc.lines[0]] }, ['c'])
        .granularity,
    ).toBe('T0');
  });
});
