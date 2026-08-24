import { computed, reactive, readonly, shallowRef } from 'vue';
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

const STAGE_LABELS = Object.freeze({
  decoding: '解碼音訊',
  starting: '啟動分析模型',
  analyzing: '分析節拍與段落',
  validating: '驗證分析結果',
  complete: '分析完成',
  checking: '檢查既有 sidecar',
});

const CAPABILITY_STAGE_LABELS = Object.freeze({
  starting: '準備下載',
  'downloading-runtime': '下載 Python runtime',
  'installing-runtime': '安裝 Python runtime',
  'downloading-environment': '下載分析環境',
  'installing-environment': '安裝分析環境',
  'verifying-environment': '驗證分析環境',
  'downloading-model': '下載 Beat This! 模型',
  'verifying-model': '驗證模型',
  activating: '啟用分析功能',
  ready: '分析功能已就緒',
});

function resolveBridge(bridge) {
  if (bridge) return bridge;
  if (typeof window !== 'undefined') return window.Utawakui;
  return undefined;
}

function publicErrorMessage(error) {
  const message = String(error?.message ?? '');
  if (message.includes('capability is not activated')) {
    return '尚未安裝音樂分析功能，請先完成下載與安裝。';
  }
  if (message.includes('job is already running')) {
    return '已有一個音訊處理工作正在執行，請等待完成或先取消。';
  }
  if (message.includes('cancelled')) return '分析工作已取消。';
  if (message.includes('unavailable')) return '所選曲目的音訊目前無法使用。';
  return '音樂結構分析未完成，請查看診斷記錄後再試一次。';
}

