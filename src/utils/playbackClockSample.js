export function createPlaybackClockSampler(audio, state) {
  return function samplePlaybackClock({
    now = () => new Date().toISOString(),
  } = {}) {
    // Read together in one synchronous turn. Consumers must never stamp an old
    // timeupdate position with a new publication time.
    const positionMs = Math.max(0, audio.currentTime * 1000);
    const sampledAt = now();
    return {
      trackId: state.track?.id ?? null,
      playbackRevision: state.playbackRevision,
      continuityRevision: state.continuityRevision,
      positionMs: Number.isFinite(positionMs) ? positionMs : 0,
      sampledAt,
      rate: audio.playbackRate,
      phase: audio.ended
        ? 'ended'
        : audio.seeking
          ? 'seeking'
          : audio.paused && state.playbackPhase === 'playing'
            ? 'paused'
            : state.playbackPhase,
    };
  };
}
