import { describe, expect, it } from 'vitest';
import { resolveAnalysisLanguage } from './language.js';

const chinese = '我在夜裡想著你，你的聲音讓我忘了時間，我們還在這裡等著明天。';
const japanese = '君の言葉を忘れない この夜に僕らはいつまでも歩いてゆく';
describe('bounded lyrics analysis language resolution', () => {
  it('supports explicit English and conservative English body evidence without treating all Latin as English', () => {
    expect(resolveAnalysisLanguage('en-US', '')).toEqual({
      language: 'en',
      origin: 'metadata',
    });
    expect(
      resolveAnalysisLanguage(
        'und',
        'I will always love you and I will never let you go',
      ),
    ).toEqual({ language: 'en', origin: 'content' });
    expect(
      resolveAnalysisLanguage('und', 'bonjour mon amour je suis avec toi')
        .language,
    ).toBeUndefined();
    expect(
      resolveAnalysisLanguage(
        'und',
        'I will always love you and I will never let you go Привет',
      ).language,
    ).toBeUndefined();
    expect(
      resolveAnalysisLanguage('und', '君の I will love you forever').language,
    ).toBeUndefined();
    expect(resolveAnalysisLanguage('und', 'hello', 'en')).toEqual({
      language: 'en',
      origin: 'manual',
    });
  });

  it('uses body evidence for unknown sources without song-title guesses', () => {
    expect(resolveAnalysisLanguage('und', chinese)).toEqual({
      language: 'zh',
      origin: 'content',
    });
    expect(resolveAnalysisLanguage('und', japanese)).toEqual({
      language: 'ja',
      origin: 'content',
    });
    expect(resolveAnalysisLanguage('ZH_Hant', '')).toEqual({
      language: 'zh',
      origin: 'metadata',
    });
    expect(resolveAnalysisLanguage('ja-JP', '')).toEqual({
      language: 'ja',
      origin: 'metadata',
    });
  });
  it.each([
    '春夏秋冬 山川草木 天地日月 星辰花鳥',
    '君',
    'hello my love',
    '우리의 노래를 기억해 주세요',
    '♪',
    'の love',
  ])(
    'does not guess from insufficient/ambiguous/unsupported content: %s',
    (text) => {
      expect(resolveAnalysisLanguage('und', text).language).toBeUndefined();
    },
  );
  it('never silently overrides a declared unsupported language, but permits explicit manual choice', () => {
    expect(resolveAnalysisLanguage('ko', chinese)).toEqual({
      reason: 'language-unsupported',
    });
    expect(resolveAnalysisLanguage('und', '春夏秋冬', 'ja')).toEqual({
      language: 'ja',
      origin: 'manual',
    });
    expect(resolveAnalysisLanguage('en', japanese, 'ja')).toEqual({
      language: 'ja',
      origin: 'manual',
    });
    expect(() =>
      resolveAnalysisLanguage('und', chinese, 'C:/private'),
    ).toThrow();
  });
});
