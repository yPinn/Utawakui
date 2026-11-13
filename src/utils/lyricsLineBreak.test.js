import { describe, expect, it } from 'vitest';
import {
  lyricsLineBreak,
  splitReadingSegmentsAt,
  splitRomajiAt,
} from './lyricsLineBreak.js';

const breakText = (text, at) =>
  at === null ? [text] : [text.slice(0, at), text.slice(at)];

describe('lyricsLineBreak', () => {
  it('keeps lines that fit within 80% of the column', () => {
    expect(
      lyricsLineBreak('ビクンビクン震えてさ 声もダダ漏れなんだわ', {
        capacity: 30,
      }),
    ).toBeNull();
  });

  it('breaks a merged line at its in-text space', () => {
    const text = 'ねえあたし知ってるよ きみがひとり“涙”してるの知ってるよ';
    expect(breakText(text, lyricsLineBreak(text, { capacity: 30 }))).toEqual([
      'ねえあたし知ってるよ ',
      'きみがひとり“涙”してるの知ってるよ',
    ]);
  });

  it('prefers the punctuation break closest to the middle', () => {
    const text =
      '「もしもーし。ねえ…大丈夫？…んー、心配だから今からそっち行くね」';
    expect(breakText(text, lyricsLineBreak(text, { capacity: 30 }))).toEqual([
      '「もしもーし。ねえ…大丈夫？…んー、',
      '心配だから今からそっち行くね」',
    ]);
  });

  it('never strands a short tail on its own line', () => {
    const text = '正直に言っちゃえばバレてるんだし言っちゃえば聞いてん の？';
    expect(breakText(text, lyricsLineBreak(text, { capacity: 30 }))).toEqual([
      '正直に言っちゃえばバレてるんだし',
      '言っちゃえば聞いてん の？',
    ]);
  });

  it('does not split inside a reading segment', () => {
    const segments = [
      { t: 'あいうえおかきくけこ' },
      { t: '涙。涙', r: 'なみだなみだ' },
      { t: ' さしすせそたちつて' },
    ];
    const text = segments.map((segment) => segment.t).join('');
    expect(lyricsLineBreak(text, { capacity: 20 })).toBe(12);
    expect(lyricsLineBreak(text, { capacity: 20, segments })).toBe(14);
  });

  it('ignores segments that do not match the line text', () => {
    expect(
      lyricsLineBreak('あいうえお かきくけこさしすせそ', {
        capacity: 10,
        segments: [{ t: 'ちがう' }],
      }),
    ).toBeNull();
  });

  it('counts Latin text narrower than CJK', () => {
    const text = 'I know that you are crying alone tonight';
    expect(lyricsLineBreak(text, { capacity: 30 })).toBeNull();
    expect(breakText(text, lyricsLineBreak(text, { capacity: 20 }))).toEqual([
      'I know that you are ',
      'crying alone tonight',
    ]);
  });

  it('breaks mid-phrase at a word turn when phrase halves would overflow', () => {
    const text = '正直に言っちゃえば バレてるんだし言っちゃえば 聞いてんの？';
    expect(breakText(text, lyricsLineBreak(text, { capacity: 18 }))).toEqual([
      '正直に言っちゃえば バレてるんだし',
      '言っちゃえば 聞いてんの？',
    ]);
  });

  it('keeps two lines over a phrase break whose tail would wrap again', () => {
    const text = 'ねえあたし知ってるよ きみがひとり“涙”してるの知ってるよ';
    const [head, tail] = breakText(
      text,
      lyricsLineBreak(text, { capacity: 18 }),
    );
    expect(head.length).toBeGreaterThan(11);
    expect(tail).not.toMatch(/^[っゃゅょー、。]/u);
  });

  it('never breaks a line that fits on one line mid-phrase', () => {
    expect(
      lyricsLineBreak('あいうえおかきくけこさしすせそたちつ', { capacity: 20 }),
    ).toBeNull();
  });

  it('never splits a Latin word to force two lines', () => {
    expect(
      lyricsLineBreak('Supercalifragilisticexpialidocious', { capacity: 10 }),
    ).toBeNull();
  });

  it('uses measured glyph widths and their tighter fit when given', () => {
    const text = 'ねえあたし知ってるよ きみがひとり“涙”してるの知ってるよ';
    // Real 24px Japanese-font widths: narrow space and curly quotes.
    const measure = (char) => ({ ' ': 0.3, '“': 0.375, '”': 0.375 })[char] ?? 1;
    expect(lyricsLineBreak(text, { capacity: 14.17 })).toBe(11);
    expect(
      breakText(text, lyricsLineBreak(text, { capacity: 14.17, measure })),
    ).toEqual(['ねえあたし知ってるよ きみが', 'ひとり“涙”してるの知ってるよ']);
  });

  it('does nothing without a measured capacity', () => {
    expect(lyricsLineBreak('あ い', { capacity: 0 })).toBeNull();
  });
});

describe('splitReadingSegmentsAt', () => {
  it('splits a plain segment between the two lines', () => {
    expect(
      splitReadingSegmentsAt([{ t: '心', r: 'こころ' }, { t: 'だよ ねえ' }], 4),
    ).toEqual([
      [
        { t: '心', r: 'こころ', gapIndex: 0 },
        { t: 'だよ ', gapIndex: 1 },
      ],
      [{ t: 'ねえ', gapIndex: null }],
    ]);
  });

  it('moves a whole reading segment that starts at the offset', () => {
    const [head, tail] = splitReadingSegmentsAt(
      [{ t: 'ねえ ' }, { t: '涙', r: 'なみだ' }],
      3,
    );
    expect(head).toEqual([{ t: 'ねえ ', gapIndex: 0 }]);
    expect(tail).toEqual([{ t: '涙', r: 'なみだ', gapIndex: 1 }]);
  });
});

describe('splitRomajiAt', () => {
  const text = '正直に言っちゃえば バレてるんだし言っちゃえば 聞いてんの？';
  const romaji =
    'shoujiki ni i chae ba   bare teru n da shi i chae ba   kii te n no ?';

  it('cuts Japanese romaji at the wide gap that stands for the lyric space', () => {
    expect(splitRomajiAt(text, romaji, 10)).toEqual([
      'shoujiki ni i chae ba',
      'bare teru n da shi i chae ba   kii te n no ?',
    ]);
  });

  it('follows punctuation, including romanized quotes', () => {
    const quote =
      '「もしもーし。ねえ…大丈夫？…んー、心配だから今からそっち行くね」';
    const reading =
      '‘ moshimo - shi . nee … daijoubu ? … n - , shinpai da kara ima kara sotchi iku ne ’';
    expect(splitRomajiAt(quote, reading, 18)).toEqual([
      '‘ moshimo - shi . nee … daijoubu ? … n - ,',
      'shinpai da kara ima kara sotchi iku ne ’',
    ]);
  });

  it('treats every Korean space as a lyric space', () => {
    expect(
      splitRomajiAt('사랑해 너를 정말로', 'saranghae neoreul jeongmallo', 4, {
        script: 'ko',
      }),
    ).toEqual(['saranghae', 'neoreul jeongmallo']);
  });

  it('refuses romaji whose spaces or punctuation no longer line up', () => {
    expect(splitRomajiAt(text, 'shoujiki ni ichaeba bare teru', 10)).toBeNull();
    expect(splitRomajiAt(text, '', 10)).toBeNull();
  });
});
