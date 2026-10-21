import { describe, expect, it } from 'vitest';
import { resolveAnalysisLanguage, planLineLanguages } from './language.js';

const chinese = '我在夜裡想著你，你的聲音讓我忘了時間，我們還在這裡等著明天。';
const japanese = '君の言葉を忘れない この夜に僕らはいつまでも歩いてゆく';
describe('bounded lyrics analysis language resolution', () => {
  it('routes monolingual occurrences separately and never forces mixed lines through a hint', () => {
    const lines = [
      { lineId: 'ja', text: japanese },
      { lineId: 'en', text: 'Do you enjoy testing?' },
      { lineId: 'mixed', text: 'Bright signal 君の文字' },
      { lineId: 'latin', text: 'bonjour mon amour je suis avec toi' },
      { lineId: 'repeat', text: 'Do you enjoy testing?' },
      { lineId: 't2', text: '原生 mixed', segments: [{}] },
    ];
    expect(planLineLanguages(lines, 'ja')).toEqual({
      version: 1,
      hint: 'ja',
      lines: [
        { lineId: 'ja', language: 'ja' },
        { lineId: 'en', language: 'en' },
        { lineId: 'mixed', language: null },
        { lineId: 'latin', language: null },
        { lineId: 'repeat', language: 'en' },
        { lineId: 't2', language: null },
      ],
    });
    expect(
      planLineLanguages([{ lineId: 'ja', text: japanese }], 'en').lines[0]
        .language,
    ).toBe('ja');
    expect(
      planLineLanguages([{ lineId: 'han', text: '春夏秋冬' }], 'auto').lines[0]
        .language,
    ).toBeNull();
    expect(
      planLineLanguages([{ lineId: 'han', text: '春夏秋冬' }], 'ja').lines[0]
        .language,
    ).toBe('ja');
    expect(
      planLineLanguages([{ lineId: 'short', text: 'hello' }], 'auto').lines[0]
        .language,
    ).toBeNull();
    expect(() => planLineLanguages(lines, 'ko')).toThrow();
  });
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
  it('keeps borrowed words, unsupported scripts, ambiguous digits and mixed text conservative', () => {
    const texts = [
      'love',
      'mistake 蜜の味',
      '君の I will love you forever',
      '우리의 노래',
      'Привет',
      '♪',
      '123',
      'Do you',
      'Are you here today?',
      'I will always stay',
      '今日はまた会えるね',
    ];
    expect(
      planLineLanguages(
        texts.map((text, i) => ({ lineId: String(i), text })),
        'auto',
      ).lines.map((l) => l.language),
    ).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'en',
      'en',
      'ja',
    ]);
    expect(
      planLineLanguages([{ lineId: 'n', text: '10' }], 'en').lines[0].language,
    ).toBe('en');
    expect(
      planLineLanguages([{ lineId: 'zh', text: chinese }], 'ja').lines[0]
        .language,
    ).toBe('zh');
    expect(
      planLineLanguages(
        [{ lineId: 'c', text: "We'll check the clocks and the signs" }],
        'ja',
      ).lines[0].language,
    ).toBe('en');
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
