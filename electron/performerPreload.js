'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function readInitialUiTheme() {
  const arg = process.argv.find((value) => value.startsWith('--ui-theme='));
  return arg?.slice('--ui-theme='.length) === 'light' ? 'light' : 'dark';
}

function isUiTheme(value) {
  return value === 'light' || value === 'dark';
}

function lyricsOffsetIntent(value) {
  return {
    action: value?.action,
    revision: value?.revision,
    trackId: value?.trackId,
  };
}

contextBridge.exposeInMainWorld('UtawakuiPerformer', {
  recordDiagnostic: (event) =>
    ipcRenderer.invoke('diagnostics:record-renderer', event),
  initialUiTheme: readInitialUiTheme(),
  getSnapshot: () => ipcRenderer.invoke('performer-view:get-snapshot'),
  getWindowState: () => ipcRenderer.invoke('performer-view:get-status'),
  adjustLyricsOffset: (intent) =>
    ipcRenderer.invoke(
      'performer-view:adjust-lyrics-offset',
      lyricsOffsetIntent(intent),
    ),
  getReadingScale: () => ipcRenderer.invoke('performer-view:get-reading-scale'),
  setReadingScale: (scale) =>
    ipcRenderer.invoke('performer-view:set-reading-scale', scale),
  close: () => ipcRenderer.invoke('performer-view:close'),
  minimize: () => ipcRenderer.invoke('performer-view:minimize'),
  toggleFullScreen: () =>
    ipcRenderer.invoke('performer-view:toggle-full-screen'),
  toggleAlwaysOnTop: () =>
    ipcRenderer.invoke('performer-view:toggle-always-on-top'),
  onSnapshot: (callback) => {
    const listener = (event, snapshot) => callback(snapshot);
    ipcRenderer.on('performer-view:snapshot', listener);
    return () =>
      ipcRenderer.removeListener('performer-view:snapshot', listener);
  },
  onUiTheme: (callback) => {
    const listener = (event, theme) => {
      if (isUiTheme(theme)) callback(theme);
    };
    ipcRenderer.on('performer-view:ui-theme', listener);
    return () =>
      ipcRenderer.removeListener('performer-view:ui-theme', listener);
  },
  onWindowState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('performer-view:window-state', listener);
    return () =>
      ipcRenderer.removeListener('performer-view:window-state', listener);
  },
});
