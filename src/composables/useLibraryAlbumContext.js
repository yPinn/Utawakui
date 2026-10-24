import { computed, watch } from 'vue';
import { deriveAlbumSupportingContent } from '../utils/albumSupportingContent.js';
import { useArtistIndex } from './useArtistIndex.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylistActions } from './usePlaylistActions.js';
import { usePlaylists } from './usePlaylists.js';
import { useReleaseMembers } from './useReleaseMembers.js';

const { state: artistIndexState } = useArtistIndex();
const { state: libraryState } = useLibrary();
const { resolvePlaylistTracks } = usePlaylistActions();
const { state: playlistState, selectedPlaylist } = usePlaylists();
const releaseMembers = useReleaseMembers();

const verificationCandidates = computed(() => {
  const selected = selectedPlaylist.value;
  if (selected?.kind === 'album')
    return selected.requiresMembershipVerification ? [selected] : [];
  const artist = artistIndexState.index?.artists?.find(
    (entry) => entry.id === playlistState.selectedArtistId,
  );
  if (!artist) return [];
  const trackIds = new Set(artist.trackIds);
  return playlistState.playlists.filter(
    (collection) =>
      collection.kind === 'album' &&
      collection.requiresMembershipVerification &&
      collection.trackIds.some((id) => trackIds.has(id)),
  );
});
watch(
  verificationCandidates,
  (collections) => {
    let next = 0;
    async function worker() {
      while (next < collections.length) {
        const collection = collections[next++];
        await releaseMembers.resolve(collection);
      }
    }
    void Promise.all(
      Array.from({ length: Math.min(3, collections.length) }, worker),
    );
  },
  { immediate: true },
);
const membershipLoading = computed(() =>
  verificationCandidates.value.some((collection) =>
    releaseMembers.isPending(collection),
  ),
);

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
export function useLibraryAlbumContext() {
  return {
    albumEntries,
    albumSupportingContent,
    membershipLoading,
    membershipError: computed(() => releaseMembers.state.error),
    selectedReleaseVerification: computed(() =>
      releaseMembers.verificationState(selectedPlaylist.value),
    ),
    retrySelectedRelease: () =>
      selectedPlaylist.value
        ? releaseMembers.resolve(selectedPlaylist.value, { fresh: true })
        : Promise.resolve([]),
  };
}
