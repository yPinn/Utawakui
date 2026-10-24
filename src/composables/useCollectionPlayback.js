import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createCollectionPlaybackController } from '../utils/collectionPlaybackController.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useReleaseMembers } from './useReleaseMembers.js';
import {
  collectionForSource,
  resolveCollectionSourceId,
} from '../utils/collectionIdentity.js';
let playbackRequest = 0;
export function beginCollectionPlaybackRequest() {
  return ++playbackRequest;
}
export function isCurrentCollectionPlaybackRequest(request) {
  return request === playbackRequest;
}

export function useCollectionPlayback() {
  const {
    state: playerState,
    play,
    pause,
    playTrack,
    getPlaybackStartRequestRevision,
  } = usePlayer();
  const { state: queueState, setQueue, enqueueTrack } = usePlaybackQueue();
  const { state: playlists } = usePlaylists();

  const controller = createCollectionPlaybackController({
    playerState,
    queueState,
    play,
    pause,
    playTrack,
    setQueue,
    enqueueTrack,
    resolveSourceId: (id) => resolveCollectionSourceId(playlists.playlists, id),
  });
  const { tracksById } = useLibrary();
  const resolver = useReleaseMembers();

  async function verified(context) {
    const collection = collectionForSource(
      playlists.playlists,
      context?.sourceId,
    );
    if (
      collection?.kind !== 'album' ||
      !collection.resolvedRelease ||
      collection.releaseLibraryEpoch === undefined
    )
      return context;
    const tracks = await resolver.resolve(collection, { fresh: true });
    const allowed = new Set(tracks.map((track) => track.id));
    const requested =
      collection.requiresMembershipVerification && !context.tracks?.length
        ? tracks
        : (context.tracks ?? tracks);
    return {
      ...context,
      sourceId: collection.id,
      tracks: requested
        .filter((track) => allowed.has(track.id))
        .map((track) => tracksById.value.get(track.id))
        .filter(Boolean),
    };
  }

  async function togglePlayback(context) {
    const request = beginCollectionPlaybackRequest();
    const startRevision = getPlaybackStartRequestRevision?.();
    if (controller.isActiveSource(context?.sourceId)) {
      controller.togglePlayback({
        ...context,
        tracks: queueState.tracks?.length ? queueState.tracks : context.tracks,
      });
      return;
    }
    const next = await verified(context);
    if (
      !isCurrentCollectionPlaybackRequest(request) ||
      getPlaybackStartRequestRevision?.() !== startRevision ||
      !next?.tracks?.length
    )
      return;
    controller.togglePlayback(next);
  }

  async function enqueueCollection(context) {
    const next = await verified(context);
    if (next?.tracks?.length) controller.enqueueCollection(next);
  }
  return { ...controller, togglePlayback, enqueueCollection };
}
