'use strict';

const {
  createEmptyPerformerSnapshot,
  parsePerformerSnapshot,
} = require('../../lib/performerSnapshot');
const {
  MIN_PERFORMER_WINDOW_BOUNDS,
  fitPerformerWindowBounds,
  normalizePerformerWindowBounds,
} = require('../../lib/performerWindowBounds');
const { hardenWebContentsNavigation } = require('../webContentsSecurity');
const {
  WEB_CONTENTS_ROLES,
  tagWebContentsRole,
} = require('../webContentsRoles');
const { getWindowIdentity } = require('./windowIdentity');

const BOUNDS_PERSIST_DEBOUNCE_MS = 300;

function isUiTheme(value) {
  return value === 'light' || value === 'dark';
}

function createPerformerWindowManager(options) {
  const {
    BrowserWindow,
    isDev,
    devUrl,
    pagePath,
    preloadPath,
    iconPath = getWindowIdentity('prompter').icon,
    getDisplayWorkArea = () => null,
    getPersistedBounds = () => null,
    getUiTheme = () => 'light',
    persistBounds = () => {},
    onBoundsPersistenceError = () => {},
    publishStatus = () => {},
  } = options;

  let performerWindow = null;
  let latestSnapshot = createEmptyPerformerSnapshot();
  let lastBounds = null;
  let lastPersistedBounds = null;
  let boundsPersistTimer = null;
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

  function boundsKey(bounds) {
    return bounds
      ? `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
      : '';
  }

  function rememberBounds() {
    const window = liveWindow();
    if (!window || window.isFullScreen() || window.isMaximized()) return false;
    const nextBounds = normalizePerformerWindowBounds(window.getBounds());
    if (!nextBounds) return false;
    lastBounds = nextBounds;
    return true;
  }

  function cancelBoundsPersistence() {
    if (boundsPersistTimer === null) return;
    clearTimeout(boundsPersistTimer);
    boundsPersistTimer = null;
  }

  function persistRememberedBounds() {
    cancelBoundsPersistence();
    if (
      !lastBounds ||
      boundsKey(lastBounds) === boundsKey(lastPersistedBounds)
    ) {
      return false;
    }
    try {
      persistBounds({ ...lastBounds });
      lastPersistedBounds = { ...lastBounds };
      return true;
    } catch (error) {
      onBoundsPersistenceError(error);
      return false;
    }
  }

  function scheduleBoundsPersistence() {
    cancelBoundsPersistence();
    boundsPersistTimer = setTimeout(
      persistRememberedBounds,
      BOUNDS_PERSIST_DEBOUNCE_MS,
    );
    boundsPersistTimer.unref?.();
  }

  function rememberAndScheduleBounds() {
    if (rememberBounds()) scheduleBoundsPersistence();
  }

  function sendLatestSnapshot() {
    const window = liveWindow();
    if (!window) return false;
    window.webContents.send('performer-view:snapshot', latestSnapshot);
    return true;
  }

  function applyUiTheme(theme) {
    if (!isUiTheme(theme)) return false;
    const window = liveWindow();
    if (!window) return false;
    window.setBackgroundColor(theme === 'light' ? '#dad7d0' : '#191a1e');
    window.webContents.send('performer-view:ui-theme', theme);
    return true;
  }

  function createWindow() {
    const initialTheme = getUiTheme() === 'dark' ? 'dark' : 'light';
    const persistedBounds =
      normalizePerformerWindowBounds(getPersistedBounds());
    if (!lastPersistedBounds && persistedBounds) {
      lastPersistedBounds = { ...persistedBounds };
    }
    const candidateBounds = lastBounds ?? persistedBounds;
    const bounds = fitPerformerWindowBounds(
      candidateBounds,
      getDisplayWorkArea(candidateBounds),
    );
    const window = new BrowserWindow({
      ...bounds,
      minWidth: MIN_PERFORMER_WINDOW_BOUNDS.width,
      minHeight: MIN_PERFORMER_WINDOW_BOUNDS.height,
      backgroundColor: initialTheme === 'light' ? '#dad7d0' : '#191a1e',
      title: getWindowIdentity('prompter').title,
      icon: iconPath,
      show: false,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        navigateOnDragDrop: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: isDev,
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
      applyUiTheme(getUiTheme() === 'dark' ? 'dark' : 'light');
      emitStatus();
    });
    hardenWebContentsNavigation(window.webContents, {
      isAllowedNavigation: (url) => url === window.webContents.getURL(),
    });
    tagWebContentsRole(window.webContents, WEB_CONTENTS_ROLES.PERFORMER);
    window.on('move', rememberAndScheduleBounds);
    window.on('resize', rememberAndScheduleBounds);
    window.on('close', () => {
      rememberBounds();
      persistRememberedBounds();
    });
    window.on('enter-full-screen', emitStatus);
    window.on('leave-full-screen', emitStatus);
    window.on('closed', () => {
      cancelBoundsPersistence();
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
    persistRememberedBounds();
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
    const nextFullScreen = !window.isFullScreen();
    if (nextFullScreen) {
      rememberBounds();
      persistRememberedBounds();
    }
    window.setFullScreen(nextFullScreen);
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
    applyUiTheme,
    attachMainWindow,
    close,
    getSnapshot: () => latestSnapshot,
    getStatus,
    getWebContents: () => liveWindow()?.webContents ?? null,
    minimize,
    open,
    publish,
    toggleAlwaysOnTop,
    toggleFullScreen,
  };
}

module.exports = {
  BOUNDS_PERSIST_DEBOUNCE_MS,
  createPerformerWindowManager,
};
