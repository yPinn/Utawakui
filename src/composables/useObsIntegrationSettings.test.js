import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadSettings() {
  const { useObsIntegrationSettings } =
    await import('./useObsIntegrationSettings.js');
  return useObsIntegrationSettings();
}

describe('useObsIntegrationSettings', () => {
  it('loads existing settings and reports whether a password is already stored', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsStatus: vi.fn().mockResolvedValue({
          desired: { enabled: true, host: '192.168.1.5', port: 4456 },
          observed: { lifecycle: 'ready', streaming: {}, recording: {} },
          error: null,
        }),
        getObsSettings: vi.fn().mockResolvedValue({
          enabled: true,
          host: '192.168.1.5',
          port: 4456,
          hasPassword: true,
        }),
      },
    });
    const settings = await loadSettings();

    await settings.refreshSettings();

    expect(settings.host.value).toBe('192.168.1.5');
    expect(settings.port.value).toBe('4456');
    expect(settings.hasStoredPassword.value).toBe(true);
    expect(settings.status.observed.lifecycle).toBe('ready');
  });

  it('save() sends the password only when the user typed one, then clears the draft', async () => {
    const updateObsSettings = vi.fn().mockResolvedValue({
      desired: { enabled: true, host: '127.0.0.1', port: 4455 },
      observed: { lifecycle: 'ready', streaming: {}, recording: {} },
      error: null,
    });
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        updateObsSettings,
      },
    });
    const settings = await loadSettings();
    settings.password.value = 'hunter2';

    await expect(settings.save({ enabled: true })).resolves.toBe(true);

    expect(updateObsSettings).toHaveBeenCalledWith({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
      password: 'hunter2',
    });
    expect(settings.password.value).toBe('');
    expect(settings.hasStoredPassword.value).toBe(true);
  });

  it('save() falls back to 127.0.0.1/4455 for blank or non-numeric input', async () => {
    const updateObsSettings = vi.fn().mockResolvedValue({
      desired: { enabled: true, host: '127.0.0.1', port: 4455 },
      observed: { lifecycle: 'ready', streaming: {}, recording: {} },
      error: null,
    });
    vi.stubGlobal('window', {
      Utawakui: { onObsStatus: vi.fn(() => vi.fn()), updateObsSettings },
    });
    const settings = await loadSettings();
    settings.host.value = '   ';
    settings.port.value = 'not-a-port';

    await settings.save({ enabled: true });

    expect(updateObsSettings).toHaveBeenCalledWith({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
    });
  });

  it('save() loads, clamps, and converts the skip threshold to/from whole seconds', async () => {
    const updateObsSettings = vi.fn().mockResolvedValue({
      desired: { enabled: true, host: '127.0.0.1', port: 4455 },
      observed: { lifecycle: 'ready', streaming: {}, recording: {} },
      error: null,
    });
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsSettings: vi.fn().mockResolvedValue({
          enabled: true,
          host: '127.0.0.1',
          port: 4455,
          skipThresholdMs: 5000,
          hasPassword: false,
        }),
        updateObsSettings,
      },
    });
    const settings = await loadSettings();

    await settings.refreshSettings();
    expect(settings.skipThresholdSeconds.value).toBe('5');

    settings.skipThresholdSeconds.value = '400'; // above the 300s max
    await settings.save({ enabled: true });
    expect(updateObsSettings).toHaveBeenCalledWith(
      expect.objectContaining({ skipThresholdMs: 300_000 }),
    );
    expect(settings.skipThresholdSeconds.value).toBe('300');

    settings.skipThresholdSeconds.value = 'not-a-number';
    await settings.save({ enabled: true });
    expect(updateObsSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipThresholdMs: 10_000 }),
    );
    expect(settings.skipThresholdSeconds.value).toBe('10');
  });

  it('surfaces a bounded error and keeps the draft when saving fails', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        updateObsSettings: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const settings = await loadSettings();
    settings.password.value = 'hunter2';

    await expect(settings.save({ enabled: true })).resolves.toBe(false);

    expect(settings.error.value).toBe(
      '目前無法儲存 OBS 連線設定，請再試一次。',
    );
    expect(settings.password.value).toBe('hunter2');
  });

  it('retryConnect surfaces a bounded error on failure', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        connectObs: vi.fn().mockRejectedValue(new Error('offline')),
      },
    });
    const settings = await loadSettings();

    await expect(settings.retryConnect()).resolves.toBe(false);
    expect(settings.error.value).toBe(
      '目前無法連線至 OBS，請確認 OBS 已開啟並啟用 WebSocket 伺服器。',
    );
  });
});
