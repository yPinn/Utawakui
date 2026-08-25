import { computed } from 'vue';

const STAGE_LABELS = Object.freeze({
  decoding: '解碼音訊',
  starting: '啟動分析模型',
  analyzing: '分析節拍與段落',
  validating: '驗證分析結果',
  complete: '分析完成',
  checking: '檢查既有 sidecar',
});

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

export function useMusicAnalysisJob(options = {}) {
  const {
    state,
    bridge,
    tracks,
    signalOwner,
    canAnalyze,
    phaseLabel,
    isBatchActive = () => false,
    refreshBatchStatus = () => Promise.resolve(null),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    statusPollIntervalMs = 1000,
  } = options;
  let unsubscribeProgress = null;
  let statusPollTimer = null;
  let disposed = false;
  let statusPollFailed = false;

  const stageLabel = computed(() => {
    const stage = state.progress?.stage;
    return stage ? (STAGE_LABELS[stage] ?? stage) : phaseLabel.value;
  });
  const progressPercent = computed(() =>
    Number.isFinite(state.progress?.percent) ? state.progress.percent : null,
  );

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

  function subscribeProgress() {
    if (!bridge || disposed || unsubscribeProgress) return;
    unsubscribeProgress =
      bridge.onTrackMusicStructureAnalysisProgress?.(handleProgress) ?? null;
  }

  function readStatus() {
    return bridge?.getTrackMusicStructureAnalysisStatus?.();
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
      (!state.activeJob && !isBatchActive()) ||
      typeof bridge?.getTrackMusicStructureAnalysisStatus !== 'function'
    ) {
      return;
    }
    statusPollTimer = setTimer(reconcileActiveJob, statusPollIntervalMs);
  }

  async function reconcileActiveJob() {
    statusPollTimer = null;
    const previousJob = state.activeJob;
    const hadActiveBatch = isBatchActive();
    if (disposed || (!previousJob && !hadActiveBatch)) return;
    try {
      const [status] = await Promise.all([
        bridge.getTrackMusicStructureAnalysisStatus(),
        hadActiveBatch ? refreshBatchStatus() : Promise.resolve(null),
      ]);
      if (disposed) return;
      if (statusPollFailed) {
        statusPollFailed = false;
        state.error = '';
      }
      if (isBatchActive()) {
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

  async function analyzeSelectedTrack() {
    if (!canAnalyze.value || !bridge?.analyzeTrackMusicStructure) return null;
    state.error = '';
    state.notice = '';
    state.progress = null;
    state.phase = 'starting';
    // Main owns the cancellable job before source hashing emits progress.
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

  function dispose() {
    disposed = true;
    clearStatusPoll();
    unsubscribeProgress?.();
    unsubscribeProgress = null;
  }

  return {
    stageLabel,
    progressPercent,
    describeError: publicErrorMessage,
    subscribeProgress,
    readStatus,
    scheduleStatusPoll,
    analyzeSelectedTrack,
    cancelAnalysis,
    dispose,
  };
}
