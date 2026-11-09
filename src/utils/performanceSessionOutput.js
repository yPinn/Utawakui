import { t } from './i18n.js';
import { trackDisplayTitle } from './trackTitlePresentation.js';
// Public presentation consumes committed local progress. It never changes the
// player, grants a feature gate, or publishes unstarted arrangement drafts.
export function projectPerformanceSessionOutput({
  plan,
  current = null,
  player = {},
  tracksById,
}) {
  const items = plan?.items ?? [];
  const confirmed =
    current &&
    items.some(
      (item) => item.itemId === current.itemId && item.progress === 'playing',
    );
  const publicTrack = (item) => {
    const track = tracksById?.get(item.trackId);
    const title =
      track && item.displayTitle === track.title
        ? trackDisplayTitle(track)
        : item.displayTitle;
    return {
      id: item.trackId || item.itemId,
      title,
      artist: item.displayArtist,
    };
  };
  const track = confirmed ? publicTrack(current) : null;
  const manual = confirmed && current.mode === 'manual';
  const completedEntries = items
    .filter((item) => item.progress === 'completed')
    .sort((a, b) =>
      (a.progressUpdatedAt ?? '').localeCompare(b.progressUpdatedAt ?? ''),
    )
    .map((item) => ({ track: publicTrack(item) }));
  return {
    queue: {
      sourceName: plan?.source?.name ?? t('session.outputSourceFallback'),
      historyEntries: completedEntries,
      completedEntries,
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
