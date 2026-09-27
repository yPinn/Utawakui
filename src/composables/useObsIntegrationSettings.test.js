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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

  it('does not let a stale settings refresh overwrite a newer successful save', async () => {
    const pendingRefresh = deferred();
    const updateObsSettings = vi.fn().mockResolvedValue({
      desired: { enabled: true, host: 'new-obs.local', port: 4456 },
      observed: { lifecycle: 'ready', streaming: {}, recording: {} },
      error: null,
    });
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsSettings: vi.fn(() => pendingRefresh.promise),
        getObsStatus: vi.fn(),
        updateObsSettings,
      },
    });
    const settings = await loadSettings();

    const refresh = settings.refreshSettings();
    settings.host.value = 'new-obs.local';
    settings.port.value = '4456';
    await expect(settings.save({ enabled: true })).resolves.toBe(true);

    pendingRefresh.resolve({
      enabled: true,
      host: 'stale-obs.local',
      port: 4457,
      skipThresholdMs: 5000,
      hasPassword: true,
    });
    await expect(refresh).resolves.toBe(false);

    expect(settings.host.value).toBe('new-obs.local');
    expect(settings.port.value).toBe('4456');
    expect(settings.hasStoredPassword.value).toBe(false);
    expect(settings.isLoading.value).toBe(false);
  });

  it('can disable the connection with the last committed values while drafts are invalid', async () => {
    const updateObsSettings = vi.fn().mockResolvedValue({
      desired: { enabled: false, host: '192.168.1.5', port: 4456 },
      observed: { lifecycle: 'disabled', streaming: {}, recording: {} },
      error: null,
    });
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        getObsSettings: vi.fn().mockResolvedValue({
          enabled: true,
          host: '192.168.1.5',
          port: 4456,
          skipThresholdMs: 5000,
          hasPassword: false,
        }),
        getObsStatus: vi.fn(),
        updateObsSettings,
      },
    });
    const settings = await loadSettings();
    await settings.refreshSettings();
    settings.host.value = 'ws://invalid';
    settings.port.value = 'invalid';

    await expect(settings.save({ enabled: false })).resolves.toBe(true);

    expect(updateObsSettings).toHaveBeenCalledWith({
      enabled: false,
      host: '192.168.1.5',
      port: 4456,
      skipThresholdMs: 5000,
    });
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

  it.each([
    ['host', '   ', '請輸入有效的主機名稱或 IP。'],
    ['host', 'ws://127.0.0.1', '請輸入有效的主機名稱或 IP。'],
    ['port', 'not-a-port', '連接埠必須是 1 到 65535 的整數。'],
    ['port', '4455junk', '連接埠必須是 1 到 65535 的整數。'],
    ['port', '65536', '連接埠必須是 1 到 65535 的整數。'],
    ['skipThresholdSeconds', '301', '略過門檻必須是 0 到 300 的整數秒。'],
    ['skipThresholdSeconds', '1.5', '略過門檻必須是 0 到 300 的整數秒。'],
  ])(
    'save() rejects invalid %s input instead of silently changing it',
    async (field, value, message) => {
      const updateObsSettings = vi.fn();
      vi.stubGlobal('window', {
        Utawakui: { onObsStatus: vi.fn(() => vi.fn()), updateObsSettings },
      });
      const settings = await loadSettings();
      settings[field].value = value;

      await expect(settings.save({ enabled: true })).resolves.toBe(false);

      expect(updateObsSettings).not.toHaveBeenCalled();
      expect(settings.error.value).toBe(message);
    },
  );

  it('save() loads and converts a valid skip threshold to/from whole seconds', async () => {
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

    settings.skipThresholdSeconds.value = '30';
    await settings.save({ enabled: true });
    expect(updateObsSettings).toHaveBeenCalledWith(
      expect.objectContaining({ skipThresholdMs: 30_000 }),
    );
    expect(settings.skipThresholdSeconds.value).toBe('30');
  });

  it('save() rejects an oversized password without crossing IPC', async () => {
    const updateObsSettings = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: { onObsStatus: vi.fn(() => vi.fn()), updateObsSettings },
    });
    const settings = await loadSettings();
    settings.password.value = 'x'.repeat(1025);

    await expect(settings.save({ enabled: true })).resolves.toBe(false);

    expect(updateObsSettings).not.toHaveBeenCalled();
    expect(settings.error.value).toBe('密碼不可超過 1024 個字元。');
  });

  it('keeps save single-flight so a second action cannot race the pending request', async () => {
    const pending = deferred();
    const updateObsSettings = vi.fn(() => pending.promise);
    const connectObs = vi.fn();
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        updateObsSettings,
        connectObs,
      },
    });
    const settings = await loadSettings();

    const firstSave = settings.save({ enabled: true });
    await expect(settings.save({ enabled: true })).resolves.toBe(false);
    await expect(settings.retryConnect()).resolves.toBe(false);
    expect(updateObsSettings).toHaveBeenCalledOnce();
    expect(connectObs).not.toHaveBeenCalled();
    expect(settings.isSaving.value).toBe(true);

    pending.resolve({
      desired: { enabled: true, host: '127.0.0.1', port: 4455 },
      observed: { lifecycle: 'ready', streaming: {}, recording: {} },
      error: null,
    });
    await expect(firstSave).resolves.toBe(true);
    expect(settings.isSaving.value).toBe(false);
  });

  it('clearPassword updates stored state only after the bridge confirms removal', async () => {
    const clearObsPassword = vi.fn().mockResolvedValue({ hasPassword: false });
    vi.stubGlobal('window', {
      Utawakui: { onObsStatus: vi.fn(() => vi.fn()), clearObsPassword },
    });
    const settings = await loadSettings();
    settings.hasStoredPassword.value = true;

    await expect(settings.clearPassword()).resolves.toBe(true);

    expect(clearObsPassword).toHaveBeenCalledOnce();
    expect(settings.hasStoredPassword.value).toBe(false);
  });

  it('clearPassword preserves stored state and shows a bounded failure', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn(() => vi.fn()),
        clearObsPassword: vi.fn().mockRejectedValue(new Error('private path')),
      },
    });
    const settings = await loadSettings();
    settings.hasStoredPassword.value = true;

    await expect(settings.clearPassword()).resolves.toBe(false);

    expect(settings.hasStoredPassword.value).toBe(true);
    expect(settings.error.value).toBe('無法移除密碼，請再試一次。');
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

    expect(settings.error.value).toBe('無法儲存設定，請再試一次。');
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
      '無法連線。請確認 OBS 已啟動 WebSocket。',
    );
  });

  it('retryConnect preserves a classified adapter error instead of hiding it with a generic message', async () => {
    let statusListener;
    const status = {
      desired: { enabled: true, host: '127.0.0.1', port: 4455 },
      observed: { lifecycle: 'error', streaming: {}, recording: {} },
      error: {
        code: 'OBS_AUTH_FAILED',
        message: 'OBS 密碼錯誤或未設定。',
      },
    };
    vi.stubGlobal('window', {
      Utawakui: {
        onObsStatus: vi.fn((listener) => {
          statusListener = listener;
          return vi.fn();
        }),
        connectObs: vi.fn(async () => {
          statusListener(status);
          throw new Error('private authentication detail');
        }),
      },
    });
    const settings = await loadSettings();

    await expect(settings.retryConnect()).resolves.toBe(false);

    expect(settings.error.value).toBe('');
    expect(settings.status.error).toEqual(status.error);
  });
});
