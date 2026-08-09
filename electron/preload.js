'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Utawakui', {
  downloadAudio: (videoId) => ipcRenderer.invoke('yt:download-audio', videoId),
  // Resolves to null when the input isn't a playlist URL — not an error,
  // the renderer falls back to the single-video downloadAudio flow.
  listPlaylist: (input) => ipcRenderer.invoke('yt:list-playlist', input),
  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseDownloadDir: () => ipcRenderer.invoke('config:choose-download-dir'),
  resetDownloadDir: () => ipcRenderer.invoke('config:reset-download-dir'),
  listTracks: () => ipcRenderer.invoke('library:list'),
  // Slow (tens of seconds). Rejects if another separation is already
  // running, not just when this track fails.
  separateTrack: (trackId) => ipcRenderer.invoke('separation:run', trackId),
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
