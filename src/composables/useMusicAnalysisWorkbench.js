import { computed, reactive, readonly } from 'vue';
import { useLibrary } from './useLibrary.js';
import { createMusicStructureSignals } from './useMusicStructureSignals.js';

const PHASE_LABELS = Object.freeze({
  idle: '待命',
  loading: '讀取 sidecar',
  starting: '建立分析工作',
  analyzing: '分析中',
  cancelling: '正在取消',
});

const STAGE_LABELS = Object.freeze({
  decoding: '解碼音訊',
  starting: '啟動分析模型',
  analyzing: '分析節拍與段落',
  validating: '驗證分析結果',
  complete: '分析完成',
});

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

function publicErrorMessage(error) {
  const message = String(error?.message ?? '');
  if (message.includes('capability is not activated')) {
    return '分析 runtime／模型尚未啟用。此內部頁面不會自動下載 benchmark 模型。';
  }
  if (message.includes('job is already running')) {
    return '已有一個音訊處理工作正在執行，請等待完成或先取消。';
  }
  if (message.includes('cancelled')) return '分析工作已取消。';
  if (message.includes('unavailable')) return '所選曲目的音訊目前無法使用。';
  return '音樂結構分析未完成，請查看診斷記錄後再試一次。';
}

function normalizedProgress(payload) {
  if (
    !payload ||
    typeof payload.jobId !== 'string' ||
    typeof payload.trackId !== 'string' ||
    typeof payload.stage !== 'string'
  ) {
    return null;
  }
  return {
    jobId: payload.jobId,
    trackId: payload.trackId,
    stage: payload.stage,
    ...(Number.isFinite(payload.percent)
      ? { percent: Math.min(100, Math.max(0, payload.percent)) }
      : {}),
  };
}

