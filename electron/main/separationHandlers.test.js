import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';

// electron/lib/library is required transitively by many submodules and does
// not reliably intercept through vi.mock in this file's module graph
// (confirmed empirically); this codebase's established seam for these
// handler tests is dependency injection instead — see
// separationHandlers.js's injectable defaults
// (findSeparationTrackRecord, resolveSeparationsOutputDir, etc.), the same
// convention libraryHandlers.js and importHandlers.js already use.
const mocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\AppData\\Utawakui'),
}));

vi.mock('electron', () => ({ app: { getPath: mocks.getPath } }));

import { registerSeparationHandlers } from './separationHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  registerSeparationHandlers({
    ipcMain,
    getConfig: () => ({ systemFfmpegPath: null }),
    resolveDownloadDir: () => 'library-dir',
    getMainWindow: () => null,
    notifyLibraryUpdated: vi.fn(),
    requireFeatureGate: vi.fn(),
    featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
    heavyJobScheduler: { schedule: vi.fn(), cancel: vi.fn() },
    recordDiagnostic: vi.fn().mockReturnValue({ ok: true }),
    findSeparationTrackRecord: vi.fn(),
    resolveSeparationsOutputDir: vi.fn(),
    resolveSeparationInputAudioPath: vi.fn(),
    selectStoredSeparationResult: vi.fn(),
    getPreparedSeparationFfmpegPath: vi.fn(() => 'ffmpeg-path'),
    getPreparedSeparationModel: vi.fn(() => 'model-path'),
    ...overrides,
  });
  return ipcMain.handlers;
}

function createQueueHarness() {
  const queue = {
    enqueue: vi.fn(() => ({
      queue: {
        status: 'running',
        items: [
          {
            itemId: 'item-1',
            trackId: 'track-1',
            recipeId: 'general',
            status: 'pending',
          },
        ],
      },
      itemIds: ['item-1'],
    })),
    waitForItem: vi.fn(() =>
      Promise.resolve({ itemId: 'item-1', status: 'completed' }),
    ),
    getStatus: vi.fn(() => ({ queue: null })),
    pause: vi.fn(() => ({ queue: { status: 'paused', items: [] } })),
    resume: vi.fn(() => ({ queue: { status: 'running', items: [] } })),
    move: vi.fn(() => true),
    remove: vi.fn(() => true),
    retry: vi.fn(() => true),
    clearCompleted: vi.fn(() => 2),
    cancelActive: vi.fn(() => Promise.resolve(true)),
  };
  return {
    queue,
    createSeparationQueue: vi.fn(() => queue),
  };
}

