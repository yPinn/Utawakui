import { computed, reactive, readonly } from 'vue';

// Module-scope singleton, same pattern as useSeparation.js — SetlistView
// unmounts on every tab switch, so `selectedId` needs to live somewhere
// that survives that. Deliberately does NOT import usePlayer.js: that
// module calls new Audio()/new AudioContext() at load time, which would
// make this file untestable under plain Node the same way usePlayer.js
// itself is (see CLAUDE.md). Playback stays entirely in SetlistView.

const state = reactive({
  playlists: [],
  // null means "全部曲目" (no playlist selected, show the full library).
  selectedId: null,
  error: null,
});

// Serializes every playlist-array mutation through one chain. Without
// this, two rapid clicks (e.g. double-tapping ↑) would both read the
// pre-update array and race to write it back — the second click's effect
// gets silently overwritten by the first's stale snapshot, which on a
// live-ops tool reads as "the button is broken." Chaining through this
// promise guarantees mutations apply in click order and that the last
// server response is what state ends up reflecting.
let pending = Promise.resolve();
let unsubscribeLibraryUpdated = null;

// Applied after every fetch AND every mutation response, not just
// refresh() — a delete (of this playlist, or of the last track that made
// it disappear elsewhere) can make the currently selected id vanish from
// any of those response arrays, and the sidebar has no correct "active"
// item to highlight if selectedId is left pointing at nothing.
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
  return enqueue(() => window.Utawakui.getPlaylists(), '讀取歌單失敗', {
    clearErrorOnSuccess: false,
  });
}

if (typeof window !== 'undefined' && window.Utawakui) {
  refresh();
  // Covers two cases with one subscription: (1) another part of the app
  // changed playlists.json indirectly (track deletion cascades — see
  // main.js's library:delete-track handler), and (2) the download
  // directory changed, which main.js now also pushes this event for
  // specifically so this singleton doesn't keep serving a stale
  // directory's playlists (and worse, write them back into the new one).
  unsubscribeLibraryUpdated = window.Utawakui.onLibraryUpdated(refresh);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeLibraryUpdated?.();
  });
}

function select(id) {
  state.selectedId = id;
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

function reorderPlaylist(draggedId, targetId, position = 'before') {
  if (!draggedId || !targetId || draggedId === targetId) return;
  if (typeof window.Utawakui.reorderPlaylist !== 'function') {
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
    selectedPlaylist,
    select,
    create,
    rename,
    remove,
    reorderPlaylist,
    addTrack,
    removeTrack,
    setTracks,
    moveTrack,
  };
}
