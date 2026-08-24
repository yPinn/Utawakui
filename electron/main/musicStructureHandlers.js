'use strict';

const { loadTrackMusicStructure } = require('../lib/library');

const PUBLIC_ANALYSIS_ERRORS = new Set([
  'a structure-analysis job is already running',
  'audio-processing job cancelled',
  'structure-analysis capability is not activated',
  'music structure track is unavailable',
]);

function publicAnalysisError(error) {
  const message = PUBLIC_ANALYSIS_ERRORS.has(error?.message)
    ? error.message
    : 'music structure analysis failed';
  return new Error(message);
}

function publicCapabilityError(error) {
  const message = String(error?.message ?? '');
  if (message.includes('already running')) {
    return new Error('a music analysis setup operation is already running');
  }
  if (
    message.includes('active analysis job') ||
    message.includes('still in use')
  ) {
    return new Error('music analysis setup is currently in use');
  }
  return new Error('music analysis preparation failed');
}

function registerMusicStructureHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  loadMusicStructure = loadTrackMusicStructure,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
  analysisService,
  capabilityService,
}) {
  ipcMain.handle('music-structure:get-track', async (event, trackId) =>
    loadMusicStructure(resolveDownloadDir(getConfig()), trackId),
  );

  ipcMain.handle('music-structure:analyze-track', async (event, trackId) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    let result;
    try {
      result = await analysisService.run({
        trackId,
        onProgress: (progress) => {
          getMainWindow()?.webContents.send(
            'music-structure:analysis-progress',
            progress,
          );
        },
      });
    } catch (error) {
      throw publicAnalysisError(error);
    }
    notifyLibraryUpdated();
    return result;
  });

  ipcMain.handle('music-structure:cancel-analysis', async () => ({
    cancelled: await analysisService.cancelActiveJob(),
  }));

  ipcMain.handle('music-structure:get-analysis-status', async () => ({
    activeJob: analysisService.getActiveJob(),
  }));

  ipcMain.handle('music-structure:get-capability-status', async () =>
    capabilityService.getStatus(),
  );

  function progressOptions() {
    return {
      onProgress: (progress) => {
        getMainWindow()?.webContents.send(
          'music-structure:capability-progress',
          progress,
        );
      },
    };
  }

  ipcMain.handle('music-structure:prepare-capability', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return await capabilityService.prepare(progressOptions());
    } catch (error) {
      throw publicCapabilityError(error);
    }
  });

  ipcMain.handle('music-structure:repair-capability', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return await capabilityService.repair(progressOptions());
    } catch (error) {
      throw publicCapabilityError(error);
    }
  });

  ipcMain.handle('music-structure:remove-capability', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return await capabilityService.remove();
    } catch (error) {
      throw publicCapabilityError(error);
    }
  });
}

module.exports = { registerMusicStructureHandlers };
