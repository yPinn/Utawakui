import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import {
  CAPTURE_DEVICE_ID_MAX_LENGTH,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from '../lib/config.js';
import { registerConfigHandlers } from './configHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  let config = {
    downloadDir: null,
    uiTheme: 'dark',
    sidebarWidth: 256,
    captureDeviceId: null,
    autoAnalyzeMusicStructure: true,
    autoCheckAppUpdates: true,
  };
  const getConfig = vi.fn(() => config);
  const updateConfig = vi.fn((patch) => {
    config = { ...config, ...patch };
    return config;
  });
  const resolveDownloadDir = vi.fn(
    (value) => value.downloadDir || 'C:\\Users\\Singer\\Music\\Utawakui',
  );
  const dialog = {
    showOpenDialog: vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['D:\\Music\\Utawakui'],
    }),
  };
  const openPath = vi.fn().mockResolvedValue('');
  const mainWindow = {
    setTitleBarOverlay: vi.fn(),
    setBackgroundColor: vi.fn(),
  };
  const getMainWindow = vi.fn(() => mainWindow);
  const notifyLibraryUpdated = vi.fn();
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  const applyAppUpdateAutoCheck = vi.fn();
  const titlebarColors = {
    dark: { color: '#101010', symbolColor: '#ffffff' },
    light: { color: '#ffffff', symbolColor: '#101010' },
  };
  const dependencies = {
    ipcMain,
    dialog,
    openPath,
    getConfig,
    updateConfig,
    resolveDownloadDir,
    getMainWindow,
    notifyLibraryUpdated,
    recordDiagnostic,
    applyAppUpdateAutoCheck,
    titlebarColors,
    ...overrides,
  };
  registerConfigHandlers(dependencies);
  return { ...dependencies, ipcMain, mainWindow };
}

