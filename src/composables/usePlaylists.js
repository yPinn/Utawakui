import { computed, reactive, readonly } from 'vue';

// Module-scope singleton preserves selection across tab unmounts.
// Keep playback out so this stays testable under plain Node.

const state = reactive({
  playlists: [],
  // null means "全部曲目" (no playlist selected, show the full library).
  selectedId: null,
  // Which pseudo-view SetlistView shows when nothing is selected —
  // 'all' | 'local'. Shared (not view-local) so the persistent
  // AppPlaylistSidebar can drive it from any tab.
  libraryView: 'all',
  error: null,
});

// Serialize mutations so rapid actions cannot overwrite each other.
let pending = Promise.resolve();
let unsubscribeLibraryUpdated = null;
let initializationPromise = null;

// Clear selection whenever the selected playlist disappears.
function applyPlaylists(playlists) {
  state.playlists = playlists;
  if (
    state.selectedId !== null &&
    !playlists.some((p) => p.id === state.selectedId)
  ) {
    state.selectedId = null;
  }
}

function formatError(prefix, err) {
  const message = err instanceof Error ? err.message : String(err);
  return `${prefix}: ${message}`;
}

function enqueue(operation, errorPrefix, { clearErrorOnSuccess = true } = {}) {
  if (typeof window === 'undefined' || !window.Utawakui) {
    return Promise.resolve();
  }

  const task = pending.then(async () => {
    try {
      const playlists = await operation();
      applyPlaylists(playlists);
      if (clearErrorOnSuccess) state.error = null;
      return playlists;
    } catch (err) {
      state.error = formatError(errorPrefix, err);
      return null;
    }
  });

  pending = task;
  return pending;
}

function refresh() {
  return enqueue(() => window.Utawakui.listPlaylists(), '讀取歌單失敗', {
    clearErrorOnSuccess: false,
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    if (typeof window === 'undefined' || !window.Utawakui) return;
    // Covers two cases with one subscription: (1) another part of the app
    // changed playlists.json indirectly (track deletion cascades — see
    // main.js's library:delete-track handler), and (2) the download
    // directory changed, which main.js now also pushes this event for
    // specifically so this singleton doesn't keep serving a stale
    // directory's playlists (and worse, write them back into the new one).
    unsubscribeLibraryUpdated ??= window.Utawakui.onLibraryUpdated(refresh);
    await refresh();
  })();
  return initializationPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeLibraryUpdated?.();
  });
}

function select(id) {
  state.selectedId = id;
}

function setLibraryView(view) {
  state.libraryView = view;
}

async function create(name) {
  const playlists = await enqueue(
    () => window.Utawakui.createPlaylist(name),
    '建立歌單失敗',
  );
  const created = playlists?.[playlists.length - 1];
  if (created) state.selectedId = created.id;
  return created ?? null;
}

async function rename(id, name) {
  await enqueue(
    () => window.Utawakui.renamePlaylist(id, name),
    '重新命名歌單失敗',
  );
}

async function remove(id) {
  await enqueue(() => window.Utawakui.deletePlaylist(id), '刪除歌單失敗');
}

// Manual escape hatch for when the automatic album/playlist heuristic
// (main.js's startup migration) guesses wrong on an existing collection.
async function setKind(id, kind) {
  await enqueue(
    () => window.Utawakui.setPlaylistKind(id, kind),
    '轉換歌單類型失敗',
  );
}

async function setDescription(id, description) {
  await enqueue(
    () => window.Utawakui.setPlaylistDescription(id, description),
    '更新歌單說明失敗',
  );
}

// Opens the native file picker (see main.js's playlists:choose-cover) — a
// no-op resolves back to the unchanged array, so a cancel doesn't surface
// as an error.
async function setCover(id) {
  await enqueue(() => window.Utawakui.choosePlaylistCover(id), '設定封面失敗');
}

async function clearCover(id) {
  await enqueue(() => window.Utawakui.clearPlaylistCover(id), '移除封面失敗');
}

// Create-or-update path for album imports (see useImportSession.js's
// syncImportedPlaylist) — keyed by source on the main-process side, so
// re-importing the same album updates it in place instead of creating a
// duplicate.
async function upsertAlbum(payload) {
  const playlists = await enqueue(
    () => window.Utawakui.upsertAlbum(payload),
    '建立專輯歌單失敗',
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
    state.error = '播放清單排序需要重新啟動應用程式才能載入新版橋接 API。';
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
    '歌單排序儲存失敗',
  );
}

function findPlaylist(id) {
  return state.playlists.find((p) => p.id === id);
}

// Shared by addTrack/removeTrack/moveTrack: mutates the local array
// synchronously (so the UI reflects the click immediately and a second
// rapid click computes off the first click's result, not stale state),
// then enqueues the actual persist + re-sync from the authoritative
// response onto the `pending` chain. A no-op computeNext (returns the
// same array reference back) skips both the local write and the IPC call
// entirely — this is what makes addTrack on an existing member a true
// no-op instead of a wasted round trip.
function mutateTracks(playlistId, computeNext) {
  const playlist = findPlaylist(playlistId);
  if (!playlist) return;

  const next = computeNext(playlist.trackIds);
  if (next === playlist.trackIds) return;
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

  enqueue(
    () => window.Utawakui.setPlaylistTracks(playlistId, next),
    '歌單儲存失敗',
  );
}

function addTrack(playlistId, trackId) {
  mutateTracks(playlistId, (trackIds) =>
    trackIds.includes(trackId) ? trackIds : [...trackIds, trackId],
  );
}

// Batch version of addTrack — for "add this whole playlist/album's tracks to
// another playlist," a loop of N addTrack calls would chain N separate
// setPlaylistTracks IPC calls through the pending queue instead of one.
// De-dupes the incoming ids too: this is now a general bulk-add primitive,
// not just a caller for already-unique playlist/album trackIds.
function addTracks(playlistId, trackIds) {
  mutateTracks(playlistId, (currentTrackIds) => {
    const additions = [...new Set(trackIds)].filter(
      (id) => !currentTrackIds.includes(id),
    );
    return additions.length > 0
      ? [...currentTrackIds, ...additions]
      : currentTrackIds;
  });
}

function removeTrack(playlistId, trackId) {
  mutateTracks(playlistId, (trackIds) =>
    trackIds.includes(trackId)
      ? trackIds.filter((id) => id !== trackId)
      : trackIds,
  );
}

function setTracks(playlistId, trackIds) {
  mutateTracks(playlistId, (currentTrackIds) =>
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
  mutateTracks(playlistId, (trackIds) => {
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
    selectedPlaylist,
    select,
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
