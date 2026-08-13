import { computed, reactive, readonly, ref } from 'vue';
import { usePlaylists } from './usePlaylists.js';

// Module-scope singleton — SetlistView.vue and useLyrics.js (for
// LyricsWorkspace.vue) both need the raw track pool with metadata
// enrichment. Each previously owned its own listTracks() fetch and
// onLibraryUpdated subscription; those were duplicated for no independent
// reason (unlike usePlayer.js's self-healing resubscribe or
// usePlaylists.js's own cache-invalidation subscription, which each serve a
// purpose distinct from just "have the current track list").

// Raw fetch result, pre-enrichment. Kept separate from `state.tracks` (below)
// because `state.tracks` is now a computed, not a plain writable array.
const rawTracks = ref([]);

const { state: playlistState } = usePlaylists();

// Once an album has a custom cover, every member track should show it
// instead of its own individually-downloaded thumbnailUrl — an album cover
// represents every track on the album, not just the album's own hero page.
// First match wins if a track id somehow ends up in more than one album
// entry. One-directional dependency (useLibrary -> usePlaylists);
// usePlaylists.js has no dependency back on useLibrary.js, so no import cycle.
const albumCoverByTrackId = computed(() => {
  const map = new Map();
  for (const playlist of playlistState.playlists) {
    if (playlist.kind !== 'album' || !playlist.coverUrl) continue;
    for (const trackId of playlist.trackIds) {
      if (!map.has(trackId)) map.set(trackId, playlist.coverUrl);
    }
  }
  return map;
});

const enrichedTracks = computed(() =>
  rawTracks.value.map((track) => {
    const albumCoverUrl = albumCoverByTrackId.value.get(track.id);
    return albumCoverUrl && albumCoverUrl !== track.thumbnailUrl
      ? { ...track, thumbnailUrl: albumCoverUrl }
      : track;
  }),
);

// `tracks` is a computed ref assigned as a property of this reactive object
// — Vue auto-unwraps refs/computeds read through a reactive proxy, so every
// existing reader of `useLibrary().state.tracks` (SetlistView.vue,
// useLyrics.js, and everything derived from `tracksById` below: UiTrackRow,
// UiTrackThumb, SetlistPlaylistTable, PlayerBar, usePlaybackQueue.js, ...)
// transparently receives album-cover-enriched tracks with no changes needed
// on their end.
const state = reactive({
  tracks: enrichedTracks,
  isLoading: true,
  error: null,
});

let unsubscribeLibraryUpdated = null;

const tracksById = computed(
  () => new Map(state.tracks.map((track) => [track.id, track])),
);

async function refresh() {
  if (typeof window === 'undefined' || !window.Utawakui) return;
  try {
    rawTracks.value = await window.Utawakui.listTracks();
    state.error = null;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.isLoading = false;
  }
}

// Manual metadata refresh (album/releaseYear from already-downloaded
// info.json sidecars — see main.js's library:refresh-metadata handler).
// Returns the updated count so the caller can report it; no need to also
// call refresh() here, main pushes library:updated on any real change and
// the subscription below already re-fetches on that.
async function refreshMetadata() {
  if (typeof window === 'undefined' || !window.Utawakui) return 0;
  const { updated } = await window.Utawakui.refreshLibraryMetadata();
  return updated;
}

if (typeof window !== 'undefined' && window.Utawakui) {
  refresh();
  // Background metadata backfill (electron/lib/library.js's
  // runBackfillPass) pushes this after it changes something, and track
  // deletion/import elsewhere in the app does too.
  unsubscribeLibraryUpdated = window.Utawakui.onLibraryUpdated(refresh);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeLibraryUpdated?.();
  });
}

export function useLibrary() {
  return {
    state: readonly(state),
    tracksById,
    refresh,
    refreshMetadata,
  };
}
