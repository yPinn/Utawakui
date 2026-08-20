import { computed } from 'vue';
import { usePlaylists } from './usePlaylists.js';
import { useAppView } from './useAppView.js';
import { albumPlaylistByTrackId } from '../utils/albumMembership.js';

// Combines usePlaylists.js (membership + selection) and useAppView.js (tab
// switching) so callers get one jumpToAlbum() instead of wiring both.
export function useAlbumNavigation() {
  const { state, select } = usePlaylists();
  const { setActiveView } = useAppView();

  const albumByTrackId = computed(() =>
    albumPlaylistByTrackId(state.playlists),
  );

  function albumForTrack(track) {
    if (!track) return null;
    return albumByTrackId.value.get(track.id) ?? null;
  }

  // Doesn't touch playback — the queue was already snapshotted at setQueue().
  function jumpToAlbum(track) {
    const album = albumForTrack(track);
    if (!album) return;
    select(album.id);
    setActiveView('setlist');
  }

  // For a caller that already has the target playlist/album id directly
  // (e.g. QueuePanel.vue's "下一首來自" section, via usePlaybackQueue's
  // sourceId) instead of deriving it from a track's album membership.
  function jumpToPlaylist(id) {
    if (!id) return;
    select(id);
    setActiveView('setlist');
  }

  return { albumForTrack, jumpToAlbum, jumpToPlaylist };
}
