// Shared between SetlistView.vue (dispatches these actions from its own
// track/playlist context menus) and PlaylistSidebar.vue (emits them from its
// row context menu) — a single source keeps the action-string vocabulary
// from drifting between the emitter and the handler.
export const PLAYLIST_MENU_ACTIONS = {
  addToQueue: 'add-to-queue',
  addToPlaylist: 'add-to-playlist',
  editDetails: 'edit-details',
  delete: 'delete',
  createPlaylist: 'create-playlist',
  createFolder: 'create-folder',
  convertKind: 'convert-kind',
  download: 'download',
};

export function playlistDisplayName(playlist) {
  return playlist?.name || '(未命名歌單)';
}

// Playlists selectable as an "add to X" target: albums are always excluded
// (their membership is read-only). excludeId drops the playlist itself
// (PlaylistSidebar's "merge into another playlist" menu); excludeTrackId
// drops playlists that already contain the track (SetlistView's per-track
// "add to playlist" menu). Neither exclusion applies unless passed.
export function addToPlaylistTargets(
  playlists,
  { excludeId, excludeTrackId } = {},
) {
  return playlists.filter((candidate) => {
    if (candidate.kind === 'album') return false;
    if (excludeId && candidate.id === excludeId) return false;
    if (excludeTrackId && candidate.trackIds.includes(excludeTrackId)) {
      return false;
    }
    return true;
  });
}
