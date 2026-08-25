import { computed, reactive, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisJob } from './useMusicAnalysisJob.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness(options = {}) {
  const state = reactive({
    selectedTrackId: 'track-1',
    activeJob: null,
    progress: null,
    phase: 'idle',
    error: '',
    notice: '',
  });
  const tracks = shallowRef([{ id: 'track-1' }]);
  const signalOwner = {
    loadForTrack: vi.fn().mockResolvedValue(null),
    replaceCurrent: vi.fn(),
  };
  let progressListener;
  let pollCallback;
  let batchActive = false;
  const unsubscribe = vi.fn();
  const bridge = {
    getTrackMusicStructureAnalysisStatus: vi
      .fn()
      .mockResolvedValue({ activeJob: null }),
    onTrackMusicStructureAnalysisProgress: vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    }),
    analyzeTrackMusicStructure: vi
      .fn()
      .mockResolvedValue({ trackId: 'track-1' }),
    cancelTrackMusicStructureAnalysis: vi
      .fn()
      .mockResolvedValue({ cancelled: true }),
    ...options.bridge,
  };
  const setTimer = vi.fn((callback) => {
    pollCallback = callback;
    return 11;
  });
  const clearTimer = vi.fn();
  const refreshBatchStatus = vi.fn().mockResolvedValue(null);
  const owner = useMusicAnalysisJob({
    state,
    bridge,
    tracks,
    signalOwner,
    canAnalyze: shallowRef(true),
    phaseLabel: computed(() => state.phase),
    isBatchActive: () => batchActive,
    refreshBatchStatus,
    setTimer,
    clearTimer,
    statusPollIntervalMs: 5,
  });

  return {
    state,
    tracks,
    signalOwner,
    bridge,
    owner,
    progress: (payload) => progressListener?.(payload),
    poll: async () => {
      const callback = pollCallback;
      pollCallback = null;
      await callback?.();
    },
    setBatchActive: (value) => {
      batchActive = value;
    },
    setTimer,
    clearTimer,
    refreshBatchStatus,
    unsubscribe,
  };
}

describe('Music Analysis single-job owner', () => {
  it('validates progress, projects labels, and ignores events after disposal', () => {
    const harness = createHarness();
    harness.owner.subscribeProgress();
    harness.owner.subscribeProgress();

    harness.progress({ jobId: 1, trackId: 'track-1', stage: 'analyzing' });
    expect(harness.state.progress).toBeNull();
    harness.progress({
      jobId: 'job-1',
      trackId: 'unknown-track',
      stage: 'future-stage',
      percent: -5,
    });
    expect(harness.state.selectedTrackId).toBe('track-1');
    expect(harness.owner.stageLabel.value).toBe('future-stage');
    expect(harness.owner.progressPercent.value).toBe(0);
    expect(
      harness.bridge.onTrackMusicStructureAnalysisProgress,
    ).toHaveBeenCalledOnce();

    harness.owner.dispose();
    harness.progress({
      jobId: 'job-2',
      trackId: 'track-1',
      stage: 'complete',
    });
    expect(harness.state.activeJob.jobId).toBe('job-1');
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('uses fallback completion identity when no progress event arrives', async () => {
    const harness = createHarness();

    await harness.owner.analyzeSelectedTrack();

    expect(harness.signalOwner.replaceCurrent).toHaveBeenCalledWith({
      trackId: 'track-1',
    });
    expect(harness.state.progress).toEqual({
      jobId: '',
      trackId: 'track-1',
      stage: 'complete',
      percent: 100,
    });
    expect(harness.owner.stageLabel.value).toBe('分析完成');
  });

  it.each([
    ['job is already running', '已有一個音訊處理工作正在執行'],
    ['analysis cancelled', '分析工作已取消'],
    ['source unavailable', '所選曲目的音訊目前無法使用'],
    ['private failure', '音樂結構分析未完成'],
  ])('maps an analysis error containing %s', async (message, expected) => {
    const harness = createHarness();
    harness.bridge.analyzeTrackMusicStructure.mockRejectedValue(
      new Error(message),
    );

    await expect(harness.owner.analyzeSelectedTrack()).resolves.toBeNull();
    expect(harness.state.error).toContain(expected);
  });

  it('keeps a rejected cancellation bounded and the job active', async () => {
    const harness = createHarness();
    harness.state.activeJob = { jobId: 'job-1', trackId: 'track-1' };
    harness.bridge.cancelTrackMusicStructureAnalysis.mockRejectedValue(
      new Error('C:\\private\\audio.wav'),
    );

    await expect(harness.owner.cancelAnalysis()).resolves.toBe(false);

    expect(harness.state.error).toBe(
      '音樂結構分析未完成，請查看診斷記錄後再試一次。',
    );
    expect(harness.state.phase).toBe('analyzing');
  });

  it('does not apply a polling result after disposal', async () => {
    const status = deferred();
    const harness = createHarness();
    harness.state.activeJob = { jobId: 'job-1', trackId: 'track-1' };
    harness.bridge.getTrackMusicStructureAnalysisStatus.mockReturnValue(
      status.promise,
    );
    harness.owner.scheduleStatusPoll();

    const polling = harness.poll();
    harness.owner.dispose();
    status.resolve({ activeJob: null });
    await polling;

    expect(harness.state.activeJob).toEqual({
      jobId: 'job-1',
      trackId: 'track-1',
    });
  });

  it('refreshes and continues polling while batch work remains active', async () => {
    const harness = createHarness();
    harness.setBatchActive(true);
    harness.owner.scheduleStatusPoll();

    await harness.poll();

    expect(harness.refreshBatchStatus).toHaveBeenCalledOnce();
    expect(harness.setTimer).toHaveBeenCalledTimes(2);
    harness.owner.dispose();
    expect(harness.clearTimer).toHaveBeenCalledWith(11);
  });
});
