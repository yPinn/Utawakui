'use strict';

const { readTrackLyrics, resolveTrackDir } = require('../../lib/library');
const {
  loadTrackAcousticEstimate,
} = require('../../lib/library/lyricsAcousticEstimates');

function registerLyricsAcousticEstimateHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  recordDiagnostic,
  readLyrics = readTrackLyrics,
}) {
  function diagnose(error) {
    try {
      recordDiagnostic?.({
        process: 'main',
        level: 'error',
        source: 'lyrics-acoustic',
        operation: 'load',
        code: 'LYRICS_ACOUSTIC_LOAD_FAILED',
        error,
      });
    } catch {
      /* Optional diagnostics cannot break lyrics. */
    }
  }
  // Local derived-data read only. Model generation/activation is not exposed.
  ipcMain.handle(
    'lyrics:get-acoustic-estimate',
    async (_event, trackId, filename) => {
      if (typeof trackId !== 'string' || typeof filename !== 'string')
        return { status: 'unavailable' };
      try {
        const dir = resolveDownloadDir(getConfig());
        const trackDir = resolveTrackDir(dir, trackId);
        if (!trackDir) return { status: 'unavailable' };
        const current = readLyrics(dir, trackId, filename);
        return current
          ? await loadTrackAcousticEstimate(trackDir, current.source, {
              onError: diagnose,
            })
          : { status: 'unavailable' };
      } catch (error) {
        if (error.code !== 'ENOENT') diagnose(error);
        return { status: 'unavailable' };
      }
    },
  );
}

module.exports = { registerLyricsAcousticEstimateHandlers };
