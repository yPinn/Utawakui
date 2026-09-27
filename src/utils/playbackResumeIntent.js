export function buildPlaybackResumeIntent({ playerState, queueState }) {
  if (!playerState?.track?.id) return null;
  return {
    currentTrackId: playerState.track.id,
    positionSeconds: Math.max(0, Number(playerState.currentTime) || 0),
    volume: Number(playerState.volume),
    isMuted: Boolean(playerState.isMuted),
    playbackMode: playerState.playbackMode,
    queue: {
      sourceTrackIds: queueState.tracks.map((track) => track.id),
      queuedTrackIds: queueState.queuedTracks.map((track) => track.id),
      historyEntries: queueState.historyEntries.map((entry) => ({
        trackId: entry.track.id,
        source: entry.source,
      })),
      currentIsSource: queueState.currentIsSource,
      lastSourceTrackId: queueState.lastSourceTrackId,
      sourceName: queueState.sourceName,
      sourceId: queueState.sourceId,
      isShuffle: queueState.isShuffle,
      orderIds: [...queueState.orderIds],
    },
  };
}
