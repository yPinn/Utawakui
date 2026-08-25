import { computed, reactive, readonly, shallowRef } from 'vue';
import { useMusicAnalysisCapability } from './analysis/useMusicAnalysisCapability.js';
import { useMusicAnalysisJob } from './analysis/useMusicAnalysisJob.js';
import { useLibrary } from './useLibrary.js';
import { useMusicAnalysisBatch } from './useMusicAnalysisBatch.js';
import { createMusicStructureSignals } from './useMusicStructureSignals.js';

const PHASE_LABELS = Object.freeze({
  idle: '待命',
  loading: '讀取 sidecar',
  starting: '建立分析工作',
  analyzing: '分析中',
  cancelling: '正在取消',
  batch: '批次分析',
});

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

export function useMusicAnalysisWorkbench(options = {}) {
  const library = options.library ?? useLibrary();
  const signalOwner =
    options.signalOwner ??
    createMusicStructureSignals({ bridge: options.bridge });
  const bridge = resolveBridge(options.bridge);
  const capability = shallowRef(null);
  const state = reactive({
    selectedTrackId: '',
    activeJob: null,
    progress: null,
    phase: 'idle',
    error: '',
    notice: '',
    capabilityProgress: null,
    capabilityBusy: false,
    capabilityError: '',
    initialized: false,
  });

  let initializationPromise = null;
  let disposed = false;
  let batchWasActive = false;
  let lastBatchTrackId = '';

  const tracks = computed(() => library.state.tracks ?? []);
  const batch = useMusicAnalysisBatch({
    tracks,
    bridge,
    onStatusChange: applyBatchState,
  });
  const selectedTrack = computed(
    () =>
      tracks.value.find((track) => track.id === state.selectedTrackId) ?? null,
  );
  const isBusy = computed(() => state.phase !== 'idle');
  const phaseLabel = computed(() => PHASE_LABELS[state.phase] ?? state.phase);
  const capabilityOwner = useMusicAnalysisCapability({
    state,
    capability,
    bridge,
    isBatchActive: () => batch.active.value,
  });
  const capabilityReady = capabilityOwner.ready;
  const capabilityBusy = capabilityOwner.busy;
  const canAnalyze = computed(
    () =>
      state.initialized &&
      Boolean(selectedTrack.value) &&
      capabilityReady.value &&
      !capabilityBusy.value &&
      !batch.active.value &&
      !isBusy.value &&
      !state.activeJob,
  );
  const canCancel = computed(
    () => Boolean(state.activeJob) || batch.active.value,
  );
  const jobOwner = useMusicAnalysisJob({
    state,
    bridge,
    tracks,
    signalOwner,
    canAnalyze,
    phaseLabel,
    isBatchActive: () => batch.active.value,
    refreshBatchStatus: batch.refreshStatus,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    statusPollIntervalMs: options.statusPollIntervalMs,
  });

  function applyBatchState(value) {
    const isActive = ['running', 'cancelling'].includes(value?.status);
    if (isActive) {
      batchWasActive = true;
      state.notice = '';
      const activeTrackId = value.activeTrackId;
      if (
        activeTrackId &&
        tracks.value.some(({ id }) => id === activeTrackId)
      ) {
        lastBatchTrackId = activeTrackId;
        if (state.selectedTrackId !== activeTrackId) {
          state.selectedTrackId = activeTrackId;
          signalOwner.clear();
        }
        const item = value.items.find(
          ({ trackId }) => trackId === activeTrackId,
        );
        state.activeJob = {
          jobId: item?.jobId ?? '',
          trackId: activeTrackId,
        };
        state.progress = {
          jobId: item?.jobId ?? '',
          trackId: activeTrackId,
          stage: item?.stage ?? 'checking',
          ...(Number.isFinite(item?.percent) ? { percent: item.percent } : {}),
        };
      }
      state.phase = value.status === 'cancelling' ? 'cancelling' : 'batch';
      jobOwner.scheduleStatusPoll();
      return;
    }

    const shouldReload = batchWasActive && Boolean(lastBatchTrackId);
    batchWasActive = false;
    state.activeJob = null;
    state.progress = null;
    state.phase = 'idle';
    if (value) state.notice = batch.summary.value;
    if (shouldReload) {
      const trackId = lastBatchTrackId;
      lastBatchTrackId = '';
      if (tracks.value.some(({ id }) => id === trackId)) {
        state.selectedTrackId = trackId;
        void signalOwner.loadForTrack(trackId);
      }
    }
  }

  async function loadSelectedTrack() {
    if (!state.selectedTrackId) {
      signalOwner.clear();
      return null;
    }
    state.phase = 'loading';
    try {
      return await signalOwner.loadForTrack(state.selectedTrackId);
    } finally {
      if (!state.activeJob) state.phase = 'idle';
    }
  }

  async function selectTrack(trackId) {
    if (
      !state.initialized ||
      isBusy.value ||
      state.activeJob ||
      batch.active.value
    ) {
      return null;
    }
    if (!tracks.value.some((track) => track.id === trackId)) return null;
    state.selectedTrackId = trackId;
    state.error = '';
    state.notice = '';
    return loadSelectedTrack();
  }

  async function initialize() {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      state.error = '';
      jobOwner.subscribeProgress();
      capabilityOwner.subscribeProgress();
      await library.initialize();
      if (disposed) return;
      if (!bridge) {
        state.error = '目前不是 Electron renderer 環境，無法連接音樂結構分析。';
        state.initialized = true;
        return;
      }
      try {
        const [status] = await Promise.all([
          jobOwner.readStatus(),
          capabilityOwner.refreshStatus(),
          batch.initialize(),
        ]);
        if (!batch.active.value) state.activeJob = status?.activeJob ?? null;
      } catch (error) {
        state.error = jobOwner.describeError(error);
      }

      const activeTrackId =
        batch.batch.value?.activeTrackId ?? state.activeJob?.trackId;
      const initialTrackId = tracks.value.some(
        (track) => track.id === activeTrackId,
      )
        ? activeTrackId
        : tracks.value[0]?.id;
      if (initialTrackId) {
        state.selectedTrackId = initialTrackId;
        await signalOwner.loadForTrack(initialTrackId);
      }
      state.phase = batch.active.value
        ? 'batch'
        : state.activeJob
          ? 'analyzing'
          : 'idle';
      state.initialized = true;
      if (state.activeJob || batch.active.value) {
        jobOwner.scheduleStatusPoll();
      }
    })();
    return initializationPromise;
  }

  async function startBatchAnalysis({ force = false } = {}) {
    if (
      !state.initialized ||
      !capabilityReady.value ||
      capabilityBusy.value ||
      isBusy.value ||
      state.activeJob ||
      batch.active.value
    ) {
      return null;
    }
    state.error = '';
    state.notice = '';
    state.phase = 'batch';
    const result = await batch.start({ force });
    if (!result && !batch.active.value) state.phase = 'idle';
    return result;
  }

  async function cancelBatchAnalysis() {
    if (!batch.active.value) return false;
    state.phase = 'cancelling';
    return batch.cancel();
  }

  function cancelAnalysis() {
    if (batch.active.value) return cancelBatchAnalysis();
    return jobOwner.cancelAnalysis();
  }

  async function refreshSelectedTrack() {
    state.error = '';
    state.notice = '';
    return loadSelectedTrack();
  }

  async function retryLibrary() {
    state.error = '';
    state.notice = '';
    await library.refresh();
    if (!tracks.value.some((track) => track.id === state.selectedTrackId)) {
      state.selectedTrackId = tracks.value[0]?.id ?? '';
    }
    return loadSelectedTrack();
  }

  function dispose() {
    disposed = true;
    jobOwner.dispose();
    capabilityOwner.dispose();
    batch.dispose();
  }

  return {
    state: readonly(state),
    libraryState: library.state,
    tracks,
    selectedTrack,
    structure: signalOwner.current,
    capability,
    batch,
    isBusy,
    capabilityReady,
    capabilityBusy,
    canAnalyze,
    canCancel,
    phaseLabel,
    stageLabel: jobOwner.stageLabel,
    progressPercent: jobOwner.progressPercent,
    capabilityProgressPercent: capabilityOwner.progressPercent,
    capabilityStageLabel: capabilityOwner.stageLabel,
    initialize,
    selectTrack,
    analyzeSelectedTrack: jobOwner.analyzeSelectedTrack,
    startBatchAnalysis,
    cancelBatchAnalysis,
    cancelAnalysis,
    refreshSelectedTrack,
    retryLibrary,
    refreshCapabilityStatus: capabilityOwner.refreshStatus,
    prepareCapability: capabilityOwner.prepare,
    repairCapability: capabilityOwner.repair,
    removeCapability: capabilityOwner.remove,
    dispose,
  };
}
