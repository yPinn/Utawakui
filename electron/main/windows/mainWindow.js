'use strict';

// Owns the control-panel BrowserWindow plus the taskbar-thumbar/playback-
// mirror state that only exists to redraw it, so domain handler modules
// (electron/main/*Handlers.js) can read/notify the window without each
// holding their own reference — same pattern as
// electron/lib/library/backfill.js owning its own mutable flag.

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, nativeImage, nativeTheme } = require('electron');
const { renderGlyphPng } = require('../../lib/thumbarIcons');
const {
  WEB_CONTENTS_ROLES,
  tagWebContentsRole,
} = require('../webContentsRoles');
const { isBoundedTrackId } = require('../../lib/library/paths');
const { normalizeAudioPreferences } = require('../../lib/config');
const { resolveRuntimeEntry } = require('../../lib/runtimeEntries');
const {
  projectSeparationTaskbarProgress,
} = require('../separationTaskbarProgress');
const {
  detectPackagedRuntime,
  readDeveloperOptions,
} = require('../runtimeEnvironment');
const { DEV_SERVER_ORIGIN } = require('../../lib/devServer');
const { hardenWebContentsNavigation } = require('../webContentsSecurity');
const { forwardHistoryAppCommands } = require('../appCommands');

const {
  productName: APP_NAME,
  appUserModelId: BASE_APP_USER_MODEL_ID,
} = require('../../../shared/appIdentity.json');
const rendererEntries = require('../../../shared/rendererEntries.json');
const { getWindowIdentity } = require('./windowIdentity');
const UI_DENSITY_COMPACT = 'compact';
const UI_DENSITY_STANDARD = 'standard';
const { isDev, openDevTools } = readDeveloperOptions(process.argv, {
  isPackagedRuntime: detectPackagedRuntime({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  }),
});

const { icon: iconPath } = getWindowIdentity('main');

// Keep the native Windows overlay continuous with persistent chrome and the
// BrowserWindow substrate continuous with --ui-color-shell-substrate. These
// surfaces sit outside Vue and useTheme.js cannot paint them. Also read by
// electron/main/configHandlers.js's config:set-ui-theme.
const TITLEBAR_COLORS = {
  dark: {
    color: '#272928',
    symbolColor: '#f3f1ec',
    backgroundColor: '#191a1e',
  },
  light: {
    color: '#272928',
    symbolColor: '#f3f1ec',
    backgroundColor: '#191a1e',
  },
};

function getAppUserModelId() {
  if (!isDev) return BASE_APP_USER_MODEL_ID;
  try {
    const { mtimeMs, size } = fs.statSync(iconPath);
    return `${BASE_APP_USER_MODEL_ID}.dev.${Math.round(mtimeMs)}.${size}`;
  } catch {
    return `${BASE_APP_USER_MODEL_ID}.dev`;
  }
}

