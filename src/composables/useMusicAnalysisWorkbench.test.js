import { shallowRef } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisWorkbench } from './useMusicAnalysisWorkbench.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function runningBatchStatus(overrides = {}) {
  return {
    batch: {
      batchId: 'batch-1',
      status: 'running',
      force: false,
      total: 2,
      completed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      activeTrackId: 'track-1',
      percent: 25,
      items: [
        {
          trackId: 'track-1',
          status: 'running',
          jobId: 'job-1',
          stage: 'analyzing',
          percent: 50,
        },
        { trackId: 'track-2', status: 'pending' },
      ],
      ...overrides,
    },
  };
}

function createHarness(options = {}) {
  const tracks = options.tracks ?? [
    { id: 'track-1', title: 'First song', artist: 'Singer' },
    { id: 'track-2', title: 'Second song' },
  ];
  const library = {
    state: { tracks, isLoading: false, error: null },
    initialize: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
  const signalOwner = {
    current: shallowRef(null),
    loadForTrack: vi.fn(async (trackId) => {
      const result = {
        trackId,
        sourceRevision: null,
        sourceDurationMs: null,
        signals: {
          level: 'M0',
          reason: 'missing',
          tempo: null,
          beats: [],
          sections: [],
        },
      };
      signalOwner.current.value = result;
      return result;
    }),
    replaceCurrent: vi.fn((result) => {
      signalOwner.current.value = result;
    }),
    clear: vi.fn(() => {
      signalOwner.current.value = null;
    }),
  };
  let progressListener;
  let capabilityProgressListener;
  let batchProgressListener;
  let pollCallback;
  const unsubscribe = vi.fn();
  const clearTimer = vi.fn();
  const bridge = {
    getTrackMusicStructureAnalysisStatus: vi
      .fn()
      .mockResolvedValue({ activeJob: null }),
    onTrackMusicStructureAnalysisProgress: vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    }),
    analyzeTrackMusicStructure: vi.fn(),
    cancelTrackMusicStructureAnalysis: vi
      .fn()
      .mockResolvedValue({ cancelled: true }),
    getMusicStructureCapabilityStatus: vi.fn().mockResolvedValue({
      status: 'ready',
      installed: true,
      busy: false,
      canPrepare: false,
      canRepair: true,
      canRemove: true,
      modelName: 'Beat This! small0',
      modelVersion: '1.1.0',
      downloadBytes: 159368729,
      installedBytesEstimate: 557000000,
    }),
    prepareMusicStructureCapability: vi.fn(),
    repairMusicStructureCapability: vi.fn(),
    removeMusicStructureCapability: vi.fn(),
    onMusicStructureCapabilityProgress: vi.fn((listener) => {
      capabilityProgressListener = listener;
      return vi.fn();
    }),
    getMusicStructureBatchStatus: vi.fn().mockResolvedValue({ batch: null }),
    startMusicStructureBatch: vi.fn().mockResolvedValue(runningBatchStatus()),
    cancelMusicStructureBatch: vi.fn().mockResolvedValue({ cancelled: true }),
    onMusicStructureBatchProgress: vi.fn((listener) => {
      batchProgressListener = listener;
      return vi.fn();
    }),
  };
  const workbench = useMusicAnalysisWorkbench({
    library,
    signalOwner,
    bridge,
    setTimer: vi.fn((callback) => {
      pollCallback = callback;
      return 7;
    }),
    clearTimer,
    statusPollIntervalMs: 1,
  });

  return {
    bridge,
    library,
    poll: async () => {
      const callback = pollCallback;
      pollCallback = null;
      await callback?.();
    },
    progress: (value) => progressListener?.(value),
    capabilityProgress: (value) => capabilityProgressListener?.(value),
    batchProgress: (value) => batchProgressListener?.(value),
    signalOwner,
    unsubscribe,
    clearTimer,
    workbench,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Music Analysis workbench', () => {
  it('preserves the exact public API and readonly session state shape', () => {
    const { workbench } = createHarness();

    expect(Object.keys(workbench).sort()).toEqual(
      [
        'analyzeSelectedTrack',
        'batch',
        'canAnalyze',
        'canCancel',
        'cancelAnalysis',
        'cancelBatchAnalysis',
        'capability',
        'capabilityBusy',
        'capabilityProgressPercent',
        'capabilityReady',
        'capabilityStageLabel',
        'dispose',
        'initialize',
        'isBusy',
        'libraryState',
        'phaseLabel',
        'prepareCapability',
        'progressPercent',
        'refreshCapabilityStatus',
        'refreshSelectedTrack',
        'removeCapability',
        'repairCapability',
        'retryLibrary',
        'selectTrack',
        'selectedTrack',
        'stageLabel',
        'startBatchAnalysis',
        'state',
        'structure',
        'tracks',
      ].sort(),
    );
    expect(Object.keys(workbench.state).sort()).toEqual(
      [
        'activeJob',
        'capabilityBusy',
        'capabilityError',
        'capabilityProgress',
        'error',
        'initialized',
        'notice',
        'phase',
        'progress',
        'selectedTrackId',
      ].sort(),
    );
  });

  it('initializes the library, resumes status, and selects the first track', async () => {
    const harness = createHarness();

    expect(harness.workbench.canAnalyze.value).toBe(false);

    await harness.workbench.initialize();

    expect(harness.library.initialize).toHaveBeenCalledOnce();
    expect(
      harness.bridge.onTrackMusicStructureAnalysisProgress,
    ).toHaveBeenCalledOnce();
    expect(harness.workbench.state.selectedTrackId).toBe('track-1');
    expect(harness.signalOwner.loadForTrack).toHaveBeenCalledWith('track-1');
    expect(harness.workbench.selectedTrack.value?.title).toBe('First song');
    expect(harness.workbench.canAnalyze.value).toBe(true);
    expect(harness.workbench.capability.value.status).toBe('ready');

    harness.workbench.dispose();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('prepares a missing capability and exposes bounded download progress', async () => {
    const harness = createHarness();
    const missing = {
      status: 'missing',
      installed: false,
      busy: false,
      canPrepare: true,
      canRepair: false,
      canRemove: false,
      modelName: 'Beat This! small0',
      modelVersion: '1.1.0',
      downloadBytes: 159368729,
      installedBytesEstimate: 557000000,
    };
    const ready = { ...missing, status: 'ready', installed: true };
    harness.bridge.getMusicStructureCapabilityStatus.mockResolvedValue(missing);
    harness.bridge.prepareMusicStructureCapability.mockImplementation(
      async () => {
        harness.capabilityProgress({
          stage: 'downloading-environment',
          percent: 52,
        });
        return ready;
      },
    );
    await harness.workbench.initialize();

    expect(harness.workbench.canAnalyze.value).toBe(false);
    const preparation = harness.workbench.prepareCapability();
    expect(harness.workbench.capabilityBusy.value).toBe(true);
    await preparation;

    expect(harness.workbench.capability.value).toEqual(ready);
    expect(harness.workbench.capabilityStageLabel.value).toBe('分析功能已就緒');
    expect(harness.workbench.canAnalyze.value).toBe(true);
  });

  it('keeps setup failures concise and supports repair and removal', async () => {
    const harness = createHarness();
    harness.bridge.repairMusicStructureCapability.mockRejectedValue(
      new Error('EPERM C:\\Users\\private\\runtime'),
    );
    harness.bridge.removeMusicStructureCapability.mockResolvedValue({
      status: 'missing',
      installed: false,
      busy: false,
      canPrepare: true,
      canRepair: false,
      canRemove: false,
      modelName: 'Beat This! small0',
      modelVersion: '1.1.0',
      downloadBytes: 159368729,
      installedBytesEstimate: 557000000,
    });
    await harness.workbench.initialize();

    await harness.workbench.repairCapability();
    expect(harness.workbench.state.capabilityError).toBe(
      '分析功能修復未完成，請再試一次。',
    );
    expect(harness.workbench.state.capabilityError).not.toContain('Users');

    await harness.workbench.removeCapability();
    expect(harness.workbench.capability.value.status).toBe('missing');
    expect(harness.workbench.state.capabilityProgress).toBeNull();
  });

  it('ignores invalid progress and clamps bounded progress projections', async () => {
    const harness = createHarness();
    await harness.workbench.initialize();

    harness.progress({ jobId: 'job-1', trackId: 'track-1' });
    harness.capabilityProgress({ stage: 'downloading-model', percent: NaN });
    expect(harness.workbench.state.progress).toBeNull();
    expect(harness.workbench.state.capabilityProgress).toBeNull();

    harness.progress({
      jobId: 'job-1',
      trackId: 'track-1',
      stage: 'analyzing',
      percent: 140,
    });
    harness.capabilityProgress({
      stage: 'downloading-model',
      percent: -10,
    });

    expect(harness.workbench.state.progress?.percent).toBe(100);
    expect(harness.workbench.state.capabilityProgress?.percent).toBe(0);
  });

  it('prevents concurrent capability preparation requests', async () => {
    const harness = createHarness();
    const preparation = deferred();
    harness.bridge.prepareMusicStructureCapability.mockReturnValue(
      preparation.promise,
    );
    await harness.workbench.initialize();

    const first = harness.workbench.prepareCapability();
    await expect(harness.workbench.prepareCapability()).resolves.toBeNull();

    expect(
      harness.bridge.prepareMusicStructureCapability,
    ).toHaveBeenCalledOnce();
    preparation.resolve({ status: 'ready', installed: true });
    await first;
  });

  it('uses a bounded unavailable capability when its bridge is absent', async () => {
    const harness = createHarness();
    delete harness.bridge.getMusicStructureCapabilityStatus;

    await harness.workbench.initialize();

    expect(harness.workbench.capability.value).toMatchObject({
      status: 'unavailable',
      installed: false,
      canPrepare: false,
      canRepair: false,
      canRemove: false,
    });
    expect(harness.workbench.capabilityStageLabel.value).toBe(
      '目前無法管理分析功能',
    );
  });

  it('restores an active job before falling back to the first track', async () => {
    const harness = createHarness();
    harness.bridge.getTrackMusicStructureAnalysisStatus.mockResolvedValue({
      activeJob: { jobId: 'job-7', trackId: 'track-2' },
    });

    await harness.workbench.initialize();

    expect(harness.workbench.state.selectedTrackId).toBe('track-2');
    expect(harness.workbench.state.activeJob).toEqual({
      jobId: 'job-7',
      trackId: 'track-2',
    });
    expect(harness.workbench.state.phase).toBe('analyzing');

    harness.bridge.getTrackMusicStructureAnalysisStatus.mockResolvedValue({
      activeJob: null,
    });
    await harness.poll();

    expect(harness.workbench.state.activeJob).toBeNull();
    expect(harness.workbench.state.phase).toBe('idle');
    expect(harness.workbench.state.notice).toContain('分析工作已結束');
    expect(harness.workbench.state.notice).toContain(
      '若結果未更新，請再執行一次分析',
    );
    expect(harness.workbench.state.notice).not.toMatch(/sidecar|狀態 API/iu);
    expect(harness.signalOwner.loadForTrack).toHaveBeenLastCalledWith(
      'track-2',
    );
  });

  it('restores a running batch and projects its active track into the workbench', async () => {
    const harness = createHarness();
    harness.bridge.getMusicStructureBatchStatus.mockResolvedValue(
      runningBatchStatus({ activeTrackId: 'track-2', percent: 10 }),
    );

    await harness.workbench.initialize();

    expect(harness.workbench.batch.active.value).toBe(true);
    expect(harness.workbench.state.selectedTrackId).toBe('track-2');
    expect(harness.workbench.state.activeJob).toEqual({
      jobId: '',
      trackId: 'track-2',
    });
    expect(harness.workbench.canAnalyze.value).toBe(false);
    expect(harness.workbench.canCancel.value).toBe(true);
  });

  it('starts a selected batch, handles terminal progress, and reloads its last track', async () => {
    const harness = createHarness();
    await harness.workbench.initialize();
    harness.workbench.batch.toggleTrack('track-1');
    harness.workbench.batch.toggleTrack('track-2');

    await harness.workbench.startBatchAnalysis({ force: true });

    expect(harness.bridge.startMusicStructureBatch).toHaveBeenCalledWith(
      ['track-1', 'track-2'],
      true,
    );
    expect(harness.workbench.batch.active.value).toBe(true);

    harness.batchProgress(
      runningBatchStatus({
        status: 'completed',
        force: true,
        completed: 2,
        succeeded: 1,
        skipped: 0,
        failed: 1,
        activeTrackId: null,
        percent: 100,
        items: [
          { trackId: 'track-1', status: 'completed', percent: 100 },
          {
            trackId: 'track-2',
            status: 'failed',
            reason: 'analysis-failed',
          },
        ],
      }),
    );
    await vi.waitFor(() =>
      expect(harness.signalOwner.loadForTrack).toHaveBeenLastCalledWith(
        'track-1',
      ),
    );

    expect(harness.workbench.state.phase).toBe('idle');
    expect(harness.workbench.state.notice).toBe('完成 1 首，失敗 1 首');
    expect(harness.workbench.canAnalyze.value).toBe(true);
  });

  it('clears a transient polling error after status reconciliation recovers', async () => {
    const harness = createHarness();
    harness.bridge.getTrackMusicStructureAnalysisStatus
      .mockReset()
      .mockResolvedValueOnce({
        activeJob: { jobId: 'job-8', trackId: 'track-1' },
      })
      .mockRejectedValueOnce(new Error('status temporarily unavailable'))
      .mockResolvedValueOnce({
        activeJob: { jobId: 'job-8', trackId: 'track-1' },
      });
    await harness.workbench.initialize();

    await harness.poll();
    expect(harness.workbench.state.error).not.toBe('');

    await harness.poll();
    expect(harness.workbench.state.error).toBe('');
    expect(harness.workbench.state.phase).toBe('analyzing');
  });

  it('projects progress and replaces the loaded sidecar after analysis', async () => {
    const harness = createHarness();
    const run = deferred();
    const result = {
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M2',
        reason: 'current',
        tempo: { bpm: 120, confidence: 0.9 },
        beats: [{ timeMs: 500, downbeat: true }],
        sections: [{ id: 's1', startMs: 0, endMs: 180000, role: 'chorus' }],
      },
    };
    harness.bridge.analyzeTrackMusicStructure.mockReturnValue(run.promise);
    await harness.workbench.initialize();

    const analysis = harness.workbench.analyzeSelectedTrack();
    expect(harness.workbench.state.phase).toBe('starting');
    expect(harness.workbench.canCancel.value).toBe(true);
    await harness.workbench.selectTrack('track-2');
    expect(harness.workbench.state.selectedTrackId).toBe('track-1');

    harness.progress({
      jobId: 'job-1',
      trackId: 'track-1',
      stage: 'analyzing',
      percent: 42,
    });
    expect(harness.workbench.state.phase).toBe('analyzing');
    expect(harness.workbench.state.progress).toMatchObject({
      stage: 'analyzing',
      percent: 42,
    });
    expect(harness.workbench.stageLabel.value).toBe('分析節拍與段落');

    run.resolve(result);
    await analysis;

    expect(harness.signalOwner.replaceCurrent).toHaveBeenCalledWith(result);
    expect(harness.workbench.state.phase).toBe('idle');
    expect(harness.workbench.state.activeJob).toBeNull();
    expect(harness.workbench.state.progress).toEqual({
      jobId: 'job-1',
      trackId: 'track-1',
      stage: 'complete',
      percent: 100,
    });
    expect(harness.workbench.state.notice).toBe('分析完成，結果已更新。');
  });

  it('cancels the active job and reloads the selected sidecar state', async () => {
    const harness = createHarness();
    await harness.workbench.initialize();
    harness.progress({
      jobId: 'job-2',
      trackId: 'track-1',
      stage: 'decode',
      percent: 15,
    });

    await harness.workbench.cancelAnalysis();

    expect(
      harness.bridge.cancelTrackMusicStructureAnalysis,
    ).toHaveBeenCalledOnce();
    expect(harness.signalOwner.loadForTrack).toHaveBeenLastCalledWith(
      'track-1',
    );
    expect(harness.workbench.state.phase).toBe('idle');
    expect(harness.workbench.state.activeJob).toBeNull();
    expect(harness.workbench.state.notice).toBe(
      '分析工作已取消，已重新載入目前結果。',
    );
  });

  it('explains unavailable activation without presenting it as a UI failure', async () => {
    const harness = createHarness();
    harness.bridge.analyzeTrackMusicStructure.mockRejectedValue(
      new Error('structure-analysis capability is not activated'),
    );
    await harness.workbench.initialize();

    await expect(harness.workbench.analyzeSelectedTrack()).resolves.toBeNull();

    expect(harness.workbench.state.error).toContain('尚未安裝音樂分析功能');
    expect(harness.workbench.state.phase).toBe('idle');
    expect(harness.workbench.state.activeJob).toBeNull();
  });

  it('loads the selected track and ignores unknown ids', async () => {
    const harness = createHarness();
    await harness.workbench.initialize();

    await harness.workbench.selectTrack('track-2');
    await harness.workbench.selectTrack('missing-track');

    expect(harness.workbench.state.selectedTrackId).toBe('track-2');
    expect(harness.signalOwner.loadForTrack).toHaveBeenLastCalledWith(
      'track-2',
    );
  });

  it('retries the shared library source and reloads the selected sidecar', async () => {
    const harness = createHarness();
    await harness.workbench.initialize();

    await harness.workbench.retryLibrary();

    expect(harness.library.refresh).toHaveBeenCalledOnce();
    expect(harness.signalOwner.loadForTrack).toHaveBeenLastCalledWith(
      'track-1',
    );
  });

  it('does not leave a progress listener when disposed during initialization', async () => {
    const harness = createHarness();
    const initialization = deferred();
    harness.library.initialize.mockReturnValue(initialization.promise);

    const pending = harness.workbench.initialize();
    harness.workbench.dispose();
    initialization.resolve();
    await pending;

    expect(
      harness.bridge.onTrackMusicStructureAnalysisProgress,
    ).toHaveBeenCalledOnce();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.workbench.state.initialized).toBe(false);
  });
});
