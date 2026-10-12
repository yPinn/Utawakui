import { computed } from 'vue';
import { deriveAlbumSupportingContent } from '../utils/albumSupportingContent.js';
import { useArtistIndex } from './useArtistIndex.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylistActions } from './usePlaylistActions.js';
import { usePlaylists } from './usePlaylists.js';

const { state: artistIndexState } = useArtistIndex();
const { state: libraryState } = useLibrary();
const { resolvePlaylistTracks } = usePlaylistActions();
const { state: playlistState, selectedPlaylist } = usePlaylists();

const albumEntries = computed(() =>
  playlistState.playlists
    .filter((playlist) => playlist.kind === 'album')
    .map((collection) => ({
      collection,
      tracks: resolvePlaylistTracks(collection),
    })),
);

const albumSupportingContent = computed(() => {
  const album = selectedPlaylist.value;
  if (album?.kind !== 'album') return null;
  return deriveAlbumSupportingContent({
    selectedAlbumId: album.id,
    selectedTracks: resolvePlaylistTracks(album),
    albumEntries: albumEntries.value,
    libraryTracks: libraryState.tracks,
    artistIndex: artistIndexState.index,
  });
});

// One module-scope read-only projection feeds both halves of the album page:
// related albums stay on the paper in LibraryBrowseContent, while the artist
// summary sits after that paper in LibraryBrowseWorkspace's Folder extension.
export function useSetlistAlbumContext() {
  return { albumEntries, albumSupportingContent };
}
