import { computed } from 'vue';
import { usePlaylists } from './usePlaylists.js';
import { useAppView } from './useAppView.js';
import {
  albumPlaylistByTrackId,
  albumPlaylistsByTrackId,
} from '../utils/albumMembership.js';
import { useReleaseMembers } from './useReleaseMembers.js';
import { albumReferenceTitleForTrack } from '../utils/albumReference.js';
import { isArtistSourceId } from '../utils/artistPage.js';

// Combines usePlaylists.js (membership + selection) and useAppView.js (tab
// switching) so callers get one jumpToAlbum() instead of wiring both.
export function useAlbumNavigation() {
  const { state, select, selectAlbumReference, selectArtist } = usePlaylists();
  const { openLibraryContent } = useAppView();
  const releaseMembers = useReleaseMembers();

  const albumByTrackId = computed(() =>
    albumPlaylistByTrackId(state.playlists, {
      preferredCollectionId: state.selectedId,
      trackIdsForCollection: releaseMembers.displayTrackIds,
    }),
  );

  function albumForTrack(track) {
    if (!track) return null;
    return albumByTrackId.value.get(track.id) ?? null;
  }

  function canJumpToAlbum(track) {
    return Boolean(albumForTrack(track) || albumReferenceTitleForTrack(track));
  }

  // Doesn't touch playback — the queue was already snapshotted at setQueue().
  function jumpToAlbum(track) {
    const album = albumForTrack(track);
    if (album) select(album.id);
    else {
      const title = albumReferenceTitleForTrack(track);
      if (!title) return;
      selectAlbumReference(title);
    }
    openLibraryContent();
  }

  // For a caller that already has the target playlist/album id directly
  // (e.g. QueuePanel.vue's "下一首來自" section, via usePlaybackQueue's
  // sourceId) instead of deriving it from a track's album membership.
  // Queue/history sources may also be derived artist pages.
  function jumpToPlaylist(id) {
    if (!id) return;
    if (isArtistSourceId(id)) selectArtist(id);
    else select(id);
    openLibraryContent();
  }

  function jumpToArtist(id) {
    if (!isArtistSourceId(id)) return;
    selectArtist(id);
    openLibraryContent();
  }

  return {
    releasesForTrack: (track) =>
      albumPlaylistsByTrackId(state.playlists, {
        trackIdsForCollection: releaseMembers.displayTrackIds,
      }).get(track?.id) ?? [],
    albumForTrack,
    canJumpToAlbum,
    jumpToAlbum,
    jumpToArtist,
    jumpToPlaylist,
  };
}