function capabilityErrorMessage(operation) {
  if (operation === 'repair') return '分析功能修復未完成，請再試一次。';
  if (operation === 'remove') return '分析功能移除未完成，請再試一次。';
  return '分析功能安裝未完成，請檢查網路連線後再試一次。';
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

  let unsubscribeProgress = null;
  let unsubscribeCapabilityProgress = null;
  let initializationPromise = null;
  let statusPollTimer = null;
  let disposed = false;
  let statusPollFailed = false;
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
  const capabilityReady = computed(
    () =>
      capability.value?.status === 'ready' &&
      capability.value?.installed === true,
  );
  const capabilityBusy = computed(() => state.capabilityBusy);
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
  const phaseLabel = computed(() => PHASE_LABELS[state.phase] ?? state.phase);
  const stageLabel = computed(() => {
    const stage = state.progress?.stage;
    return stage ? (STAGE_LABELS[stage] ?? stage) : phaseLabel.value;
  });
  const progressPercent = computed(() =>
    Number.isFinite(state.progress?.percent) ? state.progress.percent : null,
  );
  const capabilityProgressPercent = computed(() =>
    Number.isFinite(state.capabilityProgress?.percent)
      ? state.capabilityProgress.percent
      : null,
  );
  const capabilityStageLabel = computed(() => {
    const stage = state.capabilityProgress?.stage;
    if (stage) return CAPABILITY_STAGE_LABELS[stage] ?? '準備分析功能';
    if (capability.value?.status === 'ready') return '分析功能已就緒';
    if (capability.value?.status === 'damaged') return '分析功能需要修復';
    if (capability.value?.status === 'unavailable')
      return '目前無法管理分析功能';
    return '尚未安裝分析功能';
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
      scheduleStatusPoll();
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

  function handleCapabilityProgress(payload) {
    if (
      disposed ||
      !payload ||
      typeof payload.stage !== 'string' ||
      (payload.percent !== undefined && !Number.isFinite(payload.percent))
    ) {
      return;
    }
    state.capabilityProgress = {
      stage: payload.stage,
      ...(Number.isFinite(payload.percent)
        ? { percent: Math.min(100, Math.max(0, payload.percent)) }
        : {}),
    };
  }

  async function refreshCapabilityStatus() {
    if (typeof bridge?.getMusicStructureCapabilityStatus !== 'function') {
      capability.value = {
        status: 'unavailable',
        installed: false,
        busy: false,
        canPrepare: false,
        canRepair: false,
        canRemove: false,
        modelName: 'Beat This! small0',
        modelVersion: '1.1.0',
        downloadBytes: 0,
        installedBytesEstimate: 0,
      };
      return capability.value;
    }
    try {
      capability.value = await bridge.getMusicStructureCapabilityStatus();
      state.capabilityError = '';
    } catch {
      state.capabilityError = '目前無法讀取分析功能狀態，請重新啟動後再試。';
    }
    return capability.value;
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
      (!state.activeJob && !batch.active.value) ||
      typeof bridge?.getTrackMusicStructureAnalysisStatus !== 'function'
    ) {
      return;
    }
    statusPollTimer = setTimer(reconcileActiveJob, statusPollIntervalMs);
  }

  async function reconcileActiveJob() {
    statusPollTimer = null;
    const previousJob = state.activeJob;
    const hadActiveBatch = batch.active.value;
    if (disposed || (!previousJob && !hadActiveBatch)) return;
    try {
      const [status] = await Promise.all([
        bridge.getTrackMusicStructureAnalysisStatus(),
        hadActiveBatch ? batch.refreshStatus() : Promise.resolve(null),
      ]);
      if (disposed) return;
      if (statusPollFailed) {
        statusPollFailed = false;
        state.error = '';
      }
      if (batch.active.value) {
        scheduleStatusPoll();
        return;
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
      if (previousJob && state.selectedTrackId === previousJob.trackId) {
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
        unsubscribeCapabilityProgress ??=
          bridge.onMusicStructureCapabilityProgress?.(
            handleCapabilityProgress,
          ) ?? null;
      }
      await library.initialize();
      if (disposed) return;
      if (!bridge) {
        state.error = '目前不是 Electron renderer 環境，無法連接音樂結構分析。';
        state.initialized = true;
        return;
      }
      try {
        const [status] = await Promise.all([
          bridge.getTrackMusicStructureAnalysisStatus?.(),
          refreshCapabilityStatus(),
          batch.initialize(),
        ]);
        if (!batch.active.value) state.activeJob = status?.activeJob ?? null;
      } catch (error) {
        state.error = publicErrorMessage(error);
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
      if (state.activeJob || batch.active.value) scheduleStatusPoll();
    })();
    return initializationPromise;
  }

  async function runCapabilityAction(operation, bridgeMethod) {
    if (
      state.capabilityBusy ||
      batch.active.value ||
      typeof bridge?.[bridgeMethod] !== 'function'
    ) {
      return null;
    }
    state.capabilityBusy = true;
    state.capabilityError = '';
    state.capabilityProgress = { stage: 'starting', percent: 0 };
    try {
      capability.value = await bridge[bridgeMethod]();
      state.capabilityProgress = capability.value?.installed
        ? { stage: 'ready', percent: 100 }
        : null;
      return capability.value;
    } catch {
      state.capabilityError = capabilityErrorMessage(operation);
      return null;
    } finally {
      state.capabilityBusy = false;
    }
  }

  function prepareCapability() {
    return runCapabilityAction('prepare', 'prepareMusicStructureCapability');
  }

  function repairCapability() {
    return runCapabilityAction('repair', 'repairMusicStructureCapability');
  }

  function removeCapability() {
    return runCapabilityAction('remove', 'removeMusicStructureCapability');
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

  async function cancelAnalysis() {
    if (batch.active.value) return cancelBatchAnalysis();
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
    unsubscribeCapabilityProgress?.();
    unsubscribeCapabilityProgress = null;
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
    stageLabel,
    progressPercent,
    capabilityProgressPercent,
    capabilityStageLabel,
    initialize,
    selectTrack,
    analyzeSelectedTrack,
    startBatchAnalysis,
    cancelBatchAnalysis,
    cancelAnalysis,
    refreshSelectedTrack,
    retryLibrary,
    refreshCapabilityStatus,
    prepareCapability,
    repairCapability,
    removeCapability,
    dispose,
  };
}
