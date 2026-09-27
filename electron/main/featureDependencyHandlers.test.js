import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\AppData\\Utawakui'),
  getFfmpegDependency: vi.fn(() => ({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
  })),
  resolveFfmpegRuntime: vi.fn(),
  list: vi.fn(),
  prepare: vi.fn(),
  remove: vi.fn(),
  repair: vi.fn(),
  detect: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: mocks.getPath } }));
vi.mock('../lib/featureDependencies', () => ({
  getFfmpegDependency: mocks.getFfmpegDependency,
  resolveFfmpegRuntime: mocks.resolveFfmpegRuntime,
  listFeatureDependencyStatuses: mocks.list,
  prepareFeatureDependency: mocks.prepare,
  removeFeatureDependency: mocks.remove,
  repairFeatureDependency: mocks.repair,
}));
vi.mock('../lib/systemFfmpeg', () => ({
  detectSystemFfmpeg: mocks.detect,
}));

import { registerFeatureDependencyHandlers } from './featureDependencyHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  const requireFeatureGate = vi.fn();
  const send = vi.fn();
  const mainWindow = { webContents: { send } };
  const dependencies = {
    ipcMain,
    requireFeatureGate,
    getMainWindow: vi.fn(() => mainWindow),
    getConfig: vi.fn(() => ({ systemFfmpegPath: null })),
    updateConfig: vi.fn(),
    recordDiagnostic,
    getUserDataDir: vi.fn(() => 'C:\\AppData\\Utawakui'),
    dependencyService: {
      getFfmpegDependency: mocks.getFfmpegDependency,
      listFeatureDependencyStatuses: mocks.list,
      prepareFeatureDependency: mocks.prepare,
      removeFeatureDependency: mocks.remove,
      repairFeatureDependency: mocks.repair,
    },
    detectSystemFfmpegImpl: mocks.detect,
    resolveFfmpegRuntimeImpl: mocks.resolveFfmpegRuntime,
    resourcesPath: null,
    ...overrides,
  };
  registerFeatureDependencyHandlers(dependencies);
  return {
    ...dependencies,
    ipcMain,
    mainWindow,
    recordDiagnostic,
    requireFeatureGate: dependencies.requireFeatureGate,
    send,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPath.mockReturnValue('C:\\AppData\\Utawakui');
  mocks.getFfmpegDependency.mockReturnValue({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
  });
  mocks.resolveFfmpegRuntime.mockImplementation(
    (_userDataDir, systemFfmpegPath) => ({
      path: systemFfmpegPath,
      source: systemFfmpegPath ? 'system' : 'managed',
      staleSystemPath: false,
    }),
  );
  mocks.list.mockReturnValue([
    {
      id: 'ffmpeg-gyan-essentials',
      featureId: 'audio-processing-flow',
      installed: false,
    },
  ]);
  mocks.prepare.mockResolvedValue({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
    installed: true,
  });
  mocks.remove.mockReturnValue({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
    installed: false,
  });
  mocks.repair.mockResolvedValue({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
    installed: true,
  });
  mocks.detect.mockResolvedValue({
    ok: true,
    path: 'C:\\Tools\\ffmpeg.exe',
    version: '7.1',
  });
});

