import { describe, expect, it, vi } from 'vitest';
import {
  adaptKuromojiToken,
  buildKuromojiTokenizer,
  createKuromojiTokenizer,
} from './kuromoji.js';

describe('adaptKuromojiToken', () => {
  it('maps package-specific fields to the analyzer-neutral token contract', () => {
    expect(
      adaptKuromojiToken({
        surface_form: '東京',
        reading: 'トウキョウ',
        word_type: 'KNOWN',
        pos: '名詞',
        pos_detail_1: '固有名詞',
        pos_detail_2: '地域',
        pos_detail_3: '一般',
        basic_form: '東京',
      }),
    ).toEqual({
      surface: '東京',
      reading: 'トウキョウ',
      partOfSpeech: ['名詞', '固有名詞', '地域', '一般'],
      lemma: '東京',
      outOfVocabulary: false,
    });
  });

  it('keeps unknown tokens source-exact without inventing a reading or lemma', () => {
    expect(
      adaptKuromojiToken({
        surface_form: 'tonight',
        word_type: 'UNKNOWN',
        pos: '名詞',
        pos_detail_1: '固有名詞',
        pos_detail_2: '*',
        pos_detail_3: '*',
        basic_form: '*',
      }),
    ).toEqual({
      surface: 'tonight',
      reading: null,
      partOfSpeech: ['名詞', '固有名詞'],
      lemma: null,
      outOfVocabulary: true,
    });
  });

  it('rejects malformed analyzer output at the adapter boundary', () => {
    expect(() => adaptKuromojiToken(null)).toThrow(/token/i);
    expect(() => adaptKuromojiToken({ surface_form: '' })).toThrow(/surface/i);
    expect(() => adaptKuromojiToken({ surface_form: 1 })).toThrow(/surface/i);
    expect(() =>
      adaptKuromojiToken({ surface_form: '歌', reading: 1 }),
    ).toThrow(/reading/i);
  });
});

describe('createKuromojiTokenizer', () => {
  it('adapts every raw token while preserving order', () => {
    const rawTokenizer = {
      tokenize: vi.fn(() => [
        {
          surface_form: '歌う',
          reading: 'ウタウ',
          word_type: 'KNOWN',
          pos: '動詞',
          pos_detail_1: '自立',
          basic_form: '歌う',
        },
        {
          surface_form: '声',
          reading: 'コエ',
          word_type: 'KNOWN',
          pos: '名詞',
          pos_detail_1: '一般',
          basic_form: '声',
        },
      ]),
    };

    const tokenize = createKuromojiTokenizer(rawTokenizer);

    expect(tokenize('歌う声')).toEqual([
      expect.objectContaining({ surface: '歌う', reading: 'ウタウ' }),
      expect.objectContaining({ surface: '声', reading: 'コエ' }),
    ]);
    expect(rawTokenizer.tokenize).toHaveBeenCalledWith('歌う声');
  });

  it('requires a tokenizer object with a tokenize method', () => {
    expect(() => createKuromojiTokenizer(null)).toThrow(/tokenizer/i);
    expect(() => createKuromojiTokenizer({})).toThrow(/tokenizer/i);
  });
});

describe('buildKuromojiTokenizer', () => {
  it('rejects when the asynchronous builder returns an invalid tokenizer', async () => {
    const kuromoji = {
      builder: vi.fn(() => ({
        build: (callback) => queueMicrotask(() => callback(null, {})),
      })),
    };

    await expect(buildKuromojiTokenizer(kuromoji, 'dict')).rejects.toThrow(
      /tokenizer/i,
    );
  });
});
