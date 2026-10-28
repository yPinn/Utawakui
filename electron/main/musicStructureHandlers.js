'use strict';

const { loadTrackMusicStructure } = require('../lib/library');
const {
  loadMusicAnalysisBenchmarkReview,
} = require('../lib/audioProcessing/musicAnalysisBenchmarkReview');
const {
  createMusicAnalysisReferenceAnnotationService,
} = require('../lib/audioProcessing/musicAnalysisReferenceAnnotation');

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

// Fallback public messages mean the cause was not an expected state (busy,
// cancelled, not installed, missing track, invalid request); only those are
// recorded. The public strings stay plain: the renderer classifies them.
const UNEXPECTED_FAILURES = new Set([
  'music structure analysis failed',
  'music analysis preparation failed',
  'music analysis batch failed',
  'unable to load benchmark review',
  'unable to open reference annotation',
  'unable to save reference annotation',
]);

function benchmarkDialogOptions() {
  return {
    title: '開啟 M2 Benchmark Run',
    properties: ['openFile'],
    filters: [{ name: 'Benchmark run config', extensions: ['json'] }],
  };
}

function referenceAnnotationDialogOptions() {
  return {
    title: '開啟 M2 人工標註工作集',
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
  referenceAnnotationService = createMusicAnalysisReferenceAnnotationService(),
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
  analysisService,
  capabilityService,
  batchService,
  recordDiagnostic,
}) {
  function publicFailure(error, publicError, operation, code) {
    if (UNEXPECTED_FAILURES.has(publicError.message)) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'error',
          source: 'audio-processing',
          operation,
          code,
          error,
          context: { retryable: true },
        });
      } catch {
        // Diagnostics are fail-open and never replace the public failure.
      }
    }
    return publicError;
  }

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
    } catch (error) {
      throw publicFailure(
        error,
        new Error('unable to load benchmark review'),
        'benchmark-review-open',
        'MUSIC_ANALYSIS_BENCHMARK_OPEN_FAILED',
      );
    }
  });

  ipcMain.handle('music-structure:open-reference-annotation', async () => {
    const ownerWindow = getMainWindow?.();
    const options = referenceAnnotationDialogOptions();
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;

    try {
      return referenceAnnotationService.open(result.filePaths[0], {
        expectedLibraryRoot: resolveDownloadDir(getConfig()),
      });
    } catch (error) {
      throw publicFailure(
        error,
        new Error('unable to open reference annotation'),
        'reference-annotation-open',
        'MUSIC_ANALYSIS_ANNOTATION_OPEN_FAILED',
      );
    }
  });

  ipcMain.handle(
    'music-structure:save-reference-annotation',
    async (event, payload) => {
      try {
        return referenceAnnotationService.save(payload);
      } catch (error) {
        throw publicFailure(
          error,
          new Error('unable to save reference annotation'),
          'reference-annotation-save',
          'MUSIC_ANALYSIS_ANNOTATION_SAVE_FAILED',
        );
      }
    },
  );

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
      throw publicFailure(
        error,
        publicAnalysisError(error),
        'analyze-track',
        'MUSIC_ANALYSIS_FAILED',
      );
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
      throw publicFailure(
        error,
        publicBatchError(error),
        'start-batch',
        'MUSIC_ANALYSIS_BATCH_START_FAILED',
      );
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
      throw publicFailure(
        error,
        publicCapabilityError(error),
        'prepare-capability',
        'MUSIC_ANALYSIS_CAPABILITY_FAILED',
      );
    }
  });

  ipcMain.handle('music-structure:repair-capability', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return await capabilityService.repair(progressOptions());
    } catch (error) {
      throw publicFailure(
        error,
        publicCapabilityError(error),
        'repair-capability',
        'MUSIC_ANALYSIS_CAPABILITY_FAILED',
      );
    }
  });

  ipcMain.handle('music-structure:remove-capability', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    try {
      return await capabilityService.remove();
    } catch (error) {
      throw publicFailure(
        error,
        publicCapabilityError(error),
        'remove-capability',
        'MUSIC_ANALYSIS_CAPABILITY_FAILED',
      );
    }
  });
}

module.exports = { registerMusicStructureHandlers };
