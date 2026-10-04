import { toPlayableTrack } from './playableTrack.js';

function validTracks(tracks) {
  return Array.isArray(tracks) ? tracks.filter((track) => track?.id) : [];
}

export function createCollectionPlaybackController({
  playerState,
  queueState,
  play,
  pause,
  playTrack,
  setQueue,
  toggleShuffle,
  enqueueTrack,
}) {
  function isActiveSource(sourceId) {
    return Boolean(sourceId) && queueState.sourceId === sourceId;
  }

  function isPlaying(sourceId) {
    return isActiveSource(sourceId) && playerState.isPlaying;
  }

  function isShuffleActive(sourceId) {
    return isActiveSource(sourceId) && queueState.isShuffle;
  }

  function loadCollection({ sourceId, sourceName, tracks }) {
    const members = validTracks(tracks);
    const first = members[0];
    if (!first) return null;
    setQueue(members, first.id, { sourceId, sourceName });
    return first;
  }

  function togglePlayback(collection) {
    const members = validTracks(collection?.tracks);
    if (members.length === 0) return false;
    if (isPlaying(collection.sourceId)) {
      pause();
      return true;
    }
    if (isActiveSource(collection.sourceId)) {
      play();
      return true;
    }

    const first = loadCollection({ ...collection, tracks: members });
    if (!first) return false;
    playTrack(toPlayableTrack(first));
    return true;
  }

  function toggleCollectionShuffle(collection) {
    const members = validTracks(collection?.tracks);
    if (members.length < 2) return false;
    if (isActiveSource(collection.sourceId)) {
      toggleShuffle();
      return true;
    }

    const first = loadCollection({ ...collection, tracks: members });
    if (!first) return false;
    if (!queueState.isShuffle) toggleShuffle();
    playTrack(toPlayableTrack(first));
    return true;
  }

  function enqueueCollection(collection) {
    const members = validTracks(collection?.tracks);
    for (const track of members) enqueueTrack(track);
    return members.length > 0;
  }

  return {
    isActiveSource,
    isPlaying,
    isShuffleActive,
    togglePlayback,
    toggleCollectionShuffle,
    enqueueCollection,
  };
}
