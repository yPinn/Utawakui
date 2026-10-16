// Shared between LibraryBrowseContent.vue (dispatches these actions from its own
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

// Track action vocabulary is shared by LibraryBrowseContent and caller-owned track
// menus such as QueuePanel. The menu surface stays trigger-neutral; callers
// still decide which actions are available in their own product context.
export const TRACK_MENU_ACTIONS = {
  addToQueue: 'add-to-queue',
  removeFromQueue: 'remove-from-queue',
  addToPlaylist: 'add-to-playlist',
  createPlaylist: 'create-playlist',
  editMetadata: 'edit-metadata',
  removeFromPlaylist: 'remove-from-playlist',
  goToAlbum: 'go-to-album',
  deleteTrack: 'delete-track',
};

export function playlistDisplayName(playlist) {
  return playlist?.name || '(未命名歌單)';
}

// Title of the library destination shown when no collection is selected.
export function libraryViewTitle(libraryView) {
  return libraryView === 'local' ? '本機檔案' : '全部曲目';
}

// Playlists selectable as an "add to X" target: albums are always excluded
// (their membership is read-only). excludeId drops the playlist itself
// (PlaylistSidebar's "merge into another playlist" menu); excludeTrackId
// drops playlists that already contain the track (LibraryBrowseContent's per-track
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
