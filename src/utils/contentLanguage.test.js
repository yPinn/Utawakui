import { describe, expect, it } from 'vitest';
import {
  contentLangAttribute,
  detectContentLanguage,
  trackContentLang,
} from './contentLanguage.js';

describe('detectContentLanguage', () => {
  it.each([
    ['还没想好', 'zh-Hans'],
    ['21世纪病理反应', 'zh-Hans'],
    ['面对面的婚礼和并排的墓碑', 'zh-Hans'],
    ['后来', 'zh-Hans'],
    ['愛情的大壞蛋', 'zh-Hant'],
    ['幾分之幾', 'zh-Hant'],
    ['後來', 'zh-Hant'],
    ['王以太', 'zh-Hant'],
  ])('separates simplified and traditional Chinese: %s', (text, language) => {
    expect(detectContentLanguage(text)).toBe(language);
  });

  it.each([
    ['嘘つき', 'ja'],
    ['晴るる', 'ja'],
    ['千本桜', 'ja'],
    ['黒歴史', 'ja'],
    ['天体観測', 'ja'],
    ['図書館', 'ja'],
    ['사랑의 노래', 'ko'],
  ])('recognises Japanese and Korean: %s', (text, language) => {
    expect(detectContentLanguage(text)).toBe(language);
  });

  it('does not count shinjitai shared with simplified forms as Chinese', () => {
    expect(detectContentLanguage('国境')).toBe('zh-Hant');
    expect(detectContentLanguage('会社')).toBe('zh-Hant');
  });

  it('treats the katakana middle dot as punctuation, not kana', () => {
    expect(detectContentLanguage('2024 夏・台北')).toBe('zh-Hant');
    expect(detectContentLanguage('周杰倫・五月天')).toBe('zh-Hant');
    expect(detectContentLanguage('ヨルシカ・n-buna')).toBe('ja');
  });

  it('judges related fields together', () => {
    expect(detectContentLanguage('紅蓮華')).toBe('zh-Hant');
    expect(detectContentLanguage('紅蓮華', 'LiSA', 'ストロングワールド')).toBe(
      'ja',
    );
  });

  it('returns null for text without CJK script', () => {
    expect(detectContentLanguage('Feel Alive')).toBeNull();
    expect(detectContentLanguage('', null, undefined)).toBeNull();
  });
});

describe('contentLangAttribute', () => {
  it('omits the document default and non-CJK text', () => {
    expect(contentLangAttribute('幾分之幾')).toBeUndefined();
    expect(contentLangAttribute('OMG')).toBeUndefined();
    expect(contentLangAttribute('还没想好')).toBe('zh-Hans');
  });

  it('reads title, artist and album from a track', () => {
    expect(
      trackContentLang({ title: '夏霞', artist: 'Atarayo', album: '' }),
    ).toBeUndefined();
    expect(
      trackContentLang({
        title: '人间天堂',
        artist: '王以太',
        album: '演.说.家',
      }),
    ).toBe('zh-Hans');
  });
});