describe('feature dependency handlers', () => {
  it('registers only the six feature dependency IPC contracts', () => {
    const { ipcMain } = register();

    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      'feature-dependencies:detect-system-ffmpeg',
      'feature-dependencies:list',
      'feature-dependencies:prepare',
      'feature-dependencies:remove',
      'feature-dependencies:repair',
      'feature-dependencies:set-ffmpeg-source',
    ]);
  });

  it('lists statuses from main-owned paths without requiring a feature gate', async () => {
    const statuses = [
      {
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
        installed: true,
      },
    ];
    mocks.list.mockReturnValue(statuses);
    const getConfig = vi.fn(() => ({
      systemFfmpegPath: 'C:\\Tools\\ffmpeg.exe',
    }));
    const { ipcMain, requireFeatureGate } = register({ getConfig });

    await expect(
      ipcMain.handlers.get('feature-dependencies:list')(),
    ).resolves.toBe(statuses);
    expect(mocks.list).toHaveBeenCalledWith(
      'C:\\AppData\\Utawakui',
      undefined,
      'C:\\Tools\\ffmpeg.exe',
    );
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('clears a stale system FFmpeg preference before listing managed status', async () => {
    const getConfig = vi.fn(() => ({
      systemFfmpegPath: 'C:\\Tools\\removed-ffmpeg.exe',
    }));
    mocks.resolveFfmpegRuntime.mockReturnValueOnce({
      path: 'C:\\AppData\\Utawakui\\dependencies\\ffmpeg\\ffmpeg.exe',
      source: 'managed',
      staleSystemPath: true,
    });
    const { ipcMain, updateConfig } = register({ getConfig });

    await ipcMain.handlers.get('feature-dependencies:list')();

    expect(updateConfig).toHaveBeenCalledWith({ systemFfmpegPath: null });
    expect(mocks.list).toHaveBeenCalledWith(
      'C:\\AppData\\Utawakui',
      undefined,
      null,
    );
  });

  it('prepares after gating and publishes bounded progress and fresh status', async () => {
    const prepared = {
      id: 'ffmpeg-gyan-essentials',
      featureId: 'audio-processing-flow',
      installed: true,
    };
    mocks.prepare.mockImplementation(
      async (userDataDir, dependencyId, options) => {
        options.onProgress({ stage: 'downloading', percent: 42 });
        return prepared;
      },
    );
    const { ipcMain, requireFeatureGate, send } = register({
      resourcesPath: 'C:\\Program Files\\Utawakui\\resources',
    });

    await expect(
      ipcMain.handlers.get('feature-dependencies:prepare')(
        null,
        'ffmpeg-gyan-essentials',
      ),
    ).resolves.toBe(prepared);

    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(mocks.prepare).toHaveBeenCalledWith(
      'C:\\AppData\\Utawakui',
      'ffmpeg-gyan-essentials',
      expect.objectContaining({
        resourcesPath: 'C:\\Program Files\\Utawakui\\resources',
        onProgress: expect.any(Function),
      }),
    );
    expect(send).toHaveBeenNthCalledWith(1, 'feature-dependencies:progress', {
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'downloading',
      percent: 42,
    });
    expect(send).toHaveBeenNthCalledWith(
      2,
      'feature-dependencies:updated',
      expect.any(Array),
    );
  });

  it('removes after gating and publishes fresh status', async () => {
    const { ipcMain, requireFeatureGate, send } = register();

    const result = await ipcMain.handlers.get('feature-dependencies:remove')(
      null,
      'ffmpeg-gyan-essentials',
    );

    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(mocks.remove).toHaveBeenCalledWith(
      'C:\\AppData\\Utawakui',
      'ffmpeg-gyan-essentials',
    );
    expect(result).toMatchObject({ installed: false });
    expect(send).toHaveBeenCalledWith(
      'feature-dependencies:updated',
      expect.any(Array),
    );
  });

  it('repairs after gating and publishes progress and fresh status', async () => {
    mocks.repair.mockImplementation(
      async (userDataDir, dependencyId, options) => {
        options.onProgress({ stage: 'verifying' });
        return { id: dependencyId, installed: true };
      },
    );
    const { ipcMain, requireFeatureGate, send } = register();

    const result = await ipcMain.handlers.get('feature-dependencies:repair')(
      null,
      'ffmpeg-gyan-essentials',
    );

    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(mocks.repair).toHaveBeenCalledWith(
      'C:\\AppData\\Utawakui',
      'ffmpeg-gyan-essentials',
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(result).toMatchObject({ installed: true });
    expect(send).toHaveBeenCalledWith('feature-dependencies:progress', {
      dependencyId: 'ffmpeg-gyan-essentials',
      stage: 'verifying',
    });
    expect(send).toHaveBeenCalledWith(
      'feature-dependencies:updated',
      expect.any(Array),
    );
  });

  it('allows a read-only system FFmpeg probe without a feature gate', async () => {
    const detected = {
      ok: true,
      path: 'C:\\Tools\\ffmpeg.exe',
      version: '7.1',
    };
    mocks.detect.mockResolvedValue(detected);
    const { ipcMain, requireFeatureGate } = register();

    await expect(
      ipcMain.handlers.get('feature-dependencies:detect-system-ffmpeg')(),
    ).resolves.toBe(detected);
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('switches to managed FFmpeg without accepting a renderer path', async () => {
    const { ipcMain, requireFeatureGate, send, updateConfig } = register();

    await expect(
      ipcMain.handlers.get('feature-dependencies:set-ffmpeg-source')(
        null,
        false,
      ),
    ).resolves.toEqual({ source: 'managed' });

    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(updateConfig).toHaveBeenCalledWith({ systemFfmpegPath: null });
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'feature-dependencies:updated',
      expect.any(Array),
    );
  });

  it('re-detects system FFmpeg in main before persisting the source', async () => {
    const { ipcMain, requireFeatureGate, send, updateConfig } = register();

    await expect(
      ipcMain.handlers.get('feature-dependencies:set-ffmpeg-source')(
        null,
        true,
      ),
    ).resolves.toEqual({
      source: 'system',
      path: 'C:\\Tools\\ffmpeg.exe',
      version: '7.1',
    });

    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(mocks.detect).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({
      systemFfmpegPath: 'C:\\Tools\\ffmpeg.exe',
    });
    expect(send).toHaveBeenCalledWith(
      'feature-dependencies:updated',
      expect.any(Array),
    );
  });

  it('does not publish when no main window exists', async () => {
    const { ipcMain } = register({ getMainWindow: () => null });

    await expect(
      ipcMain.handlers.get('feature-dependencies:repair')(
        null,
        'ffmpeg-gyan-essentials',
      ),
    ).resolves.toMatchObject({ installed: true });
  });

  it('does not log an expected feature-gate rejection', async () => {
    const gateError = new Error('feature gate required');
    const requireFeatureGate = vi.fn(() => {
      throw gateError;
    });
    const { ipcMain, recordDiagnostic } = register({ requireFeatureGate });

    await expect(
      ipcMain.handlers.get('feature-dependencies:prepare')(
        null,
        'ffmpeg-gyan-essentials',
      ),
    ).rejects.toBe(gateError);
    expect(recordDiagnostic).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('records private operation failure once and returns a safe public error', async () => {
    const privateError = new Error(
      'failed C:\\Users\\Singer\\private.zip https://private.test/x',
    );
    mocks.prepare.mockRejectedValue(privateError);
    const { ipcMain, recordDiagnostic } = register();

    const thrown = await ipcMain.handlers
      .get('feature-dependencies:prepare')(null, 'ffmpeg-gyan-essentials')
      .catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'feature-dependencies',
        operation: 'prepare',
        code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
        error: privateError,
        context: { dependencyId: 'ffmpeg-gyan-essentials' },
      }),
    );
    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('"diagnosticRecorded":true');
    expect(thrown.message).not.toContain('private.zip');
    expect(thrown.message).not.toContain('private.test');
  });

  it.each([
    ['list', 'feature-dependencies:list', null, mocks.list],
    ['detect', 'feature-dependencies:detect-system-ffmpeg', null, mocks.detect],
    [
      'remove',
      'feature-dependencies:remove',
      'ffmpeg-gyan-essentials',
      mocks.remove,
    ],
    [
      'repair',
      'feature-dependencies:repair',
      'ffmpeg-gyan-essentials',
      mocks.repair,
    ],
  ])(
    'bounds and diagnoses a private %s failure',
    async (operation, channel, dependencyId, operationMock) => {
      const privateError = new Error(
        'failed C:\\Users\\Singer\\private.exe https://private.test/x',
      );
      operationMock.mockImplementation(() => {
        throw privateError;
      });
      const { ipcMain, recordDiagnostic } = register();

      const thrown = await ipcMain.handlers
        .get(channel)(null, ...(dependencyId ? [dependencyId] : []))
        .catch((error) => error);

      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'feature-dependencies',
          operation,
          error: privateError,
        }),
      );
      expect(thrown.message).toContain(APP_ERROR_PREFIX);
      expect(thrown.message).not.toContain('private.exe');
      expect(thrown.message).not.toContain('private.test');
    },
  );

  it('bounds a failed system re-detection and leaves config unchanged', async () => {
    mocks.detect.mockResolvedValue({
      ok: false,
      reason: 'failed C:\\Users\\Singer\\private-ffmpeg.exe',
    });
    const { ipcMain, recordDiagnostic, updateConfig } = register();

    const thrown = await ipcMain.handlers
      .get('feature-dependencies:set-ffmpeg-source')(null, true)
      .catch((error) => error);

    expect(updateConfig).not.toHaveBeenCalled();
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'set-ffmpeg-source',
        context: { dependencyId: 'ffmpeg-gyan-essentials' },
      }),
    );
    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('FFMPEG_SOURCE_UPDATE_FAILED');
    expect(thrown.message).not.toContain('private-ffmpeg');
  });

  it('uses a bounded fallback when system detection omits its reason', async () => {
    mocks.detect.mockResolvedValue({ ok: false });
    const { ipcMain, recordDiagnostic } = register();

    const thrown = await ipcMain.handlers
      .get('feature-dependencies:set-ffmpeg-source')(null, true)
      .catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'system FFmpeg unavailable',
        }),
      }),
    );
    expect(thrown.message).toContain('FFMPEG_SOURCE_UPDATE_FAILED');
  });

  it('rejects unknown renderer dependency ids without reflecting them', async () => {
    const { ipcMain, recordDiagnostic, requireFeatureGate } = register();

    const thrown = await ipcMain.handlers
      .get('feature-dependencies:remove')(null, '../private-path')
      .catch((error) => error);

    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('FEATURE_DEPENDENCY_UNKNOWN');
    expect(thrown.message).not.toContain('../private-path');
    expect(requireFeatureGate).not.toHaveBeenCalled();
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });
});
