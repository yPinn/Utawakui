import { describe, expect, it } from 'vitest';
import kuromoji from 'kuromoji';
import wanakana from 'wanakana';
import { buildReadingDoc } from './lyricsReading.js';
import { getKuromojiDicPath } from './kuromojiDictionary.js';

// Exercises the real adapter shape lyricsReadingWorker.js uses (kuromoji token
// fields fed straight into buildReadingDoc, wanakana.toRomaji as
// kanaToRomaji) against the actual IPADIC dictionary — the one test in this
// repo that would catch a kuromoji/wanakana version bump silently changing
// token field names or dictionary content. No network dependency (the
// dictionary ships with the npm package), so this isn't flaky, just slow —
// dictionary loading takes a couple of seconds.
function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: getKuromojiDicPath() })
      .build((err, tokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
  });
}

describe('kuromoji + wanakana integration', () => {
  it('produces correct furigana segments and romaji for real Japanese lines', async () => {
    const tokenizer = await buildTokenizer();
    const doc = buildReadingDoc(
      ['歌う声', 'こんにちは', '今日はいい天気です', '読み込む'],
      {
        tokenize: (text) => tokenizer.tokenize(text),
        kanaToRomaji: (kana) => wanakana.toRomaji(kana),
      },
    );

    expect(doc.lines[0]).toEqual({
      text: '歌う声',
      segments: [{ t: '歌', r: 'うた' }, { t: 'う' }, { t: '声', r: 'こえ' }],
      romaji: 'utau koe',
      edited: false,
    });

    // No kanji at all — buildReadingDoc skips tokenizing entirely (see
    // reading.test.js), so this line gets no romaji either.
    expect(doc.lines[1]).toEqual({
      text: 'こんにちは',
      segments: [{ t: 'こんにちは' }],
      romaji: '',
      edited: false,
    });

    expect(doc.lines[2]).toEqual({
      text: '今日はいい天気です',
      segments: [
        { t: '今日', r: 'きょう' },
        { t: 'は' },
        { t: 'いい' },
        { t: '天気', r: 'てんき' },
        { t: 'です' },
      ],
      romaji: 'kyou ha ii tenki desu',
      edited: false,
    });

    // Interior okurigana (kana between two kanji runs) — real-dictionary
    // confirmation of the same case reading.test.js already covers with
    // an injected fake tokenizer.
    expect(doc.lines[3]).toEqual({
      text: '読み込む',
      segments: [
        { t: '読', r: 'よ' },
        { t: 'み' },
        { t: '込', r: 'こ' },
        { t: 'む' },
      ],
      romaji: 'yomikomu',
      edited: false,
    });
  }, 20000);

  it('normalizes a full-width space between two kanji compounds to a regular space', async () => {
    const tokenizer = await buildTokenizer();
    // Two generic 2-kanji nouns joined by a U+3000 ideographic space —
    // some lyrics sources use this as a visual word separator. Rendered
    // literally it reads as a whole extra character's worth of gap;
    // buildReadingDoc collapses it to a regular space for annotation
    // purposes while `text` keeps the original full-width space.
    const doc = buildReadingDoc(['会議　資料'], {
      tokenize: (text) => tokenizer.tokenize(text),
      kanaToRomaji: (kana) => wanakana.toRomaji(kana),
    });

    expect(doc.lines[0].text).toBe('会議　資料');
    expect(doc.lines[0].segments).toEqual([
      { t: '会議', r: 'かいぎ' },
      { t: ' ' },
      { t: '資料', r: 'しりょう' },
    ]);
  }, 20000);

  it('inserts the same deliberate gap between two adjacent kanji tokens even when the source has no separator at all', async () => {
    const tokenizer = await buildTokenizer();
    // Same two nouns as above, back-to-back with zero whitespace in the
    // source — kuromoji still splits them into two tokens (no natural kana
    // buffer between them), so this should converge on the identical
    // segment shape the literal-full-width-space case produces above.
    const doc = buildReadingDoc(['会議資料'], {
      tokenize: (text) => tokenizer.tokenize(text),
      kanaToRomaji: (kana) => wanakana.toRomaji(kana),
    });

    expect(doc.lines[0].text).toBe('会議資料');
    expect(doc.lines[0].segments).toEqual([
      { t: '会議', r: 'かいぎ' },
      { t: ' ' },
      { t: '資料', r: 'しりょう' },
    ]);
  }, 20000);
});
