import { computed, reactive, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisJob } from './useMusicAnalysisJob.js';
import { useAppNotifications } from '../useAppNotifications.js';

const notifications = useAppNotifications();
afterEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
});

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
  const bridge = options.sharedBridge ?? {
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
  it('keeps an old queued poll from stealing a new request notification after disposal', async () => {
    const pending = deferred();
    const first = createHarness();
    first.state.activeJob = { jobId: 'old-job', trackId: 'old-track' };
    first.owner.scheduleStatusPoll();
    first.owner.dispose();
    first.bridge.analyzeTrackMusicStructure.mockReturnValue(pending.promise);
    const second = createHarness({ sharedBridge: first.bridge });
    const running = second.owner.analyzeSelectedTrack();
    await first.poll();
    pending.resolve({ trackId: 'track-1' });
    await running;
    expect(notifications.items.value[0]).toMatchObject({
      title: '分析完成',
      tone: 'success',
    });
    second.owner.dispose();
  });

  it('publishes a bounded failure if the requesting view has already left', async () => {
    let fail;
    const pending = new Promise((_, reject) => {
      fail = reject;
    });
    const harness = createHarness({
      bridge: { analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending) },
    });
    const running = harness.owner.analyzeSelectedTrack();
    harness.owner.dispose();
    fail(new Error('E:/private/audio.wav'));
    await running;
    expect(notifications.items.value[0]).toMatchObject({
      title: '分析未完成',
      tone: 'danger',
    });
    expect(JSON.stringify(notifications.items.value)).not.toContain('private');
  });

  it('does not overwrite a newer job with an old cancellation failure', async () => {
    let fail;
    const cancellation = new Promise((_, reject) => {
      fail = reject;
    });
    const pending = deferred();
    const harness = createHarness({
      bridge: {
        cancelTrackMusicStructureAnalysis: vi
          .fn()
          .mockReturnValue(cancellation),
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending.promise),
      },
    });
    harness.state.activeJob = { jobId: 'old-job', trackId: 'old-track' };
    const cancelling = harness.owner.cancelAnalysis();
    harness.state.activeJob = null;
    harness.state.phase = 'idle';
    const running = harness.owner.analyzeSelectedTrack();
    fail(new Error('old failure'));
    await cancelling;
    expect(harness.state.error).toBe('');
    expect(harness.state.phase).toBe('starting');
    pending.resolve({ trackId: 'track-1' });
    await running;
  });
  it('deduplicates the original response and a restored workbench polling the same job', async () => {
    const pending = deferred();
    const first = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending.promise),
      },
    });
    const running = first.owner.analyzeSelectedTrack();
    first.owner.dispose();
    first.bridge.getTrackMusicStructureAnalysisStatus.mockResolvedValue({
      activeJob: { jobId: 'shared-job', trackId: 'track-1' },
    });
    const restored = createHarness({ sharedBridge: first.bridge });
    const status = await restored.owner.readStatus();
    restored.state.activeJob = status.activeJob;
    restored.owner.scheduleStatusPoll();
    pending.resolve({ trackId: 'track-1' });
    await running;
    const id = notifications.items.value[0].id;
    first.bridge.getTrackMusicStructureAnalysisStatus.mockResolvedValue({
      activeJob: null,
    });
    await restored.poll();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      id,
      title: '分析完成',
    });
    expect(restored.state.activeJob).toBeNull();
    restored.owner.dispose();
  });

  it('keeps batch completion in its panel rather than duplicating it as a single-job result', async () => {
    const harness = createHarness();
    harness.state.activeJob = { jobId: 'batch-song', trackId: 'track-1' };
    harness.setBatchActive(true);
    harness.refreshBatchStatus.mockImplementation(async () => {
      harness.setBatchActive(false);
      harness.state.notice = '完成 1 首，失敗 1 首';
      harness.state.activeJob = null;
      harness.state.phase = 'idle';
    });
    harness.owner.scheduleStatusPoll();
    await harness.poll();
    expect(harness.state.notice).toBe('完成 1 首，失敗 1 首');
    expect(notifications.items.value).toHaveLength(0);
    harness.owner.dispose();
  });
  it('publishes completion after disposal without replacing a departed view result', async () => {
    const pending = deferred();
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending.promise),
      },
    });
    const running = harness.owner.analyzeSelectedTrack();
    harness.owner.dispose();
    pending.resolve({ trackId: 'track-1' });
    await running;
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      title: '分析完成',
      tone: 'success',
    });
    expect(harness.signalOwner.replaceCurrent).not.toHaveBeenCalled();
    expect(harness.state.notice).toBe('');
  });

  it('waits for the authoritative request instead of announcing polling and request completion twice', async () => {
    const pending = deferred();
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending.promise),
      },
    });
    harness.owner.subscribeProgress();
    const running = harness.owner.analyzeSelectedTrack();
    harness.progress({
      jobId: 'job-1',
      trackId: 'track-1',
      stage: 'analyzing',
    });
    await harness.poll();
    expect(notifications.items.value).toHaveLength(0);
    pending.resolve({ trackId: 'track-1' });
    await running;
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0].title).toBe('分析完成');
    expect(harness.state.notice).toBe('');
  });

  it('does not label a restored job idle status as a proven success', async () => {
    const harness = createHarness();
    harness.state.activeJob = { jobId: 'restored', trackId: 'track-1' };
    harness.owner.scheduleStatusPoll();
    await harness.poll();
    expect(notifications.items.value[0]).toMatchObject({
      title: '分析工作已結束',
      tone: 'info',
    });
    expect(notifications.items.value[0].message).toContain('若結果未更新');
    expect(harness.state.notice).toBe('');
  });

  it('clears progress when a cancelled request settles before the cancellation acknowledgement', async () => {
    let rejectAnalysis;
    const pending = new Promise((_, reject) => {
      rejectAnalysis = reject;
    });
    const acknowledgement = deferred();
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending),
        cancelTrackMusicStructureAnalysis: vi
          .fn()
          .mockReturnValue(acknowledgement.promise),
      },
    });
    harness.owner.subscribeProgress();
    const running = harness.owner.analyzeSelectedTrack();
    harness.progress({
      jobId: 'job-1',
      trackId: 'track-1',
      stage: 'analyzing',
      percent: 42,
    });
    const cancelling = harness.owner.cancelAnalysis();
    rejectAnalysis(new Error('analysis cancelled'));
    await running;
    const id = notifications.items.value[0].id;
    acknowledgement.resolve({ cancelled: true });
    await cancelling;
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      id,
      title: '分析工作已取消',
      tone: 'info',
    });
    expect(harness.state.progress).toBeNull();
    expect(harness.state.activeJob).toBeNull();
    expect(harness.state.phase).toBe('idle');
    expect(harness.signalOwner.loadForTrack).toHaveBeenCalledExactlyOnceWith(
      'track-1',
    );
  });

  it('keeps a completed analysis result when cancellation acknowledges after completion', async () => {
    const result = deferred(),
      acknowledgement = deferred();
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi.fn().mockReturnValue(result.promise),
        cancelTrackMusicStructureAnalysis: vi
          .fn()
          .mockReturnValue(acknowledgement.promise),
      },
    });
    const running = harness.owner.analyzeSelectedTrack();
    const cancelling = harness.owner.cancelAnalysis();
    result.resolve({ trackId: 'track-1' });
    await running;
    const id = notifications.items.value[0].id;
    acknowledgement.resolve({ cancelled: true });
    await cancelling;
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      id,
      title: '分析完成',
      tone: 'success',
    });
    expect(harness.state.progress?.stage).toBe('complete');
    expect(harness.signalOwner.loadForTrack).not.toHaveBeenCalled();
  });

  it('publishes one neutral cancellation when the request rejects after cancel acknowledgement', async () => {
    let reject;
    const pending = new Promise((_, fail) => {
      reject = fail;
    });
    const harness = createHarness({
      bridge: { analyzeTrackMusicStructure: vi.fn().mockReturnValue(pending) },
    });
    const running = harness.owner.analyzeSelectedTrack();
    await harness.owner.cancelAnalysis();
    const id = notifications.items.value[0]?.id;
    reject(new Error('analysis cancelled'));
    await running;
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      id,
      title: '分析工作已取消',
      tone: 'info',
      lifecycle: 'transient',
    });
    expect(harness.state.error).toBe('');
    expect(harness.state.notice).toBe('');
  });

  it('keeps analysis failures in the active workbench context', async () => {
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi
          .fn()
          .mockRejectedValue(new Error('private-path')),
      },
    });
    await harness.owner.analyzeSelectedTrack();
    expect(harness.state.error).toBe('請再試一次。');
    expect(notifications.items.value).toHaveLength(0);
  });
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
    ['source unavailable', '所選曲目的音訊目前無法使用'],
    ['private failure', '請再試一次。'],
  ])('maps an analysis error containing %s', async (message, expected) => {
    const harness = createHarness();
    harness.bridge.analyzeTrackMusicStructure.mockRejectedValue(
      new Error(message),
    );

    await expect(harness.owner.analyzeSelectedTrack()).resolves.toBeNull();
    expect(harness.state.error).toContain(expected);
  });

  it('uses an informational notification for a cancelled request without an error banner', async () => {
    const harness = createHarness({
      bridge: {
        analyzeTrackMusicStructure: vi
          .fn()
          .mockRejectedValue(new Error('analysis cancelled')),
      },
    });
    await harness.owner.analyzeSelectedTrack();
    expect(harness.state.error).toBe('');
    expect(notifications.items.value[0]).toMatchObject({
      title: '分析工作已取消',
      tone: 'info',
    });
  });

  it('keeps a rejected cancellation bounded and the job active', async () => {
    const harness = createHarness();
    harness.state.activeJob = { jobId: 'job-1', trackId: 'track-1' };
    harness.bridge.cancelTrackMusicStructureAnalysis.mockRejectedValue(
      new Error('C:\\private\\audio.wav'),
    );

    await expect(harness.owner.cancelAnalysis()).resolves.toBe(false);

    expect(harness.state.error).toBe('請再試一次。');
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
