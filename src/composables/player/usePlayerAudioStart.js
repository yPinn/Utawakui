import { t } from '../../utils/i18n.js';
// Own the asynchronous graph-to-play transaction; audio events in usePlayer
// remain the only authority for actual playback timing and play state.
export function usePlayerAudioStart({
  audio,
  state,
  audioGraph,
  getStartRevision,
  reportPlayerError,
  notifyStopped,
  getBeforePlaybackStart = () => null,
  cancelPendingStart,
  play,
  pause,
  seek,
  advanceStartRevision,
  prepareControls,
  commitControls = () => {},
}) {
  let activeRevision = null;

  function cancelAudioStart(requestRevision) {
    audioGraph.cancelAudioControlApplication();
    if (activeRevision === requestRevision) notifyStopped('start-cancelled');
  }

  async function requestPlaybackStart({ trackId, requestRevision, resume }) {
    try {
      const request = {
        trackId,
        requestRevision,
        ...(resume ? { resume: true } : {}),
      };
      const allowed = await getBeforePlaybackStart()?.(request);
      if (allowed === false || requestRevision !== getStartRevision()) {
        if (requestRevision === getStartRevision()) {
          state.pendingStartTrackId = null;
          notifyStopped('start-cancelled');
        }
        return false;
      }
      return true;
    } catch (error) {
      if (requestRevision === getStartRevision()) {
        state.pendingStartTrackId = null;
        state.error = reportPlayerError(
          error,
          'pre-start',
          t('player.start.handoffFailed'),
        );
        notifyStopped('error');
      }
      return false;
    }
  }

  async function startAudio(requestRevision, operation) {
    activeRevision = requestRevision;
    const isCurrent = () => requestRevision === getStartRevision();
    try {
      const result = await audioGraph.resume({ isCurrent, operation });
      if (!isCurrent()) return false;
      if (!audioGraph.isPlaybackReady(result)) {
        state.error ||= reportPlayerError(
          new Error(
            result?.ok
              ? 'Audio readiness invalidated before play'
              : `Audio preparation ${result?.status}`,
          ),
          'audio-preparation',
          t('player.start.setupFailed'),
        );
        state.playbackPhase = 'error';
        notifyStopped('error');
        return false;
      }
      await audio.play();
      return isCurrent();
    } catch (error) {
      if (isCurrent()) {
        state.error = reportPlayerError(
          error,
          operation,
          operation === 'resume'
            ? t('player.start.resumeFailed')
            : t('player.start.playFailed'),
        );
        state.playbackPhase = 'error';
        notifyStopped('error');
      }
      return false;
    } finally {
      if (activeRevision === requestRevision) activeRevision = null;
      if (isCurrent()) state.pendingStartTrackId = null;
    }
  }

  async function restartAudio({
    useDefaults = false,
    wasPlaying = state.isPlaying,
  } = {}) {
    if (!state.track) return false;
    const track = state.track;
    pause();
    const requestRevision = advanceStartRevision();
    state.pendingStartTrackId = track.id;
    const controls = await prepareControls(track, {
      isCurrent: () => requestRevision === getStartRevision(),
      useDefaults,
      retry: (defaults) => restartAudio({ useDefaults: defaults, wasPlaying }),
    });
    if (requestRevision !== getStartRevision()) return false;
    state.pendingStartTrackId = null;
    if (!controls) return false;
    audioGraph.stageAudioControls(controls);
    commitControls();
    seek(0);
    return wasPlaying ? play() : true;
  }

  function applyAudioControls(values, { preservePlayback = false } = {}) {
    return audioGraph.applyAudioControls(values, {
      beforeApply() {
        if (preservePlayback) return;
        cancelPendingStart();
        audio.pause();
      },
    });
  }

  return {
    toggle: () => (state.isPlaying ? pause() : play()),
    startAudio,
    cancelAudioStart,
    requestPlaybackStart,
    restartAudio,
    applyAudioControls,
  };
}
