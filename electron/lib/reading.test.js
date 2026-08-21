import { describe, expect, it, vi } from 'vitest';
import {
  alignOkurigana,
  buildReadingDoc,
  katakanaToHiragana,
} from './reading.js';

describe('katakanaToHiragana', () => {
  it('shifts katakana to hiragana and leaves everything else untouched', () => {
    expect(katakanaToHiragana('ウタウ')).toBe('うたう');
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー');
    expect(katakanaToHiragana('123abc漢字')).toBe('123abc漢字');
    expect(katakanaToHiragana('')).toBe('');
    expect(katakanaToHiragana(null)).toBe('');
  });
});

describe('alignOkurigana', () => {
  it('gives a pure-kanji word (jukujikun) its whole reading, unsplit', () => {
    expect(alignOkurigana('今日', 'キョウ')).toEqual([
      { t: '今日', r: 'きょう' },
    ]);
  });

  it('splits trailing okurigana off a kanji+kana verb', () => {
    expect(alignOkurigana('歌う', 'ウタウ')).toEqual([
      { t: '歌', r: 'うた' },
      { t: 'う' },
    ]);
  });

  it('resolves interior kana between two kanji runs', () => {
    expect(alignOkurigana('読み込む', 'ヨミコム')).toEqual([
      { t: '読', r: 'よ' },
      { t: 'み' },
      { t: '込', r: 'こ' },
      { t: 'む' },
    ]);
  });

  it('splits leading okurigana (prefix kana) correctly', () => {
    expect(alignOkurigana('お茶', 'オチャ')).toEqual([
      { t: 'お' },
      { t: '茶', r: 'ちゃ' },
    ]);
  });

  it('returns one plain segment for an all-kana word — no ruby needed', () => {
    expect(alignOkurigana('です', 'デス')).toEqual([{ t: 'です' }]);
  });

  it('returns one plain segment for a katakana loanword with no kanji', () => {
    expect(alignOkurigana('コーヒー', 'コーヒー')).toEqual([{ t: 'コーヒー' }]);
  });

  it('returns one plain segment when there is no reading at all', () => {
    expect(alignOkurigana('123', '')).toEqual([{ t: '123' }]);
    expect(alignOkurigana('123', undefined)).toEqual([{ t: '123' }]);
  });

  it('returns an empty array for empty surface text', () => {
    expect(alignOkurigana('', 'キョウ')).toEqual([]);
  });

  it('falls back to one atomic segment when a kana run cannot be found in the reading', () => {
    // "り" never appears in "そら" — an intentionally mismatched pairing,
    // simulating an irregular reading this heuristic can't decompose.
    expect(alignOkurigana('偽り', 'ソラ')).toEqual([{ t: '偽り', r: 'そら' }]);
  });

  it('falls back when a kanji run would end up with zero reading characters', () => {
    // Contrived on purpose: "あ" and "い" both match adjacently in "あい"
    // with nothing left over for "猫" in between — must not silently emit
    // a kanji segment with no reading at all.
    expect(alignOkurigana('あ猫い', 'アイ')).toEqual([
      { t: 'あ猫い', r: 'あい' },
    ]);
  });
});

