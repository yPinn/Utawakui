// Own the asynchronous graph-to-play transaction; audio events in usePlayer
// remain the only authority for actual playback timing and play state.
export function usePlayerAudioStart({
  audio,
  state,
  audioGraph,
  getStartRevision,
  reportPlayerError,
  notifyStopped,
}) {
  let activeRevision = null;

  function cancelAudioStart(requestRevision) {
    audioGraph.cancelAudioControlApplication();
    if (activeRevision === requestRevision) notifyStopped('start-cancelled');
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

  return { startAudio, cancelAudioStart };
}
