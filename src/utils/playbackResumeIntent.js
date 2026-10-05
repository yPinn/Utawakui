import limits from '../../shared/playbackPersistenceValues.json';

const LIMIT = limits.queueLimit;

// Main rejects oversized lists, so bound them here: keep the source window
// around the playing track and the most recent history.
function sourceWindow(tracks, anchorIds) {
  if (tracks.length <= LIMIT) return tracks;
  const anchorId = anchorIds.find((id) =>
    tracks.some((track) => track.id === id),
  );
  const anchorIndex = tracks.findIndex((track) => track.id === anchorId);
  const centered = Math.max(0, anchorIndex) - Math.floor(LIMIT / 2);
  const start = Math.min(Math.max(0, centered), tracks.length - LIMIT);
  return tracks.slice(start, start + LIMIT);
}

export function buildPlaybackResumeIntent({ playerState, queueState }) {
  if (!playerState?.track?.id) return null;
  const currentTrackId = playerState.track.id;
  const source = sourceWindow(queueState.tracks, [
    currentTrackId,
    queueState.lastSourceTrackId,
  ]);
  const sourceIds = new Set(source.map((track) => track.id));
  return {
    currentTrackId,
    positionSeconds: Math.max(0, Number(playerState.currentTime) || 0),
    volume: Number(playerState.volume),
    isMuted: Boolean(playerState.isMuted),
    playbackMode: playerState.playbackMode,
    queue: {
      sourceTrackIds: source.map((track) => track.id),
      queuedTrackIds: queueState.queuedTracks
        .slice(0, LIMIT)
        .map((track) => track.id),
      historyEntries: queueState.historyEntries.slice(-LIMIT).map((entry) => ({
        trackId: entry.track.id,
        source: entry.source,
      })),
      currentIsSource: queueState.currentIsSource,
      lastSourceTrackId: sourceIds.has(queueState.lastSourceTrackId)
        ? queueState.lastSourceTrackId
        : null,
      sourceName: queueState.sourceName,
      sourceId: queueState.sourceId,
      isShuffle: queueState.isShuffle,
      orderIds: queueState.orderIds.filter((id) => sourceIds.has(id)),
    },
  };
}

// Reactive dependencies of the persisted snapshot, by reference only. Watching
// these (instead of rebuilding the whole intent on every playback tick) keeps
// the position tick O(1); queue lists are only ever reassigned, never mutated.
export function resumeWatchSources({ playerState, queueState }) {
  return [
    playerState.track?.id,
    playerState.currentTime,
    playerState.volume,
    playerState.isMuted,
    playerState.playbackMode,
    queueState.tracks,
    queueState.queuedTracks,
    queueState.historyEntries,
    queueState.currentIsSource,
    queueState.lastSourceTrackId,
    queueState.sourceName,
    queueState.sourceId,
    queueState.isShuffle,
    queueState.orderIds,
  ];
}
