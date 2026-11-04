import { computed, reactive, readonly } from 'vue';
import { notificationKey } from '../constants/notificationKeys.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useAppNotifications } from './useAppNotifications.js';
import { normalizeAlbumReferenceTitle } from '../utils/albumReference.js';
import { t } from '../utils/i18n.js';

// Module-scope singleton preserves selection across tab unmounts.
// Keep playback out so this stays testable under plain Node.

const state = reactive({
  playlists: [],
  isLoading: true,
  isInitialized: false,
  hasLoaded: false,
  // null means "全部曲目" (no playlist selected, show the full library).
  selectedId: null,
  // Which Library browse mode is shown when nothing is selected —
  // 'all' | 'local'. Shared (not view-local) so the persistent
  // AppPlaylistSidebar can drive it from any tab.
  libraryView: 'all',
  // Derived artist reference page (ADR 0022); exclusive with selectedId.
  selectedArtistId: null,
  // Metadata-derived album reference; never persisted as playlist membership.
  selectedAlbumReference: null,
  error: null,
  actionError: null,
});
const { recordError } = useAppDiagnostics();
const notifications = useAppNotifications();

const ERROR_PRESENTATION = Object.freeze({
  list: {
    title: t('playlist.notify.readTitle'),
    message: t('playlist.notify.readMessage'),
  },
  create: {
    title: t('playlist.notify.createTitle'),
    message: t('playlist.notify.createMessage'),
  },
  rename: {
    title: t('playlist.notify.renameTitle'),
    message: t('playlist.notify.notSaved'),
  },
  delete: {
    title: t('playlist.notify.deleteTitle'),
    message: t('playlist.notify.deleteMessage'),
  },
  'set-kind': {
    title: t('playlist.notify.kindTitle'),
    message: t('playlist.notify.notSaved'),
  },
  'set-description': {
    title: t('playlist.notify.descriptionTitle'),
    message: t('playlist.notify.notSaved'),
  },
  'set-cover': {
    title: t('playlist.notify.setCoverTitle'),
    message: t('playlist.notify.coverNotUpdated'),
  },
  'clear-cover': {
    title: t('playlist.notify.clearCoverTitle'),
    message: t('playlist.notify.coverNotUpdated'),
  },
  'upsert-album': {
    title: t('playlist.notify.albumTitle'),
    message: t('playlist.notify.albumNotSaved'),
  },
  reorder: {
    title: t('playlist.notify.reorderTitle'),
    message: t('playlist.notify.orderNotSaved'),
  },
  'set-tracks': {
    title: t('playlist.notify.saveTitle'),
    message: t('playlist.notify.notSaved'),
  },
});

// Serialize mutations so rapid actions cannot overwrite each other.
let pending = Promise.resolve();
let unsubscribeLibraryUpdated = null;
let initializationPromise = null;
let finishHydration = null;
let readRevision = 0;

// Clear selection whenever the selected playlist disappears.
function applyPlaylists(playlists) {
  state.playlists = playlists;
  if (
    state.selectedId !== null &&
    !playlists.some((p) => p.id === state.selectedId)
  ) {
    state.selectedId =
      playlists.find((p) => p.redirectedIds?.includes(state.selectedId))?.id ??
      null;
  }
}

const UNKNOWN_ERROR = Object.freeze({
  title: t('playlist.notify.operationTitle'),
  message: t('playlist.notify.operationMessage'),
});

