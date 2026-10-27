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
          '曲目開始前的音訊交接未完成，請再試一次。',
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
          '必要的音訊設定未完成，請確認輸出裝置後再試一次。',
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
            ? '目前無法繼續播放，請再試一次。'
            : '目前無法播放這首曲目，請再試一次。',
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
