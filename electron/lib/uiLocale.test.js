import { describe, it, expect, afterEach } from 'vitest';
import {
  UI_LANGUAGE_PREFERENCES,
  getUiLocale,
  matchSupportedLocale,
  resolveUiLocale,
  setUiLocale,
} from './uiLocale.js';

const WITH_ENGLISH = ['zh-TW', 'en-US'];

describe('matchSupportedLocale', () => {
  it.each([
    ['zh-TW', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh_Hant', 'zh-TW'],
    ['en-GB', 'en-US'],
    ['en', 'en-US'],
    ['zh-CN', null],
    ['zh-Hans-TW', null],
    ['ja-JP', null],
    [undefined, null],
  ])('%s → %s', (tag, expected) => {
    expect(matchSupportedLocale(tag, WITH_ENGLISH)).toBe(expected);
  });

  it('never returns a locale outside the supported list', () => {
    expect(matchSupportedLocale('en-US', ['zh-TW'])).toBeNull();
  });
});

describe('resolveUiLocale', () => {
  it('uses an explicit supported preference regardless of the OS', () => {
    expect(resolveUiLocale('en-US', ['zh-TW'], WITH_ENGLISH)).toBe('en-US');
  });

  it('follows the first supported OS language for system', () => {
    expect(
      resolveUiLocale('system', ['ja-JP', 'en-US', 'zh-Hant-TW'], WITH_ENGLISH),
    ).toBe('en-US');
  });

  it('falls back to zh-TW when no OS language is supported', () => {
    expect(resolveUiLocale('system', ['ja-JP', 'ko-KR'], WITH_ENGLISH)).toBe(
      'zh-TW',
    );
    expect(resolveUiLocale('system', null, WITH_ENGLISH)).toBe('zh-TW');
  });

  it('ignores a stored preference the build no longer supports', () => {
    expect(resolveUiLocale('en-US', ['ja-JP'], ['zh-TW'])).toBe('zh-TW');
  });

  it('stays zh-TW on an English OS until English is shipped', () => {
    expect(UI_LANGUAGE_PREFERENCES).toEqual(['system', 'zh-TW']);
    expect(resolveUiLocale('system', ['en-US'])).toBe('zh-TW');
  });
});

describe('setUiLocale', () => {
  afterEach(() => setUiLocale('zh-TW'));

  it('rejects unsupported locales', () => {
    setUiLocale('fr-FR');
    expect(getUiLocale()).toBe('zh-TW');
  });
});
