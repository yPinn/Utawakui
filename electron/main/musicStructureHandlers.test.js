import { describe, expect, it, vi } from 'vitest';
import handlersModule from './musicStructureHandlers.js';

const { registerMusicStructureHandlers } = handlersModule;

function capabilityService(overrides = {}) {
  return {
    getStatus: vi.fn(() => ({ status: 'missing', installed: false })),
    prepare: vi.fn(async () => ({ status: 'ready', installed: true })),
    repair: vi.fn(async () => ({ status: 'ready', installed: true })),
    remove: vi.fn(async () => ({ status: 'missing', installed: false })),
    ...overrides,
  };
}

function batchService(overrides = {}) {
  return {
    getStatus: vi.fn(() => ({ batch: null })),
    start: vi.fn(() => ({
      batch: { batchId: 'batch-1', status: 'running', total: 2 },
    })),
    cancel: vi.fn(async () => true),
    hasActiveBatch: vi.fn(() => false),
    ...overrides,
  };
}

describe('music-structure handlers', () => {
  it('loads a bounded main-owned projection using only the requested track id', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const loadTrackMusicStructure = vi.fn().mockReturnValue({
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M1',
        reason: 'current',
        tempo: { bpm: 120 },
        beats: [],
        sections: [],
      },
    });

    registerMusicStructureHandlers({
      ipcMain,
      getConfig: () => ({ downloadDir: 'configured' }),
      resolveDownloadDir: () => 'library-dir',
      loadMusicStructure: loadTrackMusicStructure,
      analysisService: {
        run: vi.fn(),
        cancelActiveJob: vi.fn(),
        getActiveJob: vi.fn(() => null),
      },
      capabilityService: capabilityService(),
      batchService: batchService(),
    });

    await expect(
      handlers.get('music-structure:get-track')(null, 'track-1'),
    ).resolves.toMatchObject({
      trackId: 'track-1',
      signals: { level: 'M1', reason: 'current' },
    });
    expect(loadTrackMusicStructure).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
  });

  it('starts, reports, and cancels a main-owned analysis without accepting runtime details', async () => {
    const handlers = new Map();
    const send = vi.fn();
    const analysisService = {
      run: vi.fn(async ({ trackId, onProgress }) => {
        onProgress({
          jobId: 'analysis-job-1',
          trackId,
          stage: 'analyzing',
          percent: 50,
        });
        return { trackId, signals: { level: 'M1', reason: 'current' } };
      }),
      cancelActiveJob: vi.fn(async () => true),
      getActiveJob: vi.fn(() => ({
        jobId: 'analysis-job-1',
        trackId: 'track-1',
      })),
    };
    const requireFeatureGate = vi.fn();
    registerMusicStructureHandlers({
      ipcMain: {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: () => ({ webContents: { send } }),
      notifyLibraryUpdated: vi.fn(),
      requireFeatureGate,
      featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
      analysisService,
      capabilityService: capabilityService(),
      batchService: batchService(),
    });

    await expect(
      handlers.get('music-structure:analyze-track')(null, 'track-1', {
        executablePath: 'C:\\untrusted\\python.exe',
      }),
    ).resolves.toMatchObject({ trackId: 'track-1' });
    expect(requireFeatureGate).toHaveBeenCalledWith('audio-processing-flow');
    expect(analysisService.run).toHaveBeenCalledWith({
      trackId: 'track-1',
      onProgress: expect.any(Function),
    });
    expect(send).toHaveBeenCalledWith('music-structure:analysis-progress', {
      jobId: 'analysis-job-1',
      trackId: 'track-1',
      stage: 'analyzing',
      percent: 50,
    });
    await expect(
      handlers.get('music-structure:cancel-analysis')(),
    ).resolves.toEqual({ cancelled: true });
    await expect(
      handlers.get('music-structure:get-analysis-status')(),
    ).resolves.toEqual({
      activeJob: { jobId: 'analysis-job-1', trackId: 'track-1' },
    });
  });

  it('does not expose filesystem details from analysis failures over IPC', async () => {
    const handlers = new Map();
    registerMusicStructureHandlers({
      ipcMain: {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: () => null,
      notifyLibraryUpdated: vi.fn(),
      requireFeatureGate: vi.fn(),
      featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
      analysisService: {
        run: vi.fn(async () => {
          throw new Error('EPERM: C:\\Users\\name\\private\\input.wav');
        }),
        cancelActiveJob: vi.fn(),
        getActiveJob: vi.fn(),
      },
      capabilityService: capabilityService(),
      batchService: batchService(),
    });

    await expect(
      handlers.get('music-structure:analyze-track')(null, 'track-1'),
    ).rejects.toThrow('music structure analysis failed');
    await expect(
      handlers.get('music-structure:analyze-track')(null, 'track-1'),
    ).rejects.not.toThrow(/Users|input\.wav/i);
  });

  it('exposes bounded preparation lifecycle actions and progress', async () => {
    const handlers = new Map();
    const send = vi.fn();
    const service = capabilityService({
      prepare: vi.fn(async ({ onProgress }) => {
        onProgress({ stage: 'downloading-model', percent: 91 });
        return { status: 'ready', installed: true };
      }),
    });
    const requireFeatureGate = vi.fn();
    registerMusicStructureHandlers({
      ipcMain: {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: () => ({ webContents: { send } }),
      notifyLibraryUpdated: vi.fn(),
      requireFeatureGate,
      featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
      analysisService: {
        run: vi.fn(),
        cancelActiveJob: vi.fn(),
        getActiveJob: vi.fn(),
      },
      capabilityService: service,
      batchService: batchService(),
    });

    await expect(
      handlers.get('music-structure:get-capability-status')(),
    ).resolves.toEqual({ status: 'missing', installed: false });
    await expect(
      handlers.get('music-structure:prepare-capability')(
        null,
        'https://untrusted.example/model',
      ),
    ).resolves.toEqual({ status: 'ready', installed: true });
    expect(service.prepare).toHaveBeenCalledWith({
      onProgress: expect.any(Function),
    });
    expect(send).toHaveBeenCalledWith('music-structure:capability-progress', {
      stage: 'downloading-model',
      percent: 91,
    });
    await handlers.get('music-structure:repair-capability')();
    await handlers.get('music-structure:remove-capability')();
    expect(service.repair).toHaveBeenCalledOnce();
    expect(service.remove).toHaveBeenCalledOnce();
    expect(requireFeatureGate).toHaveBeenCalledTimes(3);
  });

  it('starts, reports, progresses, and cancels a bounded batch intent', async () => {
    const handlers = new Map();
    const send = vi.fn();
    const service = batchService({
      start: vi.fn(({ trackIds, force, onUpdate }) => {
        onUpdate({
          batch: {
            batchId: 'batch-1',
            status: 'running',
            total: trackIds.length,
            force,
          },
        });
        return {
          batch: {
            batchId: 'batch-1',
            status: 'running',
            total: trackIds.length,
            force,
          },
        };
      }),
    });
    const requireFeatureGate = vi.fn();
    registerMusicStructureHandlers({
      ipcMain: {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: () => ({ webContents: { send } }),
      notifyLibraryUpdated: vi.fn(),
      requireFeatureGate,
      featureIds: { AUDIO_PROCESSING_FLOW: 'audio-processing-flow' },
      analysisService: {
        run: vi.fn(),
        cancelActiveJob: vi.fn(),
        getActiveJob: vi.fn(),
      },
      capabilityService: capabilityService(),
      batchService: service,
    });

    await expect(
      handlers.get('music-structure:start-batch')(null, {
        trackIds: ['track-1', 'track-2'],
        force: true,
        modelUrl: 'https://untrusted.example/model',
      }),
    ).resolves.toMatchObject({ batch: { batchId: 'batch-1', total: 2 } });
    expect(service.start).toHaveBeenCalledWith({
      trackIds: ['track-1', 'track-2'],
      force: true,
      onUpdate: expect.any(Function),
    });
    expect(send).toHaveBeenCalledWith('music-structure:batch-progress', {
      batch: expect.objectContaining({ batchId: 'batch-1' }),
    });
    await expect(
      handlers.get('music-structure:get-batch-status')(),
    ).resolves.toEqual({ batch: null });
    await expect(
      handlers.get('music-structure:cancel-batch')(),
    ).resolves.toEqual({ cancelled: true });
    expect(requireFeatureGate).toHaveBeenCalledOnce();
  });
});
