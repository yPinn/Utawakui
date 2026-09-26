import { describe, expect, it, vi } from 'vitest';
import { registerObsHandlers } from './obsHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function createAdapter() {
  return {
    getStatus: vi.fn(() => ({ observed: { lifecycle: 'disabled' } })),
    configure: vi.fn(async (value) => ({
      desired: value,
      observed: { lifecycle: value.enabled ? 'ready' : 'disabled' },
    })),
    connect: vi.fn(async () => ({ observed: { lifecycle: 'ready' } })),
    disconnect: vi.fn(async () => ({ observed: { lifecycle: 'disabled' } })),
  };
}

function createCredentialStore() {
  return {
    hasPassword: vi.fn(() => false),
    savePassword: vi.fn(() => true),
    clearPassword: vi.fn(() => true),
  };
}

function createSessionHistoryService() {
  return {
    addMarker: vi.fn(async (label) => ({
      type: 'marker',
      label: label ?? null,
      stream: null,
      record: null,
      occurredAt: '2026-09-24T12:00:00.000Z',
    })),
    getLatestSession: vi.fn(() => null),
  };
}

describe('obs handlers', () => {
  it('registers the fixed channel set', () => {
    const ipcMain = createIpcMain();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    expect([...ipcMain.handlers.keys()]).toEqual([
      'obs:get-status',
      'obs:get-settings',
      'obs:update-settings',
      'obs:clear-password',
      'obs:connect',
      'obs:disconnect',
      'obs:add-marker',
      'obs:get-latest-session',
      'obs:copy-text',
    ]);
  });

  it('get-settings reports whether a password is stored, never the password itself', async () => {
    const ipcMain = createIpcMain();
    const credentialStore = createCredentialStore();
    credentialStore.hasPassword.mockReturnValue(true);
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(ipcMain.handlers.get('obs:get-settings')()).resolves.toEqual({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      hasPassword: true,
    });
  });

  it('update-settings gates, validates, persists the password separately, and configures the adapter', async () => {
    const ipcMain = createIpcMain();
    const adapter = createAdapter();
    const credentialStore = createCredentialStore();
    const requireFeatureGate = vi.fn();
    const updateConfig = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter,
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate,
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig,
    });

    const result = await ipcMain.handlers.get('obs:update-settings')(null, {
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
      password: 'hunter2',
    });

    expect(requireFeatureGate).toHaveBeenCalledWith('obs-integration');
    expect(credentialStore.savePassword).toHaveBeenCalledWith('hunter2');
    expect(updateConfig).toHaveBeenCalledWith({
      obsIntegration: {
        enabled: true,
        host: '127.0.0.1',
        port: 4455,
        skipThresholdMs: 10000,
      },
    });
    expect(adapter.configure).toHaveBeenCalledWith({
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
    });
    expect(result.observed.lifecycle).toBe('ready');
  });

  it('update-settings rejects invalid connection settings without touching the adapter or credential store', async () => {
    const ipcMain = createIpcMain();
    const adapter = createAdapter();
    const credentialStore = createCredentialStore();
    registerObsHandlers({
      ipcMain,
      adapter,
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('obs:update-settings')(null, {
        enabled: true,
        host: '127.0.0.1',
        port: 999_999,
      }),
    ).rejects.toThrow('invalid OBS integration settings');
    expect(adapter.configure).not.toHaveBeenCalled();
    expect(credentialStore.savePassword).not.toHaveBeenCalled();
  });

  it('update-settings fails closed when secure credential storage cannot save the password', async () => {
    const ipcMain = createIpcMain();
    const adapter = createAdapter();
    const credentialStore = createCredentialStore();
    credentialStore.savePassword.mockReturnValue(false);
    const updateConfig = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter,
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig,
    });

    await expect(
      ipcMain.handlers.get('obs:update-settings')(null, {
        enabled: true,
        host: '127.0.0.1',
        port: 4455,
        skipThresholdMs: 10000,
        password: 'hunter2',
      }),
    ).rejects.toThrow('OBS credential storage unavailable');
    expect(updateConfig).not.toHaveBeenCalled();
    expect(adapter.configure).not.toHaveBeenCalled();
  });

  it.each([1234, null, 'x'.repeat(1025)])(
    'update-settings rejects an invalid password intent: %j',
    async (password) => {
      const ipcMain = createIpcMain();
      const adapter = createAdapter();
      const credentialStore = createCredentialStore();
      registerObsHandlers({
        ipcMain,
        adapter,
        credentialStore,
        sessionHistoryService: createSessionHistoryService(),
        requireFeatureGate: vi.fn(),
        featureId: 'obs-integration',
        getConfig: () => ({
          obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
        }),
        updateConfig: vi.fn(),
      });

      await expect(
        ipcMain.handlers.get('obs:update-settings')(null, {
          enabled: true,
          host: '127.0.0.1',
          port: 4455,
          skipThresholdMs: 10000,
          password,
        }),
      ).rejects.toThrow('invalid OBS password');
      expect(credentialStore.savePassword).not.toHaveBeenCalled();
      expect(adapter.configure).not.toHaveBeenCalled();
    },
  );

  it('update-settings omitting password leaves any stored credential untouched', async () => {
    const ipcMain = createIpcMain();
    const credentialStore = createCredentialStore();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await ipcMain.handlers.get('obs:update-settings')(null, {
      enabled: true,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
    });

    expect(credentialStore.savePassword).not.toHaveBeenCalled();
  });

  it('clear-password removes the credential without echoing it or requiring a connection', async () => {
    const ipcMain = createIpcMain();
    const credentialStore = createCredentialStore();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(ipcMain.handlers.get('obs:clear-password')()).resolves.toEqual(
      { hasPassword: false },
    );
    expect(credentialStore.clearPassword).toHaveBeenCalledOnce();
  });

  it('clear-password reports failure instead of claiming the credential was removed', async () => {
    const ipcMain = createIpcMain();
    const credentialStore = createCredentialStore();
    credentialStore.clearPassword.mockReturnValue(false);
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore,
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: false, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(ipcMain.handlers.get('obs:clear-password')()).rejects.toThrow(
      'OBS credential removal failed',
    );
  });

  it('connect and disconnect delegate to the adapter, only connect is gated', async () => {
    const ipcMain = createIpcMain();
    const adapter = createAdapter();
    const requireFeatureGate = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter,
      credentialStore: createCredentialStore(),
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate,
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await ipcMain.handlers.get('obs:connect')();
    expect(requireFeatureGate).toHaveBeenCalledWith('obs-integration');
    expect(adapter.connect).toHaveBeenCalledOnce();

    await ipcMain.handlers.get('obs:disconnect')();
    expect(adapter.disconnect).toHaveBeenCalledOnce();
    expect(requireFeatureGate).toHaveBeenCalledOnce();
  });

  it('add-marker gates and delegates to sessionHistoryService, returning its outcome', async () => {
    const ipcMain = createIpcMain();
    const sessionHistoryService = createSessionHistoryService();
    const requireFeatureGate = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService,
      requireFeatureGate,
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    const result = await ipcMain.handlers.get('obs:add-marker')(
      null,
      'talking break',
    );

    expect(requireFeatureGate).toHaveBeenCalledWith('obs-integration');
    expect(sessionHistoryService.addMarker).toHaveBeenCalledWith(
      'talking break',
    );
    expect(result.label).toBe('talking break');
  });

  it('add-marker accepts an omitted label', async () => {
    const ipcMain = createIpcMain();
    const sessionHistoryService = createSessionHistoryService();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService,
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await ipcMain.handlers.get('obs:add-marker')(null, undefined);

    expect(sessionHistoryService.addMarker).toHaveBeenCalledWith(undefined);
  });

  it('add-marker rejects a non-string label without calling sessionHistoryService', async () => {
    const ipcMain = createIpcMain();
    const sessionHistoryService = createSessionHistoryService();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService,
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('obs:add-marker')(null, { not: 'a string' }),
    ).rejects.toThrow('invalid marker label');
    expect(sessionHistoryService.addMarker).not.toHaveBeenCalled();
  });

  it('add-marker rejects an over-length label without calling sessionHistoryService', async () => {
    const ipcMain = createIpcMain();
    const sessionHistoryService = createSessionHistoryService();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService,
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('obs:add-marker')(null, 'x'.repeat(201)),
    ).rejects.toThrow('marker label must be at most 200 characters');
    expect(sessionHistoryService.addMarker).not.toHaveBeenCalled();
  });

  it('get-latest-session delegates to sessionHistoryService without gating (read-only)', async () => {
    const ipcMain = createIpcMain();
    const sessionHistoryService = createSessionHistoryService();
    sessionHistoryService.getLatestSession.mockReturnValue({
      id: 'sess_1',
      startedAt: '2026-09-24T12:00:00.000Z',
      entries: [],
    });
    const requireFeatureGate = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService,
      requireFeatureGate,
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    const result = await ipcMain.handlers.get('obs:get-latest-session')();

    expect(result.id).toBe('sess_1');
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('copy-text writes the given text via the injected clipboard action', async () => {
    const ipcMain = createIpcMain();
    const writeClipboardText = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
      writeClipboardText,
    });

    await expect(
      ipcMain.handlers.get('obs:copy-text')(null, '0:00 Song A'),
    ).resolves.toBe(true);
    expect(writeClipboardText).toHaveBeenCalledWith('0:00 Song A');
  });

  it('copy-text rejects empty/non-string/over-length text without touching the clipboard', async () => {
    const ipcMain = createIpcMain();
    const writeClipboardText = vi.fn();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
      writeClipboardText,
    });
    const copyText = ipcMain.handlers.get('obs:copy-text');

    await expect(copyText(null, '')).rejects.toThrow('nothing to copy');
    await expect(copyText(null, 123)).rejects.toThrow('nothing to copy');
    await expect(copyText(null, 'x'.repeat(20_001))).rejects.toThrow(
      'text must be at most 20000 characters',
    );
    expect(writeClipboardText).not.toHaveBeenCalled();
  });

  it('copy-text rejects when no clipboard action was injected', async () => {
    const ipcMain = createIpcMain();
    registerObsHandlers({
      ipcMain,
      adapter: createAdapter(),
      credentialStore: createCredentialStore(),
      sessionHistoryService: createSessionHistoryService(),
      requireFeatureGate: vi.fn(),
      featureId: 'obs-integration',
      getConfig: () => ({
        obsIntegration: { enabled: true, host: '127.0.0.1', port: 4455 },
      }),
      updateConfig: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('obs:copy-text')(null, 'chapters'),
    ).rejects.toThrow('clipboard unavailable');
  });
});
