'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Utawakui', {
  downloadAudio: (videoId) => ipcRenderer.invoke('yt:download-audio', videoId),
  // YouTube playlist URL/ID resolution — unrelated to the user-named
  // playlists API below (getPlaylists/createPlaylist/etc.), despite the
  // similar name. Resolves to null when the input isn't a playlist URL —
  // not an error, the renderer falls back to the single-video
  // downloadAudio flow.
  listPlaylist: (input) => ipcRenderer.invoke('yt:list-playlist', input),
  resolveImportSource: (input) =>
    ipcRenderer.invoke('yt:resolve-import-source', input),
  fetchVideoMetadata: (input) => ipcRenderer.invoke('yt:fetch-metadata', input),
  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseDownloadDir: () => ipcRenderer.invoke('config:choose-download-dir'),
  resetDownloadDir: () => ipcRenderer.invoke('config:reset-download-dir'),
  listTracks: () => ipcRenderer.invoke('library:list'),
  getTrackLyrics: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:get-track', trackId, filename),
  probeMusixmatchLyrics: (trackId) =>
    ipcRenderer.invoke('lyrics:probe-musixmatch', trackId),
  // Deletes the original audio file and its separation output together —
  // resolves to false if trackId no longer matches a real file. Also
  // cascades into any playlist that referenced it (see main.js's handler).
  deleteTrack: (trackId) => ipcRenderer.invoke('library:delete-track', trackId),
  // Named as getPlaylists, not listPlaylists — listPlaylist above (one
  // character different, same object) is the YouTube resolver, and the
  // two are easy to miscall. Every mutation below resolves to the FULL
  // updated playlist array, so callers never need a separate refetch.
  getPlaylists: () => ipcRenderer.invoke('playlists:list'),
  createPlaylist: (name) => ipcRenderer.invoke('playlists:create', name),
  renamePlaylist: (id, name) =>
    ipcRenderer.invoke('playlists:rename', id, name),
  deletePlaylist: (id) => ipcRenderer.invoke('playlists:delete', id),
  reorderPlaylist: (draggedId, targetId, position) =>
    ipcRenderer.invoke('playlists:reorder', draggedId, targetId, position),
  // Album collections are read-only from the renderer's side — main.js
  // silently no-ops this against an album's id (returns the array
  // unchanged) rather than throwing, same "trust boundary lives in main"
  // pattern as extractVideoId().
  setPlaylistTracks: (id, trackIds) =>
    ipcRenderer.invoke('playlists:set-tracks', id, trackIds),
  // Create-or-update path for album imports, keyed by source (not name) so
  // re-importing the same album updates it in place instead of
  // duplicating it.
  upsertAlbum: (payload) =>
    ipcRenderer.invoke('playlists:upsert-album', payload),
  // Manual escape hatch for when the automatic album/playlist heuristic
  // guesses wrong on an existing collection.
  setPlaylistKind: (id, kind) =>
    ipcRenderer.invoke('playlists:set-kind', id, kind),
  // Slow (tens of seconds). Rejects if another separation is already
  // running, not just when this track fails.
  separateTrack: (trackId, presetId) =>
    ipcRenderer.invoke('separation:run', trackId, presetId),
  // Instant — switches which already-produced result plays, no DSP
  // involved. Rejects if presetId has no recorded result yet.
  selectSeparationResult: (trackId, presetId) =>
    ipcRenderer.invoke('separation:select', trackId, presetId),
  // Zero or more fire per separateTrack() call, before its promise
  // settles — see main.js's separation:run handler for the stage sequence.
  onSeparationProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('separation:progress', listener);
    return () => ipcRenderer.removeListener('separation:progress', listener);
  },
  // Returns an unsubscribe function so callers can clean up on unmount
  // instead of reaching for raw ipcRenderer (kept out of the renderer
  // entirely under contextIsolation).
  onLibraryUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('library:updated', listener);
    return () => ipcRenderer.removeListener('library:updated', listener);
  },
  onLibraryBackfillStatus: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('library:backfill-status', listener);
    return () =>
      ipcRenderer.removeListener('library:backfill-status', listener);
  },
  // One-way notification (send, not invoke) — main has nothing to return,
  // it just redraws the Windows taskbar thumbar to match.
  setPlaybackState: (state) => ipcRenderer.send('player:state', state),
  // Fires when a taskbar thumbar button is clicked; main never touches
  // playback itself, it only relays the request back to the renderer,
  // which is the sole owner of the <audio> element (see usePlayer.js).
  onPlayerCommand: (callback) => {
    const listener = (event, command) => callback(command);
    ipcRenderer.on('player:command', listener);
    return () => ipcRenderer.removeListener('player:command', listener);
  },
});
