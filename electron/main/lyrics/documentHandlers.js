'use strict';

const {
  findTrackRecord,
  getTrackLyricsState,
  importManualLyricsFile,
  importManualLyricsText,
  loadTrackLyricsManifest,
  readTrackLyrics,
  resolveTrackDir,
  saveTrackLyricsTiming,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  setLyricsSourcePreference,
} = require('../../lib/library');
const { deleteStoredAmllSource } = require('../../lib/amll');
const { deleteStoredBetterLyricsSource } = require('../../lib/betterlyrics');
const { deleteStoredLrclibSource } = require('../../lib/lrclib');
const { deleteStoredNeteaseSource } = require('../../lib/netease');

function registerLyricsDocumentHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
}) {
  ipcMain.handle('lyrics:get-track', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const result = readTrackLyrics(dir, trackId, filename);
    if (!result) return null;
    return result;
  });

  ipcMain.handle(
    'lyrics:save-timing',
    async (
      event,
      trackId,
      sourceFilename,
      expectedSourceFingerprint,
      document,
    ) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const saved = saveTrackLyricsTiming(
        trackDir,
        sourceFilename,
        expectedSourceFingerprint,
        document,
      );
      notifyLibraryUpdated();
      return saved;
    },
  );

  ipcMain.handle(
    'lyrics:set-source-label',
    async (event, trackId, filename, label) => {
      const dir = resolveDownloadDir(getConfig());
      const trackDir = resolveTrackDir(dir, trackId);
      if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

      const sources = setLyricsSourceLabel(trackDir, filename, label);
      if (!sources) throw new Error(`unknown lyrics source: ${filename}`);

      notifyLibraryUpdated();
      return { sources };
    },
  );

  ipcMain.handle(
    'lyrics:set-source-offset',
    async (event, trackId, filename, offsetMs) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const sources = setLyricsSourceOffset(trackDir, filename, offsetMs);
      const source = sources?.find(
        (candidate) => candidate.filename === filename,
      );
      if (!source) throw new Error(`invalid lyrics source offset: ${filename}`);

      return { source };
    },
  );

  ipcMain.handle(
    'lyrics:set-preferred-source',
    async (event, trackId, filename) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      const trackDir = resolveTrackDir(dir, trackId);
      if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

      const state = setLyricsSourcePreference(trackDir, filename, 'user');
      if (!state) throw new Error('unknown lyrics source');

      notifyLibraryUpdated();
      return state;
    },
  );

  ipcMain.handle('lyrics:delete-source', async (event, trackId, filename) => {
    const dir = resolveDownloadDir(getConfig());
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) throw new Error(`unknown track id: ${trackId}`);

    const source = loadTrackLyricsManifest(trackDir).sources.find(
      (candidate) => candidate.filename === filename,
    );
    const deleteSource =
      {
        amll: deleteStoredAmllSource,
        betterlyrics: deleteStoredBetterLyricsSource,
        netease: deleteStoredNeteaseSource,
      }[source?.provider?.name] || deleteStoredLrclibSource;
    if (!deleteSource(trackDir, filename)) {
      throw new Error(`unable to delete lyrics source: ${filename}`);
    }

    notifyLibraryUpdated();
    return { sources: getTrackLyricsState(trackDir).sources };
  });

  ipcMain.handle('lyrics:import-text', async (event, trackId, payload) => {
    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const result = importManualLyricsText(trackDir, payload);
    if (!result) throw new Error('unable to import manual lyrics');
    setLyricsSourcePreference(trackDir, result.source.filename, 'user');

    notifyLibraryUpdated();
    return result;
  });

  ipcMain.handle('lyrics:import-file', async (event, trackId) => {
    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    const trackDir = resolveTrackDir(dir, trackId);
    if (!track || !trackDir) throw new Error(`unknown track id: ${trackId}`);

    const picked = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title: '匯入歌詞檔',
      properties: ['openFile'],
      filters: [
        { name: 'Lyrics', extensions: ['lrc', 'vtt', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;

    const result = importManualLyricsFile(trackDir, picked.filePaths[0]);
    if (!result) throw new Error('unable to import manual lyrics file');
    setLyricsSourcePreference(trackDir, result.source.filename, 'user');

    notifyLibraryUpdated();
    return result;
  });
}

module.exports = { registerLyricsDocumentHandlers };
