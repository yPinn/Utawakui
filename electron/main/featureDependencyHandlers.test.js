import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\AppData\\Utawakui'),
  list: vi.fn(),
  prepare: vi.fn(),
  remove: vi.fn(),
  repair: vi.fn(),
  detect: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: mocks.getPath } }));
vi.mock('../lib/featureDependencies', () => ({
  getFfmpegDependency: () => ({
    id: 'ffmpeg-gyan-essentials',
    featureId: 'audio-processing-flow',
  }),
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
  registerFeatureDependencyHandlers({
    ipcMain,
    requireFeatureGate,
    getMainWindow: () => null,
    getConfig: () => ({ systemFfmpegPath: null }),
    updateConfig: vi.fn(),
    recordDiagnostic,
    getUserDataDir: () => 'C:\\AppData\\Utawakui',
    dependencyService: {
      getFfmpegDependency: () => ({
        id: 'ffmpeg-gyan-essentials',
        featureId: 'audio-processing-flow',
      }),
      listFeatureDependencyStatuses: mocks.list,
      prepareFeatureDependency: mocks.prepare,
      removeFeatureDependency: mocks.remove,
      repairFeatureDependency: mocks.repair,
    },
    detectSystemFfmpegImpl: mocks.detect,
    ...overrides,
  });
  return { ipcMain, recordDiagnostic, requireFeatureGate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockReturnValue([
    {
      id: 'ffmpeg-gyan-essentials',
      featureId: 'audio-processing-flow',
      installed: false,
    },
  ]);
});

describe('feature dependency handlers', () => {
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