function formatError(operation, err) {
  const { title, message } = ERROR_PRESENTATION[operation] ?? UNKNOWN_ERROR;
  return recordError(err, {
    code: `PLAYLIST_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title,
    message,
    source: 'playlists',
    operation,
    context: { retryable: true },
  }).message;
}

function enqueue(
  operation,
  errorOperation,
  { read = false, isCurrent = null, onError = null } = {},
) {
  if (typeof window === 'undefined' || !window.Utawakui) {
    return Promise.resolve();
  }

  const task = pending.then(async () => {
    try {
      const playlists = await operation();
      if (isCurrent && !isCurrent()) return null;
      applyPlaylists(playlists);
      if (read) state.error = null;
      else {
        state.actionError = null;
        notifications.clear(notificationKey.playlists(errorOperation));
      }
      return playlists;
    } catch (err) {
      if (isCurrent && !isCurrent()) return null;
      const message = formatError(errorOperation, err);
      if (read) state.error = message;
      else {
        state.actionError = message;
        if (!onError || onError(message) === false)
          // The title names the failure; inline surfaces keep the full sentence.
          notifications.notify({
            key: notificationKey.playlists(errorOperation),
            title: (ERROR_PRESENTATION[errorOperation] ?? UNKNOWN_ERROR).title,
            message: t('playlist.notify.tryAgain'),
            tone: 'danger',
          });
      }
      return null;
    }
  });

  pending = task;
  return pending;
}

async function refresh() {
  const revision = ++readRevision;
  state.isLoading = !state.hasLoaded;
  try {
    const result = await enqueue(
      () => window.Utawakui.listPlaylists(),
      'list',
      {
        read: true,
        isCurrent: () => revision === readRevision,
      },
    );
    if (revision === readRevision && Array.isArray(result))
      state.hasLoaded = true;
    return result;
  } finally {
    if (revision === readRevision) {
      state.isLoading = false;
      finishHydration?.();
      finishHydration = null;
    }
  }
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    if (typeof window === 'undefined' || !window.Utawakui) {
      state.isLoading = false;
      state.isInitialized = true;
      return;
    }
    // Covers two cases with one subscription: (1) another part of the app
    // changed playlists.json indirectly (track deletion cascades — see
    // main.js's library:delete-track handler), and (2) the download
    // directory changed, which main.js now also pushes this event for
    // specifically so this singleton doesn't keep serving a stale
    // directory's playlists (and worse, write them back into the new one).
    unsubscribeLibraryUpdated ??= window.Utawakui.onLibraryUpdated(refresh);
    const initialRead = refresh();
    if (state.isLoading) {
      await new Promise((resolve) => {
        finishHydration = resolve;
      });
    } else {
      await initialRead;
    }
    state.isInitialized = true;
  })();
  return initializationPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeLibraryUpdated?.();
  });
}

function select(id) {
  state.selectedId = findPlaylist(id)?.id ?? id;
  state.selectedArtistId = null;
  state.selectedAlbumReference = null;
}

function selectArtist(id) {
  state.selectedId = null;
  state.selectedArtistId = id || null;
  state.selectedAlbumReference = null;
}

function selectAlbumReference(albumTitle) {
  const title = normalizeAlbumReferenceTitle(albumTitle);
  state.selectedId = null;
  state.selectedArtistId = null;
  state.selectedAlbumReference = title || null;
}

function setLibraryView(view) {
  state.libraryView = view;
}

async function create(name) {
  const playlists = await enqueue(
    () => window.Utawakui.createPlaylist(name),
    'create',
  );
  const created = playlists?.[playlists.length - 1];
  if (created) select(created.id);
  return created ?? null;
}

async function rename(id, name, feedback) {
  return Boolean(
    await enqueue(
      () => window.Utawakui.renamePlaylist(id, name),
      'rename',
      feedback,
    ),
  );
}

async function remove(id) {
  await enqueue(() => window.Utawakui.deletePlaylist(id), 'delete');
}

// Manual escape hatch for when the automatic album/playlist heuristic
// (main.js's startup migration) guesses wrong on an existing collection.
async function setKind(id, kind) {
  await enqueue(() => window.Utawakui.setPlaylistKind(id, kind), 'set-kind');
}

async function setDescription(id, description, feedback) {
  return Boolean(
    await enqueue(
      () => window.Utawakui.setPlaylistDescription(id, description),
      'set-description',
      feedback,
    ),
  );
}

// Opens the native file picker (see main.js's playlists:choose-cover) — a
// no-op resolves back to the unchanged array, so a cancel doesn't surface
// as an error.
async function setCover(id, feedback) {
  return Boolean(
    await enqueue(
      () => window.Utawakui.choosePlaylistCover(id),
      'set-cover',
      feedback,
    ),
  );
}

async function clearCover(id, feedback) {
  return Boolean(
    await enqueue(
      () => window.Utawakui.clearPlaylistCover(id),
      'clear-cover',
      feedback,
    ),
  );
}

// Create-or-update path for album imports (see useImportSession.js's
// syncImportedPlaylist) — keyed by source on the main-process side, so
// re-importing the same album updates it in place instead of creating a
// duplicate.
async function upsertAlbum(payload) {
  const playlists = await enqueue(
    () => window.Utawakui.upsertAlbum(payload),
    'upsert-album',
  );
  return (
    playlists?.find(
      (p) =>
        p.kind === 'album' &&
        p.source?.platform === payload?.source?.platform &&
        p.source?.id === payload?.source?.id,
    ) ?? null
  );
}

function reorderPlaylist(draggedId, targetId, position = 'before') {
  if (!draggedId || !targetId || draggedId === targetId) return;
  if (
    typeof window === 'undefined' ||
    !window.Utawakui ||
    typeof window.Utawakui.reorderPlaylist !== 'function'
  ) {
    state.actionError = t('playlist.notify.restartToReorder');
    notifications.notify({
      key: notificationKey.playlists('reorder'),
      title: t('playlist.notify.reorderNotSavedTitle'),
      message: state.actionError,
      tone: 'danger',
    });
    return;
  }

  const dragged = state.playlists.find((playlist) => playlist.id === draggedId);
  if (
    !dragged ||
    !state.playlists.some((playlist) => playlist.id === targetId)
  ) {
    return;
  }

  const withoutDragged = state.playlists.filter(
    (playlist) => playlist.id !== draggedId,
  );
  const targetIndex = withoutDragged.findIndex(
    (playlist) => playlist.id === targetId,
  );
  if (targetIndex === -1) return;

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, dragged);

  if (
    next.map((playlist) => playlist.id).join('\0') ===
    state.playlists.map((playlist) => playlist.id).join('\0')
  ) {
    return;
  }

  state.playlists = next;
  enqueue(
    () => window.Utawakui.reorderPlaylist(draggedId, targetId, position),
    'reorder',
  );
}

function findPlaylist(id) {
  return state.playlists.find(
    (p) => p.id === id || p.redirectedIds?.includes(id),
  );
}

// Shared by addTrack/removeTrack/moveTrack: mutates the local array
// synchronously (the UI reflects the click at once and a rapid second click
// computes from the first's result), then enqueues the persist and the re-sync
// from the authoritative response on the `pending` chain. A no-op computeNext
// (same array reference back) skips both the local write and the IPC call, so
// addTrack on an existing member costs no round trip.
function mutateTracks(playlistId, computeNext) {
  const playlist = findPlaylist(playlistId);
  if (!playlist) return Promise.resolve(false);

  const next = computeNext(playlist.trackIds);
  if (next === playlist.trackIds) return Promise.resolve(true);
  const previousTrackIds = playlist.trackIds;
  const previousAddedAt = playlist.addedAt ?? {};
  const now = new Date().toISOString();
  const nextAddedAt = {};
  for (const trackId of next) {
    if (previousTrackIds.includes(trackId) && previousAddedAt[trackId]) {
      nextAddedAt[trackId] = previousAddedAt[trackId];
    } else if (!previousTrackIds.includes(trackId)) {
      nextAddedAt[trackId] = now;
    }
  }
  playlist.trackIds = next;
  playlist.addedAt = nextAddedAt;

  return enqueue(
    () => window.Utawakui.setPlaylistTracks(playlistId, next),
    'set-tracks',
  ).then(Boolean);
}

function addTrack(playlistId, trackId) {
  return mutateTracks(playlistId, (trackIds) =>
    trackIds.includes(trackId) ? trackIds : [...trackIds, trackId],
  );
}

// Batch version of addTrack — for "add this whole playlist/album's tracks to
// another playlist," a loop of N addTrack calls would chain N separate
// setPlaylistTracks IPC calls through the pending queue instead of one.
// De-dupes the incoming ids too: this is now a general bulk-add primitive,
// not just a caller for already-unique playlist/album trackIds.
function addTracks(playlistId, trackIds) {
  return mutateTracks(playlistId, (currentTrackIds) => {
    const additions = [...new Set(trackIds)].filter(
      (id) => !currentTrackIds.includes(id),
    );
    return additions.length > 0
      ? [...currentTrackIds, ...additions]
      : currentTrackIds;
  });
}

function removeTrack(playlistId, trackId) {
  return mutateTracks(playlistId, (trackIds) =>
    trackIds.includes(trackId)
      ? trackIds.filter((id) => id !== trackId)
      : trackIds,
  );
}

function setTracks(playlistId, trackIds) {
  return mutateTracks(playlistId, (currentTrackIds) =>
    Array.isArray(trackIds) &&
    trackIds.join('\0') !== currentTrackIds.join('\0')
      ? trackIds
      : currentTrackIds,
  );
}

// delta is +1 (down) or -1 (up); clamped at both ends — the caller (row
// action buttons) is expected to disable ↑/↓ at the boundaries rather than
// rely on this silently no-op'ing, but it's safe either way.
function moveTrack(playlistId, trackId, delta) {
  return mutateTracks(playlistId, (trackIds) => {
    const index = trackIds.indexOf(trackId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= trackIds.length) {
      return trackIds;
    }
    const next = [...trackIds];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

const selectedPlaylist = computed(
  () => state.playlists.find((p) => p.id === state.selectedId) ?? null,
);

export function usePlaylists() {
  return {
    state: readonly(state),
    initialize,
    refresh,
    selectedPlaylist,
    select,
    selectArtist,
    selectAlbumReference,
    setLibraryView,
    create,
    rename,
    remove,
    setKind,
    setDescription,
    setCover,
    clearCover,
    upsertAlbum,
    reorderPlaylist,
    addTrack,
    addTracks,
    removeTrack,
    setTracks,
    moveTrack,
  };
}
