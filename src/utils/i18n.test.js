import { describe, it, expect } from 'vitest';
import { readLocaleCatalogs } from '../../electron/lib/localeCatalogs.js';
import { i18n, t } from './i18n.js';

// Raw JSON from disk: Vite-imported catalogs are compiled message ASTs.
const catalogs = readLocaleCatalogs();

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

  it('keeps the zh-TW and English catalogs on the same keys', () => {
    const source = new Set(messageKeys(catalogs['zh-TW']));
    const english = new Set(messageKeys(catalogs['en-US']));
    expect([...english].filter((key) => !source.has(key))).toEqual([]);
    expect([...source].filter((key) => !english.has(key))).toEqual([]);
  });
});
