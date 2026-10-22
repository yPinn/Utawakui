import { computed, onMounted, onUnmounted, reactive, shallowRef } from 'vue';
import { nextLyricsBoundaryDelayMs } from '../../shared/presentation/state.mjs';
import { normalizePerformerReadingScale } from '../../shared/performerViewContract.mjs';
import { selectPerformerFrame } from '../../shared/presentation/performerFrame.mjs';
import { normalizeAppError } from '../utils/appErrors.js';

export function usePerformerViewState() {
  const snapshot = shallowRef(null);
  const clockNow = shallowRef(Date.now());
  const windowState = reactive({
    open: true,
    fullScreen: false,
    alwaysOnTop: false,
  });
  const error = shallowRef('');
  const readingScale = shallowRef('desk');
  const controlPending = shallowRef(false);
  let controlRequests = 0;
  let playbackPending = false;

  let boundaryTimer = null;
  let displayBoundaryTimer = null;
  function setDisplayBoundary(delay) {
    clearTimeout(displayBoundaryTimer);
    displayBoundaryTimer = null;
    if (
      snapshot.value?.state?.playback?.status !== 'playing' ||
      !Number.isFinite(delay) ||
      delay < 0
    )
      return;
    displayBoundaryTimer = setTimeout(() => {
      clockNow.value = Date.now();
      scheduleBoundary();
    }, delay + 1);
  }
  let unsubscribeSnapshot = null;
  let unsubscribeWindowState = null;

  const frame = computed(() =>
    selectPerformerFrame(snapshot.value, { nowMs: clockNow.value }),
  );

  function bridgeMethod(name) {
    const method = window.UtawakuiPerformer?.[name];
    if (typeof method !== 'function') {
      throw new Error('表演者畫面橋接 API 尚未載入。');
    }
    return method;
  }

  function reportError(cause, operation, message) {
    const notice = normalizeAppError(cause, {
      code: `PERFORMER_WINDOW_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
      title: '表演者畫面操作未完成',
      message,
      source: 'performer-window',
      operation,
      context: { retryable: true },
    });
    try {
      Promise.resolve(
        window.UtawakuiPerformer?.recordDiagnostic?.({
          level: 'error',
          source: 'performer-window',
          operation,
          code: notice.code,
          message: 'Performer window operation failed',
          correlationId: notice.id,
          context: { retryable: true },
        }),
      ).catch(() => {});
    } catch {
      // Diagnostics must never interrupt the performer window.
    }
    return notice.message;
  }

  function applyWindowState(value = {}) {
    windowState.open = value.open !== false;
    windowState.fullScreen = value.fullScreen === true;
    windowState.alwaysOnTop = value.alwaysOnTop === true;
  }

  function scheduleBoundary() {
    clearTimeout(boundaryTimer);
    boundaryTimer = null;
    const state = snapshot.value?.state;
    if (!state) return;
    const nowMs = Date.now();
    const delay = nextLyricsBoundaryDelayMs(state, { nowMs });
    if (delay === null) return;
    boundaryTimer = setTimeout(() => {
      clockNow.value = Date.now();
      scheduleBoundary();
    }, delay + 1);
  }

  function applySnapshot(value) {
    const nextRevision = value?.state?.revision;
    const currentRevision = snapshot.value?.state?.revision;
    if (
      Number.isSafeInteger(currentRevision) &&
      Number.isSafeInteger(nextRevision) &&
      nextRevision < currentRevision
    ) {
      return;
    }
    snapshot.value = value;
    clockNow.value = Date.now();
    scheduleBoundary();
  }

  async function runWindowCommand(name) {
    try {
      applyWindowState(await bridgeMethod(name)());
      error.value = '';
    } catch (cause) {
      error.value = reportError(
        cause,
        name,
        '目前無法完成視窗操作，請再試一次。',
      );
    }
  }

  async function setReadingScale(value) {
    const nextScale = normalizePerformerReadingScale(value);
    const previousScale = readingScale.value;
    readingScale.value = nextScale;
    try {
      readingScale.value = normalizePerformerReadingScale(
        await bridgeMethod('setReadingScale')(nextScale),
      );
      error.value = '';
      return true;
    } catch (cause) {
      readingScale.value = previousScale;
      error.value = reportError(
        cause,
        'set-reading-scale',
        '閱讀距離設定未儲存，請再試一次。',
      );
      return false;
    }
  }

  async function adjustLyricsOffset(action) {
    const displayedFrame = frame.value;
    if (!displayedFrame.trackId) return false;
    try {
      const accepted = await bridgeMethod('adjustLyricsOffset')({
        action,
        revision: displayedFrame.revision,
        trackId: displayedFrame.trackId,
      });
      if (accepted !== true) {
        throw new Error('Performer lyrics context is stale');
      }
      error.value = '';
      return true;
    } catch (cause) {
      error.value = reportError(
        cause,
        'adjust-lyrics-offset',
        '主控制台目前無法套用同步調整，請再試一次。',
      );
      return false;
    }
  }

  async function control(action) {
    const displayed = frame.value;
    const playbackAction = action === 'play' || action === 'pause';
    if (!displayed.trackId || (playbackAction && playbackPending)) return false;
    if (playbackAction) playbackPending = true;
    controlRequests += 1;
    controlPending.value = true;
    try {
      if (
        (await bridgeMethod('control')({
          action,
          revision: displayed.revision,
          trackId: displayed.trackId,
        })) !== true
      )
        throw new Error('Performer control context unavailable');
      error.value = '';
      return true;
    } catch (cause) {
      error.value = reportError(
        cause,
        'control',
        '主控制台目前無法完成操作，請再試一次。',
      );
      return false;
    } finally {
      controlRequests -= 1;
      controlPending.value = controlRequests > 0;
      if (playbackAction) playbackPending = false;
    }
  }

  onMounted(async () => {
    try {
      unsubscribeSnapshot = bridgeMethod('onSnapshot')(applySnapshot);
      unsubscribeWindowState = bridgeMethod('onWindowState')(applyWindowState);
      applySnapshot(await bridgeMethod('getSnapshot')());
      applyWindowState(await bridgeMethod('getWindowState')());
      readingScale.value = normalizePerformerReadingScale(
        await bridgeMethod('getReadingScale')(),
      );
    } catch (cause) {
      error.value = reportError(
        cause,
        'initialize',
        '表演者畫面初始化未完成，請重新開啟。',
      );
    }
  });

  onUnmounted(() => {
    clearTimeout(boundaryTimer);
    clearTimeout(displayBoundaryTimer);
    unsubscribeSnapshot?.();
    unsubscribeWindowState?.();
  });

  return {
    setDisplayBoundary,
    error,
    frame,
    readingScale,
    controlPending,
    control,
    windowState,
    adjustLyricsOffset,
    close: () => runWindowCommand('close'),
    minimize: () => runWindowCommand('minimize'),
    setReadingScale,
    toggleAlwaysOnTop: () => runWindowCommand('toggleAlwaysOnTop'),
    toggleFullScreen: () => runWindowCommand('toggleFullScreen'),
  };
}
