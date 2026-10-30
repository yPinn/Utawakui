import { describe, it, expect, afterEach, vi } from 'vitest';

async function loadUiLocale(bridges) {
  vi.resetModules();
  for (const [name, bridge] of Object.entries(bridges)) {
    vi.stubGlobal(name, bridge);
  }
  return (await import('./uiLocale.js')).UI_LOCALE;
}

describe('UI_LOCALE', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the supported locale main resolved for this launch', async () => {
    expect(await loadUiLocale({ Utawakui: { initialUiLocale: 'zh-TW' } })).toBe(
      'zh-TW',
    );
    expect(
      await loadUiLocale({ UtawakuiPerformer: { initialUiLocale: 'zh-TW' } }),
    ).toBe('zh-TW');
  });

  it('falls back to zh-TW without a bridge or for an unsupported locale', async () => {
    expect(await loadUiLocale({})).toBe('zh-TW');
    expect(await loadUiLocale({ Utawakui: { initialUiLocale: 'fr-FR' } })).toBe(
      'zh-TW',
    );
  });
});
