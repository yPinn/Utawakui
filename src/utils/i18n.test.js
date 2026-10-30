import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { i18n, t } from './i18n.js';

// Raw JSON: the Vite plugin turns catalog imports into compiled message ASTs.
const readCatalog = (locale) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../../shared/locales/${locale}.json`, import.meta.url),
      'utf8',
    ),
  );

function messageKeys(messages, prefix = '') {
  return Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? messageKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('i18n', () => {
  it('translates with the launch locale', () => {
    expect(i18n.global.locale.value).toBe('zh-TW');
    expect(t('destination.library')).toBe('曲庫');
  });

  it('compiles the English catalog', () => {
    expect(t('destination.library', {}, { locale: 'en-US' })).toBe('Library');
  });

  it('keeps every English key backed by the zh-TW source catalog', () => {
    const source = new Set(messageKeys(readCatalog('zh-TW')));
    expect(
      messageKeys(readCatalog('en-US')).filter((key) => !source.has(key)),
    ).toEqual([]);
  });
});
