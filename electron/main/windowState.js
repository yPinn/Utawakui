'use strict';

// Owns the app's single BrowserWindow plus the taskbar-thumbar/playback-
// mirror state that only exists to redraw it, so domain handler modules
// (electron/main/*Handlers.js) can read/notify the window without each
// holding their own reference — same pattern as
// electron/lib/library/backfill.js owning its own mutable flag.

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, nativeImage, nativeTheme } = require('electron');
const { renderGlyphPng } = require('../lib/thumbarIcons');

// Must equal APP_NAME in electron/main.js (that copy feeds app.setName(),
// which has to run before any lib require reads app.getPath('userData') —
// see main.js's own comment — so it can't import this module that early).
const APP_NAME = 'Utawakui';
const BASE_APP_USER_MODEL_ID = 'com.utawakui.app';
const isDev = process.argv.includes('--dev');

const iconPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'assets',
  'icons',
  'app-icon.ico',
);

// Keep in sync with --ui-color-canvas / --ui-color-text in tokens.css —
// these paint the native Windows overlay buttons, which useTheme.js can't
// reach. Also read by electron/main/configHandlers.js's config:set-ui-theme.
const TITLEBAR_COLORS = {
  dark: { color: '#1f2328', symbolColor: '#f7f1e7' },
  light: { color: '#f7f1e7', symbolColor: '#1f2328' },
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

function sendBackfillStatus(payload) {
  if (!mainWindow) return;
  mainWindow.webContents.send('library:backfill-status', payload);
}

// The `if (mainWindow) mainWindow.webContents.send('library:updated')` idiom
// repeated across nearly every domain handler — library, lyrics, playlists,
// separation, and config mutations all end with this.
function notifyLibraryUpdated() {
  if (!mainWindow) return;
  mainWindow.webContents.send('library:updated');
}

// Renderer-reported mirror; usePlayer.js remains the playback source of truth.
let playbackState = { isPlaying: false, hasTrack: false };

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
    const next = {
      isPlaying: Boolean(state && state.isPlaying),
      hasTrack: Boolean(state && state.hasTrack),
    };
    if (
      next.isPlaying === playbackState.isPlaying &&
      next.hasTrack === playbackState.hasTrack
    ) {
      return;
    }
    playbackState = next;
    updateThumbar();
  });
}

function createMainWindow(
  initialTheme = 'dark',
  initialSidebarWidth = 256,
  initialCaptureDeviceId = null,
  options = {},
) {
  const titlebarColors = TITLEBAR_COLORS[initialTheme] ?? TITLEBAR_COLORS.dark;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 650,
    backgroundColor: titlebarColors.color,
    titleBarStyle: 'hidden',
    // Keep in sync with --ui-titlebar-height in src/styles/tokens.css.
    titleBarOverlay: {
      color: titlebarColors.color,
      symbolColor: titlebarColors.symbolColor,
      height: 38,
    },
    title: APP_NAME,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      // Lets preload's initialUiTheme/initialSidebarWidth/
      // initialCaptureDeviceId read these synchronously, so the first frame
      // paints the right palette/sidebar width and useAudioOutput.js can
      // apply the persisted capture device without an async round trip.
      additionalArguments: [
        `--ui-theme=${initialTheme}`,
        `--sidebar-width=${initialSidebarWidth}`,
        `--capture-device-id=${initialCaptureDeviceId ?? ''}`,
        ...(options.startupTraceEnabled ? ['--startup-trace-enabled=1'] : []),
      ],
    },
  });

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
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
    // Show thumbar controls before the first renderer player:state event.
    updateThumbar();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

module.exports = {
  APP_NAME,
  isDev,
  TITLEBAR_COLORS,
  getAppUserModelId,
  createMainWindow,
  getMainWindow,
  notifyLibraryUpdated,
  sendBackfillStatus,
  updateThumbar,
  registerPlayerStateHandler,
};
