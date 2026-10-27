import { toPlayableTrack } from '../../utils/playableTrack.js';

// Refresh metadata within the current playback occurrence, never create one.
export function usePlayerLibrarySync({
  audio,
  state,
  audioGraph,
  getStartRevision,
  seek,
  reportPlayerError,
  notifyStopped,
  practiceBoundary,
  verifySource = async () => false,
}) {
  let trackSyncRevision = 0;
  async function syncCurrentTrack() {
    const trackId = state.track?.id;
    if (!trackId) return;
    const syncRevision = ++trackSyncRevision;
    const startRevision = getStartRevision();
    const playbackRevision = state.playbackRevision;
    const updated = await window.Utawakui.getTrack(trackId);
    if (
      !updated &&
      state.track?.id === trackId &&
      syncRevision === trackSyncRevision &&
      startRevision === getStartRevision() &&
      playbackRevision === state.playbackRevision
    )
      practiceBoundary?.intent('source-missing');
    if (
      !updated ||
      state.track?.id !== trackId ||
      syncRevision !== trackSyncRevision ||
      startRevision !== getStartRevision() ||
      playbackRevision !== state.playbackRevision
    )
      return;

    // Main owns media metadata; the current renderer occurrence owns this token.
    // Replacing metadata must not turn a performance request into external play.
    const playable = {
      ...toPlayableTrack(updated),
      ...(state.track.arrangementRequestId
        ? { arrangementRequestId: state.track.arrangementRequestId }
        : {}),
    };
    const urlChanged = playable.url !== state.track.url;
    const resumeTime = state.currentTime;
    const wasPlaying = state.isPlaying;
    const guideOn = state.guideVocalOn;
    const guideValue = state.guideVocalValue;
    const captureGuideOn = state.captureGuideVocalOn;
    const captureGuideValue = state.captureGuideVocalValue;

    if (
      !urlChanged &&
      !(await (practiceBoundary?.verifyMetadata(verifySource) ?? true))
    )
      return;
    const preparing = urlChanged
      ? practiceBoundary?.prepareSourceChange(verifySource)
      : null;
    const preparedRevision = getStartRevision();
    const transfer = await preparing;
    if (
      syncRevision !== trackSyncRevision ||
      preparedRevision !== getStartRevision() ||
      state.track?.id !== trackId ||
      playbackRevision !== state.playbackRevision
    )
      return;

    state.track = playable;
    if (!urlChanged) return;

    audioGraph.routeAudioGraph(Boolean(playable.usesSeparatedAudio));
    audio.src = playable.url;
    audioGraph.restoreGuideVocalState(guideOn, guideValue);
    audioGraph.restoreCaptureGuideVocalState(captureGuideOn, captureGuideValue);
    if (!transfer) seek(resumeTime);
    const resumeAllowed = transfer
      ? await practiceBoundary.completeSourceChange(transfer)
      : true;
    if (wasPlaying && resumeAllowed) {
      const requestRevision = getStartRevision();
      try {
        const result = await audioGraph.resume({
          isCurrent: () =>
            requestRevision === getStartRevision() &&
            syncRevision === trackSyncRevision &&
            playbackRevision === state.playbackRevision &&
            state.track?.id === trackId,
        });
        if (
          requestRevision !== getStartRevision() ||
          syncRevision !== trackSyncRevision
        )
          return;
        if (!audioGraph.isPlaybackReady(result))
          throw new Error('Audio preparation incomplete');
        await audio.play();
      } catch (error) {
        if (
          requestRevision !== getStartRevision() ||
          syncRevision !== trackSyncRevision ||
          playbackRevision !== state.playbackRevision ||
          state.track?.id !== trackId
        )
          return;
        state.error = reportPlayerError(
          error,
          'reload',
          '播放版本已更新，請重新播放。',
        );
        state.isPlaying = false;
        state.playbackPhase = 'error';
        notifyStopped('error');
      }
    }
  }

  return syncCurrentTrack;
}