export function useMusicAnalysisWorkbench(options = {}) {
  const library = options.library ?? useLibrary();
  const signalOwner =
    options.signalOwner ??
    createMusicStructureSignals({ bridge: options.bridge });
  const bridge = resolveBridge(options.bridge);
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const statusPollIntervalMs = options.statusPollIntervalMs ?? 1000;
  const state = reactive({
    selectedTrackId: '',
    activeJob: null,
    progress: null,
    phase: 'idle',
    error: '',
    notice: '',
    initialized: false,
  });

  let unsubscribeProgress = null;
  let initializationPromise = null;
  let statusPollTimer = null;
  let disposed = false;
  let statusPollFailed = false;

  const tracks = computed(() => library.state.tracks ?? []);
  const selectedTrack = computed(
    () =>
      tracks.value.find((track) => track.id === state.selectedTrackId) ?? null,
  );
  const isBusy = computed(() => state.phase !== 'idle');
  const canAnalyze = computed(
    () =>
      state.initialized &&
      Boolean(selectedTrack.value) &&
      !isBusy.value &&
      !state.activeJob,
  );
  const canCancel = computed(() => Boolean(state.activeJob));
  const phaseLabel = computed(() => PHASE_LABELS[state.phase] ?? state.phase);
  const stageLabel = computed(() => {
    const stage = state.progress?.stage;
    return stage ? (STAGE_LABELS[stage] ?? stage) : phaseLabel.value;
  });
  const progressPercent = computed(() =>
    Number.isFinite(state.progress?.percent) ? state.progress.percent : null,
  );

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
    if (!state.initialized || isBusy.value || state.activeJob) return null;
    if (!tracks.value.some((track) => track.id === trackId)) return null;
    state.selectedTrackId = trackId;
    state.error = '';
    state.notice = '';
    return loadSelectedTrack();
  }

  function handleProgress(payload) {
    if (disposed) return;
    const progress = normalizedProgress(payload);
    if (!progress) return;
    state.activeJob = {
      jobId: progress.jobId,
      trackId: progress.trackId,
    };
    state.progress = progress;
    state.phase = 'analyzing';
    state.notice = '';
    if (tracks.value.some((track) => track.id === progress.trackId)) {
      state.selectedTrackId = progress.trackId;
    }
    scheduleStatusPoll();
  }

  function clearStatusPoll() {
    if (statusPollTimer === null) return;
    clearTimer(statusPollTimer);
    statusPollTimer = null;
  }

  function scheduleStatusPoll() {
    if (
      disposed ||
      statusPollTimer !== null ||
      !state.activeJob ||
      typeof bridge?.getTrackMusicStructureAnalysisStatus !== 'function'
    ) {
      return;
    }
    statusPollTimer = setTimer(reconcileActiveJob, statusPollIntervalMs);
  }

  async function reconcileActiveJob() {
    statusPollTimer = null;
    const previousJob = state.activeJob;
    if (disposed || !previousJob) return;
    try {
      const status = await bridge.getTrackMusicStructureAnalysisStatus();
      if (disposed) return;
      if (statusPollFailed) {
        statusPollFailed = false;
        state.error = '';
      }
      state.activeJob = status?.activeJob ?? null;
      if (state.activeJob) {
        state.phase = 'analyzing';
        scheduleStatusPoll();
        return;
      }
      state.phase = 'idle';
      state.progress = null;
      state.notice =
        '接手的分析工作已結束並重新讀取 sidecar；目前狀態 API 無法判定完成、失敗或取消。';
      if (state.selectedTrackId === previousJob.trackId) {
        await signalOwner.loadForTrack(previousJob.trackId);
      }
    } catch (error) {
      if (disposed) return;
      statusPollFailed = true;
      state.error = publicErrorMessage(error);
      scheduleStatusPoll();
    }
  }

  async function initialize() {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      state.error = '';
      if (bridge && !disposed) {
        unsubscribeProgress ??=
          bridge.onTrackMusicStructureAnalysisProgress?.(handleProgress) ??
          null;
      }
      await library.initialize();
      if (disposed) return;
      if (!bridge) {
        state.error = '目前不是 Electron renderer 環境，無法連接音樂結構分析。';
        state.initialized = true;
        return;
      }
      try {
        const status = await bridge.getTrackMusicStructureAnalysisStatus?.();
        state.activeJob = status?.activeJob ?? null;
      } catch (error) {
        state.error = publicErrorMessage(error);
      }

      const activeTrackId = state.activeJob?.trackId;
      const initialTrackId = tracks.value.some(
        (track) => track.id === activeTrackId,
      )
        ? activeTrackId
        : tracks.value[0]?.id;
      if (initialTrackId) {
        state.selectedTrackId = initialTrackId;
        await signalOwner.loadForTrack(initialTrackId);
      }
      state.phase = state.activeJob ? 'analyzing' : 'idle';
      state.initialized = true;
      if (state.activeJob) scheduleStatusPoll();
    })();
    return initializationPromise;
  }

  async function analyzeSelectedTrack() {
    if (!canAnalyze.value || !bridge?.analyzeTrackMusicStructure) return null;
    state.error = '';
    state.notice = '';
    state.progress = null;
    state.phase = 'starting';
    // The main service owns a cancellable job before its first progress event
    // (source hashing happens first), so expose cancellation immediately.
    state.activeJob = { jobId: '', trackId: state.selectedTrackId };
    try {
      const result = await bridge.analyzeTrackMusicStructure(
        state.selectedTrackId,
      );
      signalOwner.replaceCurrent(result);
      const completedJob = state.activeJob ?? {
        jobId: '',
        trackId: state.selectedTrackId,
      };
      state.progress = {
        ...completedJob,
        stage: 'complete',
        percent: 100,
      };
      state.notice = '分析完成，sidecar 已更新。';
      return result;
    } catch (error) {
      state.error = publicErrorMessage(error);
      return null;
    } finally {
      clearStatusPoll();
      state.activeJob = null;
      state.phase = 'idle';
    }
  }

  async function cancelAnalysis() {
    if (!state.activeJob || !bridge?.cancelTrackMusicStructureAnalysis) {
      return false;
    }
    state.error = '';
    state.notice = '';
    state.phase = 'cancelling';
    try {
      const result = await bridge.cancelTrackMusicStructureAnalysis();
      if (result?.cancelled) {
        clearStatusPoll();
        state.activeJob = null;
        state.progress = null;
        await signalOwner.loadForTrack(state.selectedTrackId);
        state.notice = '分析工作已取消，已重新讀取目前 sidecar。';
      }
      return Boolean(result?.cancelled);
    } catch (error) {
      state.error = publicErrorMessage(error);
      return false;
    } finally {
      state.phase = state.activeJob ? 'analyzing' : 'idle';
    }
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
    clearStatusPoll();
    unsubscribeProgress?.();
    unsubscribeProgress = null;
  }

  return {
    state: readonly(state),
    libraryState: library.state,
    tracks,
    selectedTrack,
    structure: signalOwner.current,
    isBusy,
    canAnalyze,
    canCancel,
    phaseLabel,
    stageLabel,
    progressPercent,
    initialize,
    selectTrack,
    analyzeSelectedTrack,
    cancelAnalysis,
    refreshSelectedTrack,
    retryLibrary,
    dispose,
  };
}
