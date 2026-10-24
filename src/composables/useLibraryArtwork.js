import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';

// Feature adapters keep UiTrackRow presentation-only. Local artwork includes
// collection-cover overrides; import identity and status remain source-owned.
export function useLibraryArtwork() {
  const { tracksById } = useLibrary();
  const { state } = usePlaylists();
  function trackArtwork(track) {
    const thumbnailUrl = tracksById.value.get(track.id)?.thumbnailUrl;
    return thumbnailUrl ? { ...track, thumbnailUrl } : track;
  }
  function collectionArtwork(track, source) {
    const collection =
      source &&
      state.playlists.find(
        (entry) =>
          entry.kind === 'album' &&
          entry.source?.platform === source.platform &&
          entry.source?.id === source.id,
      );
    return collection?.coverUrl
      ? { ...track, thumbnailUrl: collection.coverUrl }
      : track;
  }
  return { trackArtwork, collectionArtwork };
}
