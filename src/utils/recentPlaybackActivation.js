import { toPlayableTrack } from './playableTrack.js';

function resolveCurrentSourceQueue(entry, playlists, tracksById) {
  const trackId = entry?.track?.id;
  if (!trackId || typeof entry?.sourceId !== 'string') return null;

  const source = playlists.find((playlist) => playlist.id === entry.sourceId);
  if (!source || !Array.isArray(source.trackIds)) return null;
  if (!source.trackIds.includes(trackId)) return null;

  const tracks = source.trackIds
    .map((sourceTrackId) => tracksById.get(sourceTrackId))
    .filter(Boolean);
  const currentTrack = tracks.find((track) => track.id === trackId);
  if (!currentTrack) return null;

  return {
    currentTrack,
    tracks,
    sourceId: source.id,
    sourceName: typeof source.name === 'string' ? source.name : '',
  };
}

export function createRecentPlaybackActivation({
  getPlaylists,
  getTracksById,
  setQueue,
  interruptWithTrack,
  playTrack,
}) {
  return async function activateRecentEntry(entry) {
    if (!entry?.track?.id) return false;

    const sourceQueue = resolveCurrentSourceQueue(
      entry,
      getPlaylists(),
      getTracksById(),
    );
    const track = sourceQueue?.currentTrack ?? entry.track;

    if (sourceQueue) {
      setQueue(sourceQueue.tracks, track.id, {
        sourceId: sourceQueue.sourceId,
        sourceName: sourceQueue.sourceName,
      });
    } else {
      interruptWithTrack(track);
    }

    await playTrack(toPlayableTrack(track));
    return true;
  };
}
