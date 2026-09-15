import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import {
  EXTERNAL_TARGETS,
  registerExternalNavigationHandlers,
} from './externalNavigationHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  const dependencies = {
    ipcMain,
    openExternal,
    recordDiagnostic,
    ...overrides,
  };
  registerExternalNavigationHandlers(dependencies);
  return { ...dependencies, ipcMain };
}

describe('registerExternalNavigationHandlers', () => {
  it('registers only the bounded external-target intent', () => {
    const { ipcMain } = register();

    expect([...ipcMain.handlers.keys()]).toEqual(['shell:open-external']);
    expect(Object.keys(EXTERNAL_TARGETS).sort()).toEqual([
      'community-discord',
      'release-notes',
      'vb-cable',
      'voicemeeter',
    ]);
  });

  it.each([
    ['vb-cable', 'https://vb-audio.com/Cable/'],
    ['voicemeeter', 'https://vb-audio.com/Voicemeeter/'],
    ['release-notes', 'https://github.com/yPinn/Utawakui-Releases/releases'],
    ['community-discord', 'https://discord.gg/yJKddEtpNt'],
  ])('derives the %s vendor URL in main', async (targetId, expectedUrl) => {
    const { ipcMain, openExternal } = register();

    await expect(
      ipcMain.handlers.get('shell:open-external')(null, targetId),
    ).resolves.toBeUndefined();
    expect(openExternal).toHaveBeenCalledWith(expectedUrl);
  });

  it.each([
    '../private-target',
    'https://example.test/phishing',
    null,
    { id: 'vb-cable' },
  ])('rejects unknown target intent without reflection', async (targetId) => {
    const { ipcMain, openExternal, recordDiagnostic } = register();

    const thrown = await ipcMain.handlers
      .get('shell:open-external')(null, targetId)
      .catch((error) => error);

    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('EXTERNAL_TARGET_UNKNOWN');
    expect(thrown.message).not.toContain('private-target');
    expect(thrown.message).not.toContain('example.test');
    expect(openExternal).not.toHaveBeenCalled();
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('records private shell failure and returns one bounded public error', async () => {
    const privateError = new Error('failed to open private browser profile');
    const openExternal = vi.fn().mockRejectedValue(privateError);
    const { ipcMain, recordDiagnostic } = register({ openExternal });

    const thrown = await ipcMain.handlers
      .get('shell:open-external')(null, 'vb-cable')
      .catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'external-navigation',
        operation: 'open',
        code: 'EXTERNAL_TARGET_OPEN_FAILED',
        error: privateError,
        context: { targetId: 'vb-cable' },
      }),
    );
    expect(thrown.message).toContain('EXTERNAL_TARGET_OPEN_FAILED');
    expect(thrown.message).not.toContain('private browser');
  });
});
