import { computed, reactive, readonly } from 'vue';

// Module-scope singleton — SetlistView.vue and useLyrics.js (for
// LyricsWorkspace.vue) both need the raw track pool with metadata
// enrichment. Each previously owned its own listTracks() fetch and
// onLibraryUpdated subscription; those were duplicated for no independent
// reason (unlike usePlayer.js's self-healing resubscribe or
// usePlaylists.js's own cache-invalidation subscription, which each serve a
// purpose distinct from just "have the current track list").

const state = reactive({
  tracks: [],
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
    state.tracks = await window.Utawakui.listTracks();
    state.error = null;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.isLoading = false;
  }
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
  };
}
