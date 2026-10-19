// Public presentation consumes committed local progress. It never changes the
// player, grants a feature gate, or publishes unstarted arrangement drafts.
export function projectPerformanceSessionOutput({
  plan,
  current = null,
  player = {},
}) {
  const items = plan?.items ?? [];
  const confirmed =
    current &&
    items.some(
      (item) => item.itemId === current.itemId && item.progress === 'playing',
    );
  const publicTrack = (item) => ({
    id: item.trackId || item.itemId,
    title: item.displayTitle,
    artist: item.displayArtist,
  });
  const track = confirmed ? publicTrack(current) : null;
  const manual = confirmed && current.mode === 'manual';
  return {
    queue: {
      sourceName: plan?.source?.name ?? '播放安排',
      historyEntries: items
        .filter((item) => item.progress === 'completed')
        .sort((a, b) =>
          (a.progressUpdatedAt ?? '').localeCompare(b.progressUpdatedAt ?? ''),
        )
        .map((item) => ({ track: publicTrack(item) })),
      currentTrack: track,
      upcomingTracks: [],
    },
    player: manual
      ? {
          track,
          playbackPhase: 'playing',
          currentTime: 0,
          duration: 0,
          tempoRate: 1,
        }
      : { ...player, track },
  };
}
