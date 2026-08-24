'use strict';

const { loadTrackMusicStructure } = require('../lib/library');
const {
  loadMusicAnalysisBenchmarkReview,
} = require('../lib/audioProcessing/musicAnalysisBenchmarkReview');

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

function publicBatchError(error) {
  const message = String(error?.message ?? '');
  if (message.includes('already running')) {
    return new Error('a music analysis batch is already running');
  }
  if (message.includes('active analysis job')) {
    return new Error('music analysis is currently in use');
  }
  if (message.includes('track ids') || message.includes('batch options')) {
    return new Error('invalid music analysis batch request');
  }
  return new Error('music analysis batch failed');
}

function benchmarkDialogOptions() {
  return {
    title: '開啟 M2 Benchmark Run',
    properties: ['openFile'],
    filters: [{ name: 'Benchmark run config', extensions: ['json'] }],
  };
}

function registerMusicStructureHandlers({
  ipcMain,
  dialog,
  getConfig,
  resolveDownloadDir,
  loadMusicStructure = loadTrackMusicStructure,
  loadBenchmarkReview = loadMusicAnalysisBenchmarkReview,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
  analysisService,
  capabilityService,
  batchService,
}) {
  ipcMain.handle('music-structure:get-track', async (event, trackId) =>
    loadMusicStructure(resolveDownloadDir(getConfig()), trackId),
  );

  ipcMain.handle('music-structure:open-benchmark-review', async () => {
    const ownerWindow = getMainWindow?.();
    const options = benchmarkDialogOptions();
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;

    try {
      return loadBenchmarkReview(result.filePaths[0], {
        expectedLibraryRoot: resolveDownloadDir(getConfig()),
      });
    } catch {
      throw new Error('unable to load benchmark review');
    }
  });

  ipcMain.handle('music-structure:analyze-track', async (event, trackId) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    if (batchService.hasActiveBatch()) {
      throw new Error('a music analysis batch is already running');
    }
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
    cancelled: batchService.hasActiveBatch()
      ? await batchService.cancel()
      : await analysisService.cancelActiveJob(),
  }));

  ipcMain.handle('music-structure:get-analysis-status', async () => ({
    activeJob: analysisService.getActiveJob(),
  }));

  ipcMain.handle('music-structure:get-batch-status', async () =>
    batchService.getStatus(),
  );

  ipcMain.handle('music-structure:start-batch', async (event, payload) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return batchService.start({
        trackIds: payload?.trackIds,
        force: payload?.force === true,
        onUpdate: (status) => {
          getMainWindow()?.webContents.send(
            'music-structure:batch-progress',
            status,
          );
        },
      });
    } catch (error) {
      throw publicBatchError(error);
    }
  });

  ipcMain.handle('music-structure:cancel-batch', async () => ({
    cancelled: await batchService.cancel(),
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
