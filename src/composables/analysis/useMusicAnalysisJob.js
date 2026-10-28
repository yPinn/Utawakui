import { computed } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';

// Only notification ownership is shared across remounted workbenches. Main and
// the existing job/batch owners remain the authorities for work and progress.
const notificationOwners = new WeakMap();

const STAGE_LABELS = Object.freeze({
  decoding: '解碼音訊',
  starting: '啟動分析模型',
  analyzing: '分析節拍與段落',
  validating: '驗證分析結果',
  complete: '分析完成',
  checking: '檢查既有分析結果',
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
  let requestAttempt = null;
  const notifications = useAppNotifications();
  const noticeOwner = bridge
    ? (notificationOwners.get(bridge) ?? { current: null })
    : { current: null };
  if (bridge) notificationOwners.set(bridge, noticeOwner);

  function claimNotice(job, requestPending = false) {
    const current = noticeOwner.current;
    if (
      !requestPending &&
      current &&
      ((job.jobId && job.jobId === current.jobId) ||
        (!current.jobId &&
          current.requestPending &&
          job.trackId === current.trackId))
    ) {
      if (job.jobId) current.jobId = job.jobId;
      return current;
    }
    const attempt = {
      ...job,
      requestPending,
      announced: false,
      cancelled: false,
    };
    noticeOwner.current = attempt;
    return attempt;
  }

  function announce(attempt, title, message, tone = 'success') {
    if (!attempt || noticeOwner.current !== attempt || attempt.announced)
      return;
    attempt.announced = true;
    notifications.notify({
      key: NOTIFICATION_KEYS.MUSIC_ANALYSIS_RESULT,
      title,
      message,
      tone,
      lifecycle: tone === 'danger' ? 'persistent' : 'transient',
    });
  }

  function announceCancellation(attempt) {
    attempt.cancelled = true;
    announce(
      attempt,
      '分析工作已取消',
      '可重新分析或繼續查看目前結果。',
      'info',
    );
  }

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
    if (!isBatchActive()) claimNotice(progress);
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

  async function readStatus() {
    const status = await bridge?.getTrackMusicStructureAnalysisStatus?.();
    if (!disposed && status?.activeJob && !isBatchActive())
      claimNotice(status.activeJob);
    return status;
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
    const attempt =
      previousJob && !hadActiveBatch ? claimNotice(previousJob) : null;
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
      // Batch summary belongs to its panel. A direct request owns its own
      // terminal response, even when status polling sees idle first.
      if (hadActiveBatch || (attempt?.requestPending && !status?.activeJob))
        return;
      if (attempt && noticeOwner.current !== attempt) return;
      state.activeJob = status?.activeJob ?? null;
      if (state.activeJob) {
        state.phase = 'analyzing';
        scheduleStatusPoll();
        return;
      }
      state.phase = 'idle';
      state.progress = null;
      if (previousJob && state.selectedTrackId === previousJob.trackId) {
        await signalOwner.loadForTrack(previousJob.trackId);
      }
      if (!disposed)
        announce(
          attempt,
          '分析工作已結束',
          '已重新載入最新結果；若結果未更新，請再執行一次分析。',
          'info',
        );
    } catch (error) {
      if (disposed) return;
      statusPollFailed = true;
      state.error = publicErrorMessage(error);
      scheduleStatusPoll();
    }
  }

  async function analyzeSelectedTrack() {
    if (
      disposed ||
      noticeOwner.current?.requestPending ||
      !canAnalyze.value ||
      !bridge?.analyzeTrackMusicStructure
    )
      return null;
    const attempt = claimNotice(
      { jobId: '', trackId: state.selectedTrackId },
      true,
    );
    requestAttempt = attempt;
    notifications.clear(NOTIFICATION_KEYS.MUSIC_ANALYSIS_RESULT);
    state.error = '';
    state.notice = '';
    state.progress = null;
    state.phase = 'starting';
    // Main owns the cancellable job before source hashing emits progress.
    state.activeJob = { jobId: '', trackId: state.selectedTrackId };
    try {
      const result = await bridge.analyzeTrackMusicStructure(attempt.trackId);
      if (!attempt.cancelled && !disposed) {
        signalOwner.replaceCurrent(result);
        state.progress = {
          jobId: attempt.jobId,
          trackId: attempt.trackId,
          stage: 'complete',
          percent: 100,
        };
      }
      if (!attempt.cancelled) announce(attempt, '分析完成', '結果已更新。');
      return result;
    } catch (error) {
      if (
        String(error?.message ?? '').includes('cancelled') ||
        attempt.cancelled
      ) {
        announceCancellation(attempt);
      } else if (disposed) {
        announce(attempt, '分析未完成', publicErrorMessage(error), 'danger');
      } else {
        state.error = publicErrorMessage(error);
      }
      return null;
    } finally {
      clearStatusPoll();
      attempt.requestPending = false;
      if (requestAttempt === attempt) {
        requestAttempt = null;
        if (!disposed) {
          state.activeJob = null;
          state.phase = 'idle';
        }
      }
    }
  }

  async function cancelAnalysis() {
    if (
      disposed ||
      !state.activeJob ||
      !bridge?.cancelTrackMusicStructureAnalysis
    ) {
      return false;
    }
    const attempt = claimNotice(state.activeJob);
    state.error = '';
    state.notice = '';
    state.phase = 'cancelling';
    try {
      const result = await bridge.cancelTrackMusicStructureAnalysis();
      if (
        result?.cancelled &&
        noticeOwner.current === attempt &&
        (!attempt.announced || attempt.cancelled)
      ) {
        announceCancellation(attempt);
        if (disposed) return true;
        clearStatusPoll();
        state.activeJob = null;
        state.progress = null;
        await signalOwner.loadForTrack(state.selectedTrackId);
      }
      return Boolean(result?.cancelled);
    } catch (error) {
      if (!disposed && noticeOwner.current === attempt)
        state.error = publicErrorMessage(error);
      return false;
    } finally {
      if (!disposed && noticeOwner.current === attempt)
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
