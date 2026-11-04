import { describe, expect, it, vi } from 'vitest';
import {
  uiLanguageName,
  useUiLanguageSettings,
} from './useUiLanguageSettings.js';

function setup({ saved = 'system', target = 'zh-TW', confirmed = true } = {}) {
  const state = { saved, target };
  const bridge = {
    getUiLanguage: vi.fn(async () => state.saved),
    setUiLanguage: vi.fn(async (value) => {
      state.saved = value;
      state.target = value === 'system' ? 'zh-TW' : value;
      return value;
    }),
    getUiLanguageTarget: vi.fn(async () => state.target),
    relaunchApp: vi.fn(async () => true),
  };
  const confirm = vi.fn(async () => confirmed);
  const settings = useUiLanguageSettings({
    bridge,
    currentLocale: 'zh-TW',
    confirmation: { confirm },
  });
  return { bridge, confirm, settings };
}

describe('useUiLanguageSettings', () => {
  it('lists system plus each language under its own name', () => {
    const { settings } = setup();
    expect(settings.items.map((item) => item.value)).toEqual([
      'system',
      'zh-TW',
      'en-US',
    ]);
    expect(uiLanguageName('en-US')).toBe('English');
    expect(uiLanguageName('zh-TW')).toBe('繁體中文');
  });

  it('offers a restart when the next launch would use another language', async () => {
    const { bridge, confirm, settings } = setup();
    await settings.refresh();
    expect(settings.pendingMessage.value).toBe('');

    await settings.setPreference('en-US');

    expect(bridge.setUiLanguage).toHaveBeenCalledWith('en-US');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '重新啟動後，介面會改用「English」。',
        confirmLabel: '立即重新啟動',
        cancelLabel: '稍後',
      }),
    );
    expect(bridge.relaunchApp).toHaveBeenCalledOnce();
  });

  it('keeps a pending hint after choosing later and skips the dialog when nothing changes', async () => {
    const { bridge, confirm, settings } = setup({ confirmed: false });
    await settings.setPreference('en-US');
    expect(bridge.relaunchApp).not.toHaveBeenCalled();
    expect(settings.pendingMessage.value).toBe('重新啟動後會改用「English」。');

    confirm.mockClear();
    await settings.setPreference('zh-TW');
    expect(confirm).not.toHaveBeenCalled();
    expect(settings.pendingMessage.value).toBe('');
  });

  it('reports a failed relaunch so the user can restart by hand', async () => {
    const { bridge, settings } = setup({ target: 'en-US' });
    bridge.relaunchApp.mockRejectedValueOnce(new Error('denied'));
    await settings.refresh();
    await settings.relaunch();
    expect(settings.relaunchError.value).toBe(
      '無法重新啟動，請手動關閉後再開啟 Utawakui。',
    );
    expect(settings.relaunching.value).toBe(false);
  });
});
