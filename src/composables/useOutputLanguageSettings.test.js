import { describe, expect, it, vi } from 'vitest';
import { useOutputLanguageSettings } from './useOutputLanguageSettings.js';

describe('useOutputLanguageSettings', () => {
  it('offers following the UI language or a fixed language', () => {
    const settings = useOutputLanguageSettings({ bridge: {} });
    expect(settings.items).toEqual([
      { value: 'ui', label: '跟隨介面語言' },
      { value: 'zh-TW', label: '繁體中文' },
      { value: 'en-US', label: 'English' },
    ]);
  });

  it('reads and saves through the bridge', async () => {
    const bridge = {
      getOutputLanguage: vi.fn(async () => 'ui'),
      setOutputLanguage: vi.fn(async (value) => value),
    };
    const settings = useOutputLanguageSettings({ bridge });
    await settings.refresh();
    expect(settings.preference.value).toBe('ui');
    expect(await settings.setPreference('en-US')).toBe(true);
    expect(bridge.setOutputLanguage).toHaveBeenCalledWith('en-US');
    expect(settings.preference.value).toBe('en-US');
  });
});