describe('registerConfigHandlers', () => {
  it('registers only machine-config and download-directory intents', () => {
    const { ipcMain } = register();

    expect([...ipcMain.handlers.keys()]).toEqual([
      'config:get',
      'config:choose-download-dir',
      'config:reset-download-dir',
      'config:open-download-dir',
      'config:get-ui-theme',
      'config:set-ui-theme',
      'config:get-sidebar-width',
      'config:set-sidebar-width',
      'config:get-capture-device',
      'config:set-capture-device',
      'config:get-auto-music-analysis',
      'config:set-auto-music-analysis',
      'config:get-app-update-auto-check',
      'config:set-app-update-auto-check',
    ]);
  });

  it('projects the resolved default and custom download directories', async () => {
    const { ipcMain, getConfig, resolveDownloadDir } = register();
    const get = ipcMain.handlers.get('config:get');

    await expect(get()).resolves.toEqual({
      downloadDir: 'C:\\Users\\Singer\\Music\\Utawakui',
      isDefault: true,
    });
    getConfig.mockReturnValue({ downloadDir: 'D:\\Music' });
    resolveDownloadDir.mockReturnValue('D:\\Music');
    await expect(get()).resolves.toEqual({
      downloadDir: 'D:\\Music',
      isDefault: false,
    });
  });

  it.each([
    { canceled: true, filePaths: ['D:\\Ignored'] },
    { canceled: false, filePaths: [] },
  ])(
    'keeps the current directory when selection is cancelled',
    async (result) => {
      const { ipcMain, dialog, updateConfig, notifyLibraryUpdated } =
        register();
      dialog.showOpenDialog.mockResolvedValue(result);

      await expect(
        ipcMain.handlers.get('config:choose-download-dir')(),
      ).resolves.toBe('C:\\Users\\Singer\\Music\\Utawakui');
      expect(updateConfig).not.toHaveBeenCalled();
      expect(notifyLibraryUpdated).not.toHaveBeenCalled();
    },
  );

  it('persists a selected directory and invalidates library truth', async () => {
    const { ipcMain, dialog, mainWindow, updateConfig, notifyLibraryUpdated } =
      register();

    await expect(
      ipcMain.handlers.get('config:choose-download-dir')(),
    ).resolves.toBe('D:\\Music\\Utawakui');

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    expect(updateConfig).toHaveBeenCalledWith({
      downloadDir: 'D:\\Music\\Utawakui',
    });
    expect(notifyLibraryUpdated).toHaveBeenCalledTimes(1);
  });

  it('resets the directory before invalidating and returning resolved truth', async () => {
    const calls = [];
    const updateConfig = vi.fn(() => calls.push('update'));
    const notifyLibraryUpdated = vi.fn(() => calls.push('notify'));
    const { ipcMain } = register({ updateConfig, notifyLibraryUpdated });

    await expect(
      ipcMain.handlers.get('config:reset-download-dir')(),
    ).resolves.toBe('C:\\Users\\Singer\\Music\\Utawakui');
    expect(updateConfig).toHaveBeenCalledWith({ downloadDir: null });
    expect(calls).toEqual(['update', 'notify']);
  });

  it('opens only the main-resolved download directory', async () => {
    const { ipcMain, openPath } = register();

    await expect(
      ipcMain.handlers.get('config:open-download-dir')(),
    ).resolves.toBeUndefined();
    expect(openPath).toHaveBeenCalledWith('C:\\Users\\Singer\\Music\\Utawakui');
  });

  it.each([
    ['resolved shell error', vi.fn().mockResolvedValue('private shell error')],
    [
      'rejected shell error',
      vi.fn().mockRejectedValue(new Error('private E:\\Music path failure')),
    ],
  ])(
    'bounds and diagnoses %s while opening the directory',
    async (label, openPath) => {
      const { ipcMain, recordDiagnostic } = register({ openPath });

      const thrown = await ipcMain.handlers
        .get('config:open-download-dir')()
        .catch((error) => error);

      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'config',
          operation: 'open-download-directory',
          code: 'DOWNLOAD_DIRECTORY_OPEN_FAILED',
          error: expect.any(Error),
        }),
      );
      expect(thrown.message).toContain(APP_ERROR_PREFIX);
      expect(thrown.message).toContain('DOWNLOAD_DIRECTORY_OPEN_FAILED');
      expect(thrown.message).not.toContain('private');
      expect(thrown.message).not.toContain('E:\\Music');
    },
  );

  it('reads renderer preferences without exposing the config object', async () => {
    const { ipcMain } = register();

    await expect(ipcMain.handlers.get('config:get-ui-theme')()).resolves.toBe(
      'dark',
    );
    await expect(
      ipcMain.handlers.get('config:get-sidebar-width')(),
    ).resolves.toBe(256);
    await expect(
      ipcMain.handlers.get('config:get-capture-device')(),
    ).resolves.toBeNull();
    await expect(
      ipcMain.handlers.get('config:get-auto-music-analysis')(),
    ).resolves.toBe(true);
    await expect(
      ipcMain.handlers.get('config:get-app-update-auto-check')(),
    ).resolves.toBe(true);
  });

  it('persists a valid theme and updates an available main window', async () => {
    const { ipcMain, mainWindow, updateConfig } = register();

    await expect(
      ipcMain.handlers.get('config:set-ui-theme')(null, 'light'),
    ).resolves.toBe('light');
    expect(updateConfig).toHaveBeenCalledWith({ uiTheme: 'light' });
    expect(mainWindow.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#ffffff',
      symbolColor: '#101010',
    });
    expect(mainWindow.setBackgroundColor).toHaveBeenCalledWith('#ffffff');
  });

  it('persists a valid theme without requiring a main window', async () => {
    const { ipcMain, updateConfig } = register({ getMainWindow: () => null });

    await expect(
      ipcMain.handlers.get('config:set-ui-theme')(null, 'light'),
    ).resolves.toBe('light');
    expect(updateConfig).toHaveBeenCalledWith({ uiTheme: 'light' });
  });

  it.each(['unknown', '__proto__', null, { theme: 'dark' }])(
    'rejects invalid theme input without reflection',
    async (theme) => {
      const { ipcMain, updateConfig, recordDiagnostic } = register();

      const thrown = await ipcMain.handlers
        .get('config:set-ui-theme')(null, theme)
        .catch((error) => error);

      expect(thrown.message).toContain('UI_THEME_INVALID');
      expect(thrown.message).not.toContain('__proto__');
      expect(updateConfig).not.toHaveBeenCalled();
      expect(recordDiagnostic).not.toHaveBeenCalled();
    },
  );

  it.each([SIDEBAR_WIDTH_MIN, 256.5, SIDEBAR_WIDTH_MAX])(
    'persists a bounded sidebar width of %s',
    async (width) => {
      const { ipcMain, updateConfig } = register();

      await expect(
        ipcMain.handlers.get('config:set-sidebar-width')(null, width),
      ).resolves.toBe(width);
      expect(updateConfig).toHaveBeenCalledWith({ sidebarWidth: width });
    },
  );

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    SIDEBAR_WIDTH_MIN - 1,
    SIDEBAR_WIDTH_MAX + 1,
    '256',
  ])('rejects an invalid sidebar width of %s', async (width) => {
    const { ipcMain, updateConfig, recordDiagnostic } = register();

    const thrown = await ipcMain.handlers
      .get('config:set-sidebar-width')(null, width)
      .catch((error) => error);

    expect(thrown.message).toContain('SIDEBAR_WIDTH_INVALID');
    expect(updateConfig).not.toHaveBeenCalled();
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it.each([
    null,
    'default',
    'device-id',
    'x'.repeat(CAPTURE_DEVICE_ID_MAX_LENGTH),
  ])('persists a bounded capture-device intent', async (deviceId) => {
    const { ipcMain, updateConfig } = register();

    await expect(
      ipcMain.handlers.get('config:set-capture-device')(null, deviceId),
    ).resolves.toBe(deviceId);
    expect(updateConfig).toHaveBeenCalledWith({ captureDeviceId: deviceId });
  });

  it.each([
    '',
    'x'.repeat(CAPTURE_DEVICE_ID_MAX_LENGTH + 1),
    42,
    { deviceId: 'private-device' },
  ])('rejects an invalid capture-device intent', async (deviceId) => {
    const { ipcMain, updateConfig, recordDiagnostic } = register();

    const thrown = await ipcMain.handlers
      .get('config:set-capture-device')(null, deviceId)
      .catch((error) => error);

    expect(thrown.message).toContain('CAPTURE_DEVICE_INVALID');
    expect(thrown.message).not.toContain('private-device');
    expect(updateConfig).not.toHaveBeenCalled();
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'persists automatic music analysis as %s',
    async (enabled) => {
      const { ipcMain, updateConfig } = register();

      await expect(
        ipcMain.handlers.get('config:set-auto-music-analysis')(null, enabled),
      ).resolves.toBe(enabled);
      expect(updateConfig).toHaveBeenCalledWith({
        autoAnalyzeMusicStructure: enabled,
      });
    },
  );

  it.each([null, 0, 'true', {}])(
    'rejects invalid automatic music analysis value %j',
    async (enabled) => {
      const { ipcMain, updateConfig, recordDiagnostic } = register();

      const thrown = await ipcMain.handlers
        .get('config:set-auto-music-analysis')(null, enabled)
        .catch((error) => error);

      expect(thrown.message).toContain('AUTO_MUSIC_ANALYSIS_INVALID');
      expect(updateConfig).not.toHaveBeenCalled();
      expect(recordDiagnostic).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'persists the automatic app-update check preference as %s and applies it live',
    async (enabled) => {
      const { ipcMain, updateConfig, applyAppUpdateAutoCheck } = register();

      await expect(
        ipcMain.handlers.get('config:set-app-update-auto-check')(null, enabled),
      ).resolves.toBe(enabled);
      expect(updateConfig).toHaveBeenCalledWith({
        autoCheckAppUpdates: enabled,
      });
      expect(applyAppUpdateAutoCheck).toHaveBeenCalledWith(enabled);
    },
  );

  it('persists the app-update check preference without an apply callback', async () => {
    const { ipcMain, updateConfig } = register({
      applyAppUpdateAutoCheck: undefined,
    });

    await expect(
      ipcMain.handlers.get('config:set-app-update-auto-check')(null, false),
    ).resolves.toBe(false);
    expect(updateConfig).toHaveBeenCalledWith({ autoCheckAppUpdates: false });
  });

  it.each([null, 0, 'true', {}])(
    'rejects invalid automatic app-update check value %j',
    async (enabled) => {
      const {
        ipcMain,
        updateConfig,
        recordDiagnostic,
        applyAppUpdateAutoCheck,
      } = register();

      const thrown = await ipcMain.handlers
        .get('config:set-app-update-auto-check')(null, enabled)
        .catch((error) => error);

      expect(thrown.message).toContain('APP_UPDATE_AUTO_CHECK_INVALID');
      expect(updateConfig).not.toHaveBeenCalled();
      expect(recordDiagnostic).not.toHaveBeenCalled();
      expect(applyAppUpdateAutoCheck).not.toHaveBeenCalled();
    },
  );

  it('bounds and diagnoses a private config persistence failure', async () => {
    const privateError = new Error('failed E:\\Users\\Singer\\config.json');
    const updateConfig = vi.fn(() => {
      throw privateError;
    });
    const { ipcMain, recordDiagnostic } = register({ updateConfig });

    const thrown = await ipcMain.handlers
      .get('config:set-sidebar-width')(null, 300)
      .catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'config',
        operation: 'set-sidebar-width',
        code: 'SIDEBAR_WIDTH_UPDATE_FAILED',
        error: privateError,
      }),
    );
    expect(thrown.message).toContain('SIDEBAR_WIDTH_UPDATE_FAILED');
    expect(thrown.message).not.toContain('config.json');
  });
});
