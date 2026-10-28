import { computed, reactive, readonly, ref } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { usePlaylists } from './usePlaylists.js';
import { collectionDisplayTrackIds } from '../utils/albumMembership.js';

// Module-scope singleton — LibraryBrowseContent.vue and useLyrics.js (for
// LyricsAuthoringWorkspace.vue) both need the raw track pool with metadata
// enrichment. Each previously owned its own listTracks() fetch and
// onLibraryUpdated subscription; those were duplicated for no independent
// reason (unlike usePlayer.js's self-healing resubscribe or
// usePlaylists.js's own cache-invalidation subscription, which each serve a
// purpose distinct from just "have the current track list").

// Raw fetch result, pre-enrichment. Kept separate from `state.tracks` (below)
// because `state.tracks` is now a computed, not a plain writable array.
const rawTracks = ref([]);

const { state: playlistState, initialize: initializePlaylists } =
  usePlaylists();
const { recordError } = useAppDiagnostics();

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
    const memberIds = collectionDisplayTrackIds(playlist);
    for (const trackId of memberIds) {
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
// existing reader of `useLibrary().state.tracks` (LibraryBrowseContent.vue,
// useLyrics.js, and everything derived from `tracksById` below: UiTrackRow,
// UiTrackThumb, TrackTable, PlayerBar, usePlaybackQueue.js, ...)
// transparently receives album-cover-enriched tracks with no changes needed
// on their end.
const state = reactive({
  tracks: enrichedTracks,
  isLoading: true,
  isInitialized: false,
  hasLoaded: false,
  error: null,
});

let unsubscribeLibraryUpdated = null;
let initializationPromise = null;
let finishHydration = null;
let readRevision = 0;

const tracksById = computed(
  () => new Map(state.tracks.map((track) => [track.id, track])),
);

async function refresh(options) {
  const revision = ++readRevision;
  state.isLoading = !state.hasLoaded;
  if (typeof window === 'undefined' || !window.Utawakui) {
    state.isLoading = false;
    return;
  }
  try {
    const tracks = options
      ? await window.Utawakui.listTracks(options)
      : await window.Utawakui.listTracks();
    if (revision !== readRevision) return;
    rawTracks.value = tracks;
    state.hasLoaded = true;
    state.error = null;
  } catch (err) {
    if (revision !== readRevision) return;
    state.error = recordError(err, {
      code: 'LIBRARY_LIST_FAILED',
      title: '曲庫讀取失敗',
      message: '目前無法讀取曲庫，請再試一次。',
      actionLabel: '重試',
      source: 'library',
      operation: 'list',
      context: { retryable: true },
    });
  } finally {
    if (revision === readRevision) {
      state.isLoading = false;
      finishHydration?.();
      finishHydration = null;
    }
  }
}

// Each read is a full library scan in Main, so notices that land while one
// runs fold into a single follow-up read instead of one scan per notice.
let noticeRead = null;
let pendingNotice = null;

function onLibraryNotice(options) {
  const allowBackfill = options?.allowProviderBackfill !== false;
  pendingNotice = {
    allowBackfill: Boolean(pendingNotice?.allowBackfill) || allowBackfill,
  };
  noticeRead ??= (async () => {
    while (pendingNotice) {
      const { allowBackfill: allow } = pendingNotice;
      pendingNotice = null;
      await refresh(allow ? undefined : { allowProviderBackfill: false });
    }
  })().finally(() => {
    noticeRead = null;
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const playlistInitialization = initializePlaylists();
    if (typeof window !== 'undefined' && window.Utawakui) {
      unsubscribeLibraryUpdated ??=
        window.Utawakui.onLibraryUpdated(onLibraryNotice);
    }
    const initialRead = refresh();
    // The latest read settles hydration independently of the requesting
    // component's scope, including a superseding read that fails.
    const hydration = state.isLoading
      ? new Promise((resolve) => {
          finishHydration = resolve;
        })
      : initialRead;
    await Promise.all([hydration, playlistInitialization]);
    state.isInitialized = true;
  })();
  return initializationPromise;
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
    initialize,
    refresh,
  };
}
