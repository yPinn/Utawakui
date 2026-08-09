'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const {
  app,
  BrowserWindow,
  session,
  ipcMain,
  dialog,
  protocol,
  nativeImage,
  nativeTheme,
} = require('electron');
const {
  downloadAudio,
  fetchMetadata,
  listPlaylist,
} = require('./lib/downloader');
const { loadConfig, saveConfig } = require('./lib/config');
const { extractVideoId, extractPlaylistId } = require('./lib/youtube');
const {
  buildRangeResponse,
  deleteTrack,
  listTracks,
  resolveSeparatedDir,
  resolveSeparatedFilePath,
  resolveTrackPath,
  runBackfillPass,
  saveIndexEntry,
} = require('./lib/library');
const {
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  removeTrackFromAllPlaylists,
  renamePlaylist,
  setPlaylistTracks,
} = require('./lib/playlists');
const { renderGlyphPng } = require('./lib/thumbar-icons');
const { ensureModel } = require('./lib/vocalSeparation');

const isDev = process.argv.includes('--dev');
const MEDIA_SCHEME = 'utawakui-media';
const APP_NAME = 'Utawakui';
const APP_USER_MODEL_ID = 'com.utawakui.app';

app.setName(APP_NAME);

// Must run before app.whenReady() — Electron only accepts scheme privilege
// registration at module load time. The one exception to "everything
// Electron-API-related lives in the ready callback" in this file.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    // supportFetchAPI/corsEnabled are required for the guide-vocal mix:
    // the shared <audio> element routes through createMediaElementSource(),
    // and Web Audio silently zeroes every channel of a cross-origin source
    // unless the request is CORS-clean. Without these flags, fetch() to
    // this scheme fails outright and audio.crossOrigin='anonymous' gets
    // rejected before it ever reaches our handler.
    privileges: {
      standard: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const iconPath = path.join(
  __dirname,
  '..',
  'public',
  'assets',
  'icons',
  'app-icon.ico',
);

function resolveDownloadDir(config) {
  // OS Music folder, not userData — userData is Chromium's internal engine
  // state; downloads are user content the user may want to browse directly.
  return config.downloadDir || path.join(app.getPath('music'), 'Utawakui');
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

// Guards against overlapping separation:run calls — see the handler's own
// comment for why this can't just be left to the renderer's disabled state.
let separationInProgress = false;

// Renderer-reported only — main never guesses playback state itself. The
// <audio> element in usePlayer.js is the sole source of truth for
// isPlaying (see CLAUDE.md); this just mirrors whatever it last reported so
// the thumbar redraw stays a pure function of that report.
let playbackState = { isPlaying: false, hasTrack: false };

// Must track the *system* taskbar theme, not the app's own —
// shouldUseDarkColorsForSystemIntegratedUI distinguishes that, unlike plain
// shouldUseDarkColors. A white icon on a light-mode taskbar is near-invisible.
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

// The renderer now owns playlist queue controls in PlayerBar.vue. The
// Windows taskbar thumbar still exposes play/pause only until those
// queue commands are bridged explicitly.
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 650,
    // must match --ui-bg in public/tokens.css — this can't read the CSS
    // variable, keep the two literal values in sync by hand
    backgroundColor: '#20222a',
    title: APP_NAME,
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  if (process.platform === 'win32') {
    mainWindow.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchCommand: buildRelaunchCommand(),
      relaunchDisplayName: APP_NAME,
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
    // Otherwise no thumbar buttons exist at all until the renderer's first
    // player:state push — the taskbar thumbnail would show no controls on
    // launch even though a track may already be loaded from a prior state.
    updateThumbar();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        callback(false);
      },
    );

    // Machine-local settings only (download path, later OBS connection info,
    // etc.) — never exported/shared. See CLAUDE.md's config.json convention:
    // the future named-preset (shareable) format is a separate layer that
    // excludes these keys.
    const configPath = path.join(app.getPath('userData'), 'config.json');
    // Cached, not re-read per call — the protocol handler below runs this
    // on every byte-range request while a track streams/seeks. Kept in
    // sync by reassigning wherever saveConfig runs. Gap: a hand-edited
    // config.json won't be picked up until next launch.
    let cachedConfig = loadConfig(configPath);

    // Serves local audio files to the sandboxed renderer (nodeIntegration:
    // false means it has no direct filesystem access). Dispatches on
    // hostname: 'local' is an original downloaded track (resolveTrackPath,
    // existing behavior); 'separated' is a vocal-separation output variant
    // (resolveSeparatedFilePath, pathname is `<trackId>/<variantFilename>`).
    // Either way, never trust the requested path beyond what these
    // resolvers allow.
    protocol.handle(MEDIA_SCHEME, (request) => {
      const url = new URL(request.url);
      const dir = resolveDownloadDir(cachedConfig);
      let filePath;
      if (url.hostname === 'separated') {
        const [trackId, variantFilename] = url.pathname
          .split('/')
          .filter(Boolean)
          .map(decodeURIComponent);
        filePath = resolveSeparatedFilePath(dir, trackId, variantFilename);
      } else {
        const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        filePath = resolveTrackPath(dir, filename);
      }
      if (!filePath) {
        return new Response('Not found', { status: 404 });
      }
      try {
        // Real 206 Partial Content support — see buildRangeResponse's own
        // comment for why net.fetch(pathToFileURL(...)) doesn't actually
        // provide this despite looking like it should.
        return buildRangeResponse(filePath, request.headers.get('range'));
      } catch {
        // Most likely the file was deleted between resolveTrackPath (which
        // only checks the path is safe, not that the file exists) and here
        // — same response as "never existed" rather than letting fs
        // errors escape the handler.
        return new Response('Not found', { status: 404 });
      }
    });

    ipcMain.handle('library:list', async () => {
      const dir = resolveDownloadDir(cachedConfig);
      const tracks = listTracks(dir);
      // Fire-and-forget — don't make the renderer wait on a network-bound
      // metadata pass just to see the tracks it already has.
      runBackfillPass(dir, tracks, fetchMetadata).then((updated) => {
        if (updated && mainWindow) {
          mainWindow.webContents.send('library:updated');
        }
      });
      return tracks;
    });

    ipcMain.handle('library:delete-track', async (event, trackId) => {
      const dir = resolveDownloadDir(cachedConfig);
      const deleted = deleteTrack(dir, trackId);
      if (deleted) {
        // Cascades into any playlist that referenced this track — a
        // playlist can otherwise end up pointing at a trackId that no
        // longer has a file, which is harmless (see setPlaylistTracks's
        // own comment) but pointless to leave behind when we already know
        // exactly which id just disappeared.
        removeTrackFromAllPlaylists(dir, trackId);
        if (mainWindow) mainWindow.webContents.send('library:updated');
      }
      return deleted;
    });

    // Every mutation resolves to the full playlist array so the renderer
    // can replace its state directly instead of a separate refetch.
    ipcMain.handle('playlists:list', async () => {
      return loadPlaylists(resolveDownloadDir(cachedConfig));
    });

    ipcMain.handle('playlists:create', async (event, name) => {
      return createPlaylist(resolveDownloadDir(cachedConfig), name);
    });

    ipcMain.handle('playlists:rename', async (event, id, name) => {
      return renamePlaylist(resolveDownloadDir(cachedConfig), id, name);
    });

    ipcMain.handle('playlists:delete', async (event, id) => {
      return deletePlaylist(resolveDownloadDir(cachedConfig), id);
    });

    ipcMain.handle('playlists:set-tracks', async (event, id, trackIds) => {
      return setPlaylistTracks(resolveDownloadDir(cachedConfig), id, trackIds);
    });

    ipcMain.handle('yt:list-playlist', async (event, input) => {
      const playlistId = extractPlaylistId(input);
      if (!playlistId) return null; // not a playlist URL — not an error
      const dir = resolveDownloadDir(cachedConfig);
      const existingIds = new Set(listTracks(dir).map((track) => track.id));
      const entries = await listPlaylist(playlistId);
      return entries.map((entry) => ({
        ...entry,
        alreadyDownloaded: existingIds.has(entry.id),
      }));
    });

    ipcMain.handle('yt:download-audio', async (event, input) => {
      const videoId = extractVideoId(input);
      if (!videoId) throw new Error('invalid video id or YouTube URL');
      const destDir = resolveDownloadDir(cachedConfig);
      const result = await downloadAudio(videoId, destDir);
      if (result.title) {
        try {
          saveIndexEntry(destDir, videoId, {
            title: result.title,
            artist: result.artist,
            duration: result.duration,
          });
        } catch {
          // The download itself succeeded and the file is playable — a
          // failed index write (e.g. disk full) shouldn't be reported to
          // the renderer as a failed download. The next background
          // backfill pass will retry writing the title.
        }
      }
      return result;
    });

    ipcMain.handle('separation:run', async (event, trackId) => {
      const dir = resolveDownloadDir(cachedConfig);
      const track = listTracks(dir).find((t) => t.id === trackId);
      if (!track) throw new Error(`unknown track id: ${trackId}`);

      const outDir = resolveSeparatedDir(dir, trackId);
      if (!outDir) throw new Error('invalid track id');
      const inputPath = resolveTrackPath(dir, track.filename);

      // Running two separations at once (same track racing writes, or
      // different tracks saturating ONNX's all-cores pool while the user
      // might be live) is worse than rejecting the second call.
      if (separationInProgress) {
        throw new Error('已經有一首曲目在分離中,請等它完成後再試一次。');
      }
      separationInProgress = true;
      try {
        // The one stage that doesn't happen in the worker — the model
        // download runs on this thread, before the worker exists.
        if (mainWindow) {
          mainWindow.webContents.send('separation:progress', {
            trackId,
            stage: 'downloading-model',
          });
        }
        const modelPath = await ensureModel(app.getPath('userData'));
        await new Promise((resolve, reject) => {
          const worker = new Worker(
            path.join(__dirname, 'lib', 'vocalSeparationWorker.js'),
            { workerData: { inputPath, outputDir: outDir, modelPath } },
          );
          worker.on('message', (msg) => {
            if (msg.type === 'progress') {
              if (mainWindow) {
                mainWindow.webContents.send('separation:progress', {
                  trackId,
                  stage: msg.stage,
                  percent: msg.percent,
                });
              }
            } else if (msg.type === 'done') {
              resolve(msg.result);
            } else {
              reject(new Error(msg.error));
            }
          });
          worker.on('error', reject);
          // Without this, a worker that dies before posting any message
          // (OOM, native crash) leaves the promise unsettled forever, and
          // separationInProgress stuck true until the app is relaunched.
          worker.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`separation worker exited with code ${code}`));
            }
          });
        });
        // Lets any subscriber pick up hasSeparation/stemsUrl even if the
        // triggering component has since unmounted — reuses the same
        // channel runBackfillPass already pushes on.
        if (mainWindow) mainWindow.webContents.send('library:updated');
      } finally {
        separationInProgress = false;
      }

      return {
        stemsUrl: `${MEDIA_SCHEME}://separated/${encodeURIComponent(trackId)}/stems.wav`,
      };
    });

    ipcMain.handle('config:get', async () => {
      return {
        downloadDir: resolveDownloadDir(cachedConfig),
        isDefault: !cachedConfig.downloadDir,
      };
    });

    ipcMain.handle('config:choose-download-dir', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) {
        return resolveDownloadDir(cachedConfig);
      }
      cachedConfig = saveConfig(configPath, {
        downloadDir: result.filePaths[0],
      });
      // Invalidates both the renderer's track list AND usePlaylists.js's
      // module-scope playlist cache — that composable survives Setlist tab
      // switches, so without this push it would keep the old dir's
      // playlists and silently write them (with stale trackIds) into the
      // new dir on the next mutation.
      if (mainWindow) mainWindow.webContents.send('library:updated');
      return result.filePaths[0];
    });

    ipcMain.handle('config:reset-download-dir', async () => {
      cachedConfig = saveConfig(configPath, { downloadDir: null });
      if (mainWindow) mainWindow.webContents.send('library:updated');
      return resolveDownloadDir(cachedConfig);
    });

    // Fire-and-forget notification from the renderer, not invoke/handle —
    // the thumbar redraw has no return value the renderer needs to await.
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

    nativeTheme.on('updated', updateThumbar);

    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