describe('registerSeparationHandlers', () => {
  it('registers the fixed separation and queue intents', () => {
    const handlers = register();
    expect([...handlers.keys()]).toEqual([
      'separation:run',
      'separation:cancel',
      'separation:get-queue-status',
      'separation:enqueue',
      'separation:pause-queue',
      'separation:resume-queue',
      'separation:move-queue-item',
      'separation:remove-queue-item',
      'separation:retry-queue-item',
      'separation:clear-completed',
      'separation:select',
    ]);
  });

  it('routes single-track and batch requests through the same queue', async () => {
    const { queue, createSeparationQueue } = createQueueHarness();
    const requireFeatureGate = vi.fn();
    const handlers = register({ createSeparationQueue, requireFeatureGate });

    await expect(
      handlers.get('separation:run')(null, 'track-1', 'quick'),
    ).resolves.toEqual({
      stemsUrl: 'utawakui-media://track/track-1/separations/quick.wav',
    });
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, {
      trackIds: ['track-1'],
      recipeId: 'quick',
      regenerate: true,
    });
    expect(queue.waitForItem).toHaveBeenCalledWith('item-1');

    await expect(
      handlers.get('separation:enqueue')(null, {
        trackIds: ['track-2', 'track-3'],
        recipeId: 'general',
        regenerate: false,
        privatePath: 'E:\\private',
      }),
    ).resolves.toMatchObject({ itemIds: ['item-1'] });
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, {
      trackIds: ['track-2', 'track-3'],
      recipeId: 'general',
      regenerate: false,
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
  });

  it('exposes queue controls without accepting renderer execution details', async () => {
    const { queue, createSeparationQueue } = createQueueHarness();
    const requireFeatureGate = vi.fn();
    const handlers = register({ createSeparationQueue, requireFeatureGate });

    await expect(
      handlers.get('separation:get-queue-status')(),
    ).resolves.toEqual({ queue: null });
    await expect(
      handlers.get('separation:pause-queue')(),
    ).resolves.toMatchObject({ queue: { status: 'paused' } });
    await expect(
      handlers.get('separation:resume-queue')(),
    ).resolves.toMatchObject({ queue: { status: 'running' } });
    await expect(
      handlers.get('separation:move-queue-item')(null, 'item-1', -1, 'ignored'),
    ).resolves.toEqual({ moved: true });
    await expect(
      handlers.get('separation:remove-queue-item')(null, 'item-1'),
    ).resolves.toEqual({ removed: true });
    await expect(
      handlers.get('separation:retry-queue-item')(null, 'item-1'),
    ).resolves.toEqual({ retried: true });
    await expect(handlers.get('separation:clear-completed')()).resolves.toEqual(
      { removed: 2 },
    );
    await expect(handlers.get('separation:cancel')()).resolves.toEqual({
      cancelled: true,
    });

    expect(queue.move).toHaveBeenCalledWith('item-1', -1);
    expect(queue.remove).toHaveBeenCalledWith('item-1');
    expect(queue.retry).toHaveBeenCalledWith('item-1');
    expect(requireFeatureGate).toHaveBeenCalledTimes(2);
  });

  it('publishes queue progress and detects only a current on-disk result', () => {
    const onUpdate = vi.fn();
    const hasCurrentResult = vi.fn();
    const createSeparationQueue = vi.fn((dependencies) => {
      onUpdate.mockImplementation(dependencies.onUpdate);
      hasCurrentResult.mockImplementation(dependencies.hasCurrentResult);
      return createQueueHarness().queue;
    });
    const send = vi.fn();
    register({
      createSeparationQueue,
      getMainWindow: () => ({ webContents: { send } }),
      resolveSeparationsOutputDir: vi.fn(() => 'separations-dir'),
      loadStoredSeparationManifest: vi.fn(() => ({
        results: {
          general: {
            profileId: 'mdx-inst-hq4-v1',
            artifactFilename: 'general.wav',
          },
        },
      })),
      hasStoredSeparationResultFile: vi.fn(() => true),
    });

    const status = { queue: { status: 'running', items: [] } };
    onUpdate(status);
    expect(send).toHaveBeenCalledWith('separation:queue-progress', status);
    expect(hasCurrentResult({ trackId: 'track-1', recipeId: 'general' })).toBe(
      true,
    );
    expect(hasCurrentResult({ trackId: 'track-1', recipeId: 'quick' })).toBe(
      false,
    );
  });

  it('treats a gate disabled before a queued item starts as expected flow', async () => {
    let runTrack;
    const createSeparationQueue = vi.fn((dependencies) => {
      runTrack = dependencies.runTrack;
      return createQueueHarness().queue;
    });
    const recordDiagnostic = vi.fn();
    const handlers = register({
      createSeparationQueue,
      recordDiagnostic,
      requireFeatureGate: vi.fn(() => {
        throw new Error('feature gate required');
      }),
    });

    expect(handlers.has('separation:enqueue')).toBe(true);
    await expect(
      runTrack({
        trackId: 'track-1',
        recipeId: 'general',
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('feature gate required');
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('enforces the audio-processing-flow gate before running', async () => {
    const requireFeatureGate = vi.fn(() => {
      throw new Error('gate required');
    });
    const handlers = register({ requireFeatureGate });

    await expect(
      handlers.get('separation:run')(null, 'track-1'),
    ).rejects.toThrow('gate required');
    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
  });

  it('records an operational run failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = register({
      recordDiagnostic,
      // Unknown track id — the "target no longer exists" precondition,
      // triggered deep inside prepareJob(), which is exactly the kind of
      // operational failure this handler's diagnostic boundary must catch.
      findSeparationTrackRecord: vi.fn(() => null),
    });

    const promise = handlers.get('separation:run')(null, 'track-1', 'quick');
    await expect(promise).rejects.toThrow(APP_ERROR_PREFIX);

    const error = await promise.catch((err) => err);
    const payload = parseAppError(error);
    expect(payload.code).toBe('SEPARATION_RUN_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
    expect(String(payload.message)).not.toMatch(/unknown track id/);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'separation', operation: 'run' }),
    );
  });

  it('rejects an invalid track for select without recording a diagnostic', async () => {
    const recordDiagnostic = vi.fn();
    const handlers = register({
      recordDiagnostic,
      resolveSeparationsOutputDir: vi.fn(() => null),
    });

    const error = await handlers
      .get('separation:select')(null, 'track-1', 'quick')
      .catch((err) => err);

    expect(parseAppError(error).code).toBe('SEPARATION_INVALID_TRACK');
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('rejects a missing separation result for select without recording a diagnostic', async () => {
    const recordDiagnostic = vi.fn();
    const handlers = register({
      recordDiagnostic,
      resolveSeparationsOutputDir: vi.fn(() => 'separations-dir'),
      selectStoredSeparationResult: vi.fn(() => null),
    });

    const error = await handlers
      .get('separation:select')(null, 'track-1', 'quick')
      .catch((err) => err);

    expect(parseAppError(error).code).toBe('SEPARATION_RESULT_MISSING');
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, true], // no config value written yet -> default on
    [true, true],
    [false, false],
  ])(
    'threads the separationGpuAcceleration config value (%j) into the engine job as preferGpu (%j)',
    async (configValue, expectedPreferGpu) => {
      const createSeparationEngineJob = vi.fn(() => ({
        result: Promise.resolve({ stemsPath: 'C:\\stems.wav' }),
        cancel: vi.fn(),
      }));
      const heavyJobScheduler = {
        schedule: vi.fn(({ start }) => start().result),
        cancel: vi.fn(),
      };
      const handlers = register({
        getConfig: () => ({ separationGpuAcceleration: configValue }),
        heavyJobScheduler,
        createSeparationEngineJob,
        findSeparationTrackRecord: vi.fn(() => ({ id: 'track-1' })),
        resolveSeparationsOutputDir: vi.fn(() => 'separations-dir'),
        resolveSeparationInputAudioPath: vi.fn(() => 'input.mp3'),
        resolveUserDataDir: vi.fn(() => 'C:\\AppData\\Utawakui'),
      });

      await handlers.get('separation:run')(null, 'track-1', 'quick');

      expect(createSeparationEngineJob).toHaveBeenCalledWith(
        expect.objectContaining({
          workerData: expect.objectContaining({ preferGpu: expectedPreferGpu }),
        }),
      );
    },
  );

  it('selects an existing result and notifies the library', async () => {
    const notifyLibraryUpdated = vi.fn();
    const handlers = register({
      notifyLibraryUpdated,
      resolveSeparationsOutputDir: vi.fn(() => 'separations-dir'),
      selectStoredSeparationResult: vi.fn(() => ({ recipeId: 'quick' })),
    });

    await expect(
      handlers.get('separation:select')(null, 'track-1', 'quick'),
    ).resolves.toEqual({ ok: true });
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
  });
});