describe('buildReadingDoc', () => {
  function fakeTokenize(text) {
    // One token per character, reading = the character itself uppercased
    // is meaningless for kanji, so tests supply per-call mocks instead —
    // this default is only used by tests that don't care about content.
    return [{ surface_form: text, reading: text }];
  }

  it('requires a tokenize function', () => {
    expect(() => buildReadingDoc(['a'], {})).toThrow(
      'buildReadingDoc requires a tokenize function',
    );
  });

  it('skips tokenizing lines with no kanji at all', () => {
    const tokenize = vi.fn(fakeTokenize);
    const doc = buildReadingDoc(['です', ''], { tokenize });

    expect(tokenize).not.toHaveBeenCalled();
    expect(doc.lines).toEqual([
      { text: 'です', segments: [{ t: 'です' }], romaji: '', edited: false },
      { text: '', segments: [], romaji: '', edited: false },
    ]);
  });

  it('tokenizes lines containing kanji and aligns each token', () => {
    const tokenize = vi.fn((text) => {
      if (text === '歌う声') {
        return [
          { surface_form: '歌う', reading: 'ウタウ' },
          { surface_form: '声', reading: 'コエ' },
        ];
      }
      return [];
    });

    const doc = buildReadingDoc(['歌う声'], { tokenize });

    expect(tokenize).toHaveBeenCalledWith('歌う声');
    expect(doc.lines[0].segments).toEqual([
      { t: '歌', r: 'うた' },
      { t: 'う' },
      { t: '声', r: 'こえ' },
    ]);
  });

  it('computes romaji once per line via the injected kanaToRomaji', () => {
    const tokenize = () => [{ surface_form: '歌う', reading: 'ウタウ' }];
    const kanaToRomaji = vi.fn().mockReturnValue('utau');

    const doc = buildReadingDoc(['歌う'], { tokenize, kanaToRomaji });

    expect(kanaToRomaji).toHaveBeenCalledWith('ウタウ');
    expect(doc.lines[0].romaji).toBe('utau');
  });

  it('leaves romaji empty when kanaToRomaji is not supplied', () => {
    const tokenize = () => [{ surface_form: '歌う', reading: 'ウタウ' }];
    const doc = buildReadingDoc(['歌う'], { tokenize });
    expect(doc.lines[0].romaji).toBe('');
  });

  it('reports per-line progress with index/total', () => {
    const onProgress = vi.fn();
    buildReadingDoc(['です', 'ます'], { tokenize: fakeTokenize, onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      stage: 'line',
      index: 0,
      total: 2,
    });
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'line',
      index: 1,
      total: 2,
    });
  });

  it('marks every generated line as not edited, and carries the analyzer through', () => {
    const doc = buildReadingDoc(['です'], {
      tokenize: fakeTokenize,
      analyzer: { id: 'fake-ja', version: '0' },
    });
    expect(doc.analyzer).toEqual({ id: 'fake-ja', version: '0' });
    expect(doc.lines[0].edited).toBe(false);
  });

  it('treats a non-array lines argument as empty', () => {
    const doc = buildReadingDoc(null, { tokenize: fakeTokenize });
    expect(doc.lines).toEqual([]);
  });

  describe('deliberate word-boundary spacing', () => {
    it('inserts a gap between two adjacent tokens that both touch kanji with no kana between them', () => {
      const tokenize = () => [
        { surface_form: '会議', reading: 'カイギ' },
        { surface_form: '資料', reading: 'シリョウ' },
      ];
      const doc = buildReadingDoc(['会議資料'], { tokenize });

      expect(doc.lines[0].segments).toEqual([
        { t: '会議', r: 'かいぎ' },
        { t: ' ' },
        { t: '資料', r: 'しりょう' },
      ]);
    });

    it('does not insert a gap when a kana character already separates the tokens', () => {
      const tokenize = () => [
        { surface_form: '歌う', reading: 'ウタウ' },
        { surface_form: '声', reading: 'コエ' },
      ];
      const doc = buildReadingDoc(['歌う声'], { tokenize });

      // 歌う ends in the kana う, not kanji — no synthetic gap needed on
      // top of the natural okurigana split alignOkurigana already gives.
      expect(doc.lines[0].segments).toEqual([
        { t: '歌', r: 'うた' },
        { t: 'う' },
        { t: '声', r: 'こえ' },
      ]);
    });

    it('does not double up when the source already had a literal space token there', () => {
      const tokenize = () => [
        { surface_form: '会議', reading: 'カイギ' },
        { surface_form: ' ' },
        { surface_form: '資料', reading: 'シリョウ' },
      ];
      const doc = buildReadingDoc(['会議 資料'], { tokenize });

      expect(doc.lines[0].segments).toEqual([
        { t: '会議', r: 'かいぎ' },
        { t: ' ' },
        { t: '資料', r: 'しりょう' },
      ]);
    });

    it('inserts a gap at every qualifying boundary across more than two tokens', () => {
      const tokenize = () => [
        { surface_form: '何', reading: 'ナン' },
        { surface_form: '十', reading: 'ジュウ' },
        { surface_form: '回', reading: 'カイ' },
      ];
      const doc = buildReadingDoc(['何十回'], { tokenize });

      expect(doc.lines[0].segments).toEqual([
        { t: '何', r: 'なん' },
        { t: ' ' },
        { t: '十', r: 'じゅう' },
        { t: ' ' },
        { t: '回', r: 'かい' },
      ]);
    });
  });
});