function quoteWindowsCommandArg(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function buildRelaunchCommand() {
  const args = process.defaultApp
    ? [app.getAppPath(), ...(isDev ? ['--dev'] : [])]
    : process.argv.slice(1);
  return [process.execPath, ...args].map(quoteWindowsCommandArg).join(' ');
}

let mainWindow = null;

function getMainWindow() {
  return mainWindow;
}

function getAppIconPath() {
  return iconPath;
}

function sendBackfillStatus(payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send('library:backfill-status', payload);
}

// The `if (mainWindow) mainWindow.webContents.send('library:updated')` idiom
// repeated across nearly every domain handler — library, lyrics, playlists,
// separation, and config mutations all end with this.
function notifyLibraryUpdated(options) {
  if (!mainWindow) return;
  mainWindow.webContents.send('library:updated', options);
}

// For services that outlive the window, e.g. Output stopping during quit.
function sendToMainWindow(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.webContents.send(channel, payload);
  return true;
}

// Renderer-reported mirror; usePlayer.js remains the playback source of truth.
let playbackState = { isPlaying: false, hasTrack: false, trackId: null };
let separationTaskbarProgress = projectSeparationTaskbarProgress({
  queue: null,
});

function normalizePlaybackTrackId(value) {
  return isBoundedTrackId(value) ? value : null;
}

function getCurrentPlaybackTrackId() {
  return playbackState.trackId;
}

function updateSeparationTaskbarProgress() {
  if (process.platform !== 'win32' || !mainWindow?.setProgressBar) return;
  mainWindow.setProgressBar(separationTaskbarProgress.value, {
    mode: separationTaskbarProgress.mode,
  });
}

function setSeparationQueueStatus(status) {
  separationTaskbarProgress = projectSeparationTaskbarProgress(status);
  updateSeparationTaskbarProgress();
  return separationTaskbarProgress;
}

function getActiveBackgroundWork() {
  return separationTaskbarProgress.active ? 'separation' : null;
}

// Match the Windows taskbar theme, not the app theme.
const THUMBAR_ICON_LIGHT = { r: 255, g: 255, b: 255 };
const THUMBAR_ICON_DARK = { r: 32, g: 32, b: 32 };
const thumbarIconCache = new Map();

function getThumbarIcon(glyph, systemIsDark) {
  const key = `${glyph}:${systemIsDark}`;
  const cached = thumbarIconCache.get(key);
  if (cached) return cached;

  const color = systemIsDark ? THUMBAR_ICON_LIGHT : THUMBAR_ICON_DARK;
  // setThumbarButtons has no per-button update — a changed play/pause icon
  // means recomputing and resending the whole button array, so these are
  // cached per (glyph, theme) pair rather than re-rasterized on every call.
  const image = nativeImage.createFromBuffer(
    renderGlyphPng(glyph, { size: 16, color }),
  );
  image.addRepresentation({
    scaleFactor: 2,
    buffer: renderGlyphPng(glyph, { size: 32, color }),
  });
  thumbarIconCache.set(key, image);
  return image;
}

// Queue commands are renderer-only for now; thumbar exposes play/pause.
function updateThumbar() {
  if (process.platform !== 'win32' || !mainWindow) return;

  const systemIsDark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI;
  const playGlyph = playbackState.isPlaying ? 'pause' : 'play';

  mainWindow.setThumbarButtons([
    {
      tooltip: '上一首',
      icon: getThumbarIcon('prev', systemIsDark),
      flags: ['disabled'],
      click: () => {},
    },
    {
      tooltip: playbackState.isPlaying ? '暫停' : '播放',
      icon: getThumbarIcon(playGlyph, systemIsDark),
      flags: playbackState.hasTrack ? [] : ['disabled'],
      click: () => {
        if (mainWindow) mainWindow.webContents.send('player:command', 'toggle');
      },
    },
    {
      tooltip: '下一首',
      icon: getThumbarIcon('next', systemIsDark),
      flags: ['disabled'],
      click: () => {},
    },
  ]);
}

// Fire-and-forget; thumbar redraw has no renderer-visible result.
function registerPlayerStateHandler(ipcMain) {
  ipcMain.on('player:state', (event, state) => {
    const hasTrack = Boolean(state && state.hasTrack);
    const next = {
      isPlaying: Boolean(state && state.isPlaying),
      hasTrack,
      trackId: hasTrack ? normalizePlaybackTrackId(state?.trackId) : null,
    };
    const thumbarUnchanged =
      next.isPlaying === playbackState.isPlaying &&
      next.hasTrack === playbackState.hasTrack;
    playbackState = next;
    if (thumbarUnchanged) return;
    updateThumbar();
  });
}

function createMainWindow(
  initialTheme = 'light',
  initialSidebarWidth = 64,
  initialCaptureDeviceId = null,
  options = {},
) {
  const initialAudioPreferences = normalizeAudioPreferences(
    options.audioPreferences,
  );
  const titlebarColors = TITLEBAR_COLORS[initialTheme] ?? TITLEBAR_COLORS.light;
  const { backgroundColor, ...titleBarOverlay } = titlebarColors;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 650,
    backgroundColor,
    titleBarStyle: 'hidden',
    // Keep in sync with --ui-window-titlebar-block-size in tokens.css.
    titleBarOverlay: {
      ...titleBarOverlay,
      height: 40,
    },
    title: APP_NAME,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: resolveRuntimeEntry(
        path.resolve(__dirname, '../../..'),
        'preload',
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      navigateOnDragDrop: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: isDev,
      // Lets preload read first-frame UI and audio preferences synchronously,
      // so controls never paint defaults and then jump after an IPC round
      // trip. New windows always begin restored.
      additionalArguments: [
        `--ui-theme=${initialTheme}`,
        `--ui-density=${UI_DENSITY_COMPACT}`,
        `--sidebar-width=${initialSidebarWidth}`,
        `--capture-device-id=${initialCaptureDeviceId ?? ''}`,
        `--performance-volume=${initialAudioPreferences.performanceVolume}`,
        `--capture-volume=${initialAudioPreferences.captureVolume}`,
        `--performance-muted=${initialAudioPreferences.performanceMuted ? '1' : '0'}`,
        `--monitor-guide-vocal-level=${initialAudioPreferences.monitorGuideVocalLevel}`,
        `--capture-guide-vocal-level=${initialAudioPreferences.captureGuideVocalLevel}`,
        ...(options.startupTraceEnabled ? ['--startup-trace-enabled=1'] : []),
        ...(isDev ? ['--internal-workbenches-enabled=1'] : []),
      ],
    },
  });

  let currentUiDensity = UI_DENSITY_COMPACT;
  let isMaximized = false;
  let isFullScreen = false;
  const publishUiDensity = () => {
    const nextUiDensity =
      isMaximized || isFullScreen ? UI_DENSITY_STANDARD : UI_DENSITY_COMPACT;
    if (nextUiDensity === currentUiDensity) return;
    currentUiDensity = nextUiDensity;
    mainWindow.webContents.send('ui-density:changed', nextUiDensity);
  };
  mainWindow.on('maximize', () => {
    isMaximized = true;
    publishUiDensity();
  });
  mainWindow.on('unmaximize', () => {
    isMaximized = false;
    publishUiDensity();
  });
  mainWindow.on('enter-full-screen', () => {
    isFullScreen = true;
    publishUiDensity();
  });
  mainWindow.on('leave-full-screen', () => {
    isFullScreen = false;
    publishUiDensity();
  });

  forwardHistoryAppCommands(mainWindow);

  if (process.platform === 'win32') {
    mainWindow.setAppDetails({
      appId: getAppUserModelId(),
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchCommand: buildRelaunchCommand(),
      relaunchDisplayName: APP_NAME,
    });
  }

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_ORIGIN);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '..', '..', '..', 'dist', rendererEntries.main),
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (openDevTools) mainWindow.webContents.openDevTools();
    // Show thumbar controls before the first renderer player:state event.
    updateThumbar();
  });

  hardenWebContentsNavigation(mainWindow.webContents, {
    isAllowedNavigation: (url) => url === mainWindow.webContents.getURL(),
  });
  tagWebContentsRole(mainWindow.webContents, WEB_CONTENTS_ROLES.MAIN);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

module.exports = {
  APP_NAME,
  isDev,
  TITLEBAR_COLORS,
  getAppIconPath,
  getAppUserModelId,
  createMainWindow,
  getActiveBackgroundWork,
  getCurrentPlaybackTrackId,
  getMainWindow,
  notifyLibraryUpdated,
  sendBackfillStatus,
  sendToMainWindow,
  setSeparationQueueStatus,
  updateThumbar,
  registerPlayerStateHandler,
};
