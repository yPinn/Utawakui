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

  it('keeps every English key backed by the zh-TW source catalog', () => {
    const source = new Set(messageKeys(catalogs['zh-TW']));
    expect(
      messageKeys(catalogs['en-US']).filter((key) => !source.has(key)),
    ).toEqual([]);
  });
});
