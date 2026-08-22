'use strict';

const {
  createEmptyPerformerSnapshot,
  parsePerformerSnapshot,
} = require('../lib/performerSnapshot');

const DEFAULT_BOUNDS = Object.freeze({ width: 960, height: 460 });
const MIN_BOUNDS = Object.freeze({ width: 800, height: 360 });
const WORK_AREA_MARGIN = 32;

function fitInitialBounds(workArea) {
  if (
    !workArea ||
    !Number.isFinite(workArea.x) ||
    !Number.isFinite(workArea.y) ||
    !Number.isFinite(workArea.width) ||
    !Number.isFinite(workArea.height) ||
    workArea.width <= 0 ||
    workArea.height <= 0
  ) {
    return DEFAULT_BOUNDS;
  }

  const width = Math.max(
    MIN_BOUNDS.width,
    Math.min(DEFAULT_BOUNDS.width, workArea.width - WORK_AREA_MARGIN * 2),
  );
  const height = Math.max(
    MIN_BOUNDS.height,
    Math.min(DEFAULT_BOUNDS.height, workArea.height - WORK_AREA_MARGIN * 2),
  );

  return {
    x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2)),
    width,
    height,
  };
}

function createPerformerWindowManager(options) {
  const {
    BrowserWindow,
    isDev,
    devUrl,
    pagePath,
    preloadPath,
    getDisplayWorkArea = () => null,
    getUiTheme = () => 'dark',
    publishStatus = () => {},
  } = options;

  let performerWindow = null;
  let latestSnapshot = createEmptyPerformerSnapshot();
  let lastBounds = null;
  let alwaysOnTop = false;

  function liveWindow() {
    return performerWindow && !performerWindow.isDestroyed()
      ? performerWindow
      : null;
  }

  function getStatus() {
    const window = liveWindow();
    return {
      open: Boolean(window),
      fullScreen: window?.isFullScreen() ?? false,
      alwaysOnTop: window?.isAlwaysOnTop() ?? alwaysOnTop,
    };
  }

  function emitStatus() {
    const status = getStatus();
    publishStatus(status);
    const window = liveWindow();
    if (window) {
      window.webContents.send('performer-view:window-state', status);
    }
    return status;
  }

  function rememberBounds() {
    const window = liveWindow();
    if (!window || window.isFullScreen() || window.isMaximized()) return;
    lastBounds = window.getBounds();
  }

  function sendLatestSnapshot() {
    const window = liveWindow();
    if (!window) return false;
    window.webContents.send('performer-view:snapshot', latestSnapshot);
    return true;
  }

  function createWindow() {
    const initialTheme = getUiTheme() === 'light' ? 'light' : 'dark';
    const bounds = lastBounds ?? fitInitialBounds(getDisplayWorkArea());
    const window = new BrowserWindow({
      ...bounds,
      minWidth: MIN_BOUNDS.width,
      minHeight: MIN_BOUNDS.height,
      backgroundColor: initialTheme === 'light' ? '#f7f1e7' : '#1f2328',
      title: 'Utawakui Performer View',
      show: false,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        additionalArguments: [`--ui-theme=${initialTheme}`],
      },
    });
    performerWindow = window;
    window.setAlwaysOnTop(alwaysOnTop);

    if (isDev) window.loadURL(devUrl);
    else window.loadFile(pagePath);

    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    window.webContents.on('did-finish-load', () => {
      sendLatestSnapshot();
      emitStatus();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== window.webContents.getURL()) event.preventDefault();
    });
    window.on('move', rememberBounds);
    window.on('resize', rememberBounds);
    window.on('enter-full-screen', emitStatus);
    window.on('leave-full-screen', emitStatus);
    window.on('closed', () => {
      if (performerWindow === window) performerWindow = null;
      publishStatus(getStatus());
    });

    return window;
  }

  function open() {
    const existing = liveWindow();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return emitStatus();
    }
    createWindow();
    return emitStatus();
  }

  function close() {
    const window = liveWindow();
    if (!window) return getStatus();
    rememberBounds();
    window.close();
    return getStatus();
  }

  function publish(snapshot) {
    latestSnapshot = parsePerformerSnapshot(snapshot);
    sendLatestSnapshot();
    return true;
  }

  function toggleFullScreen() {
    const window = liveWindow();
    if (!window) return getStatus();
    window.setFullScreen(!window.isFullScreen());
    return emitStatus();
  }

  function minimize() {
    const window = liveWindow();
    if (!window) return getStatus();
    window.minimize();
    return getStatus();
  }

  function toggleAlwaysOnTop() {
    const window = liveWindow();
    if (!window) return getStatus();
    alwaysOnTop = !window.isAlwaysOnTop();
    window.setAlwaysOnTop(alwaysOnTop);
    return emitStatus();
  }

  function attachMainWindow(mainWindow) {
    mainWindow?.once('closed', close);
  }

  return {
    attachMainWindow,
    close,
    getSnapshot: () => latestSnapshot,
    getStatus,
    minimize,
    open,
    publish,
    toggleAlwaysOnTop,
    toggleFullScreen,
  };
}

module.exports = { createPerformerWindowManager };
