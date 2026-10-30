'use strict';

const path = require('path');
const { resolveRuntimeEntry } = require('../lib/runtimeEntries');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const {
  resolveSeparationsDir,
  resolveTrackAudioPath,
  selectSeparationResult,
  findTrackRecord,
  loadSeparationManifest,
  hasSeparationResultFile,
} = require('../lib/library');
const {
  getPreparedFfmpegPath,
  getPreparedSeparationModelPath,
} = require('../lib/featureDependencies');
const {
  DEFAULT_RECIPE_ID,
  resolveRecipe,
} = require('../lib/audioProcessing/recipes');
const {
  createAudioProcessingService,
} = require('../lib/audioProcessing/service');
const {
  createSeparationQueueService,
} = require('../lib/audioProcessing/separationQueueService');
const {
  createOnnxMdxJob,
} = require('../lib/audioProcessing/engines/onnxMdxJob');
const { MEDIA_SCHEME } = require('./mediaScheme');
const { createAppError } = require('../lib/appError');
const {
  normalizeSeparationOutputFormat,
  createSeparationOutputJob,
} = require('../lib/audioProcessing/separationOutputJob');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const {
  enforceLibraryStoragePolicySafely,
} = require('./libraryStorageHandlers');

const SOURCE_UNAVAILABLE_CODE = 'SEPARATION_SOURCE_UNAVAILABLE';

function sourceUnavailableError(message) {
  return Object.assign(new Error(message), { code: SOURCE_UNAVAILABLE_CODE });
}

function registerSeparationHandlers({
  ipcMain,
  getConfig,
  updateConfig = () => undefined,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
  heavyJobScheduler,
  recordDiagnostic,
  onQueueUpdate = () => undefined,
  onSeparationComplete = () => undefined,
  // Injectable overrides (not vi.mock) are this codebase's established seam
  // for handler tests — same convention as libraryHandlers.js's
  // `findLibraryTrackRecord = findTrackRecord` and importHandlers.js's
  // `listLibraryTracks = listTracks`.
  findSeparationTrackRecord = findTrackRecord,
  resolveSeparationsOutputDir = resolveSeparationsDir,
  resolveSeparationInputAudioPath = resolveTrackAudioPath,
  selectStoredSeparationResult = selectSeparationResult,
  getPreparedSeparationFfmpegPath = getPreparedFfmpegPath,
  getPreparedSeparationModel = getPreparedSeparationModelPath,
  resolveUserDataDir = () => app.getPath('userData'),
  createSeparationEngineJob = createOnnxMdxJob,
  // Closed in the formal composition root; isolated factories opt in explicitly.
  allowFlacOutput = false,
  createControlledOutputJob = createSeparationOutputJob,
  createSeparationQueue = createSeparationQueueService,
  loadStoredSeparationManifest = loadSeparationManifest,
  hasStoredSeparationResultFile = hasSeparationResultFile,
  enforceLibraryStoragePolicy = async () => undefined,
  getLibraryScope = () => ({ dir: resolveDownloadDir(getConfig()), epoch: 0 }),
}) {
  const assertOutputFormat = (value) => {
    const format = normalizeSeparationOutputFormat(value);
    if (format === 'flac5' && allowFlacOutput !== true)
      throw new Error('FLAC separation output is not enabled');
    return format;
  };
  const service = createAudioProcessingService({
    resolveRecipe,
    createJobId: randomUUID,
    prepareJob: async ({ trackId, recipe, outputFormat }) => {
      const format = assertOutputFormat(outputFormat);
      const dir = resolveDownloadDir(getConfig());
      const track = findSeparationTrackRecord(dir, trackId);
      if (!track) throw sourceUnavailableError(`unknown track id: ${trackId}`);

      const outputDir = resolveSeparationsOutputDir(dir, trackId);
      if (!outputDir) throw new Error('invalid track id');
      const inputPath = resolveSeparationInputAudioPath(dir, track.id);
      if (!inputPath) {
        throw sourceUnavailableError(`missing audio for track id: ${trackId}`);
      }

      // Preparation remains an explicit Settings action. Runs only verify the
      // paths here, so starting a job never hides a download from a livestream.
      const userDataDir = resolveUserDataDir();
      const ffmpegPath = getPreparedSeparationFfmpegPath(
        userDataDir,
        getConfig().systemFfmpegPath,
        {
          onStaleSystemPath: () => updateConfig({ systemFfmpegPath: null }),
        },
      );
      const modelPath = getPreparedSeparationModel(
        userDataDir,
        recipe.modelIds[0],
      );
      return {
        inputPath,
        outputDir,
        modelPath,
        ffmpegPath,
        engineRecipeId: recipe.engineRecipeId,
        profileId: recipe.profileId,
        modelId: recipe.modelIds[0],
        // Boolean product intent read fresh per run, not a renderer-chosen
        // execution-provider name — see ADR 0017/0009.
        preferGpu: getConfig().separationGpuAcceleration !== false,
        ...(format === 'flac5' ? { outputFormat: format } : {}),
      };
    },
    createEngineJob: ({
      jobId,
      trackId,
      engineId,
      prepared,
      emitProgress,
      assertCurrent,
    }) => {
      if (engineId !== 'onnx-mdx') {
        throw new Error(`unsupported audio-processing engine: ${engineId}`);
      }
      return {
        result: heavyJobScheduler.schedule({
          jobId,
          start: () => {
            assertCurrent();
            requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
            const createJob =
              prepared.outputFormat === 'flac5'
                ? createControlledOutputJob
                : createSeparationEngineJob;
            return createJob({
              ...(prepared.outputFormat === 'flac5'
                ? {
                    createWorkerJob: createSeparationEngineJob,
                    onRecovery: (result, error) =>
                      recordDiagnostic?.({
                        source: 'separation',
                        operation: 'output-recovery',
                        code: 'SEPARATION_OUTPUT_RECOVERY_DEFERRED',
                        error,
                        context: { trackId, deferred: result.deferred.length },
                      }),
                    onFallback: (error) =>
                      recordDiagnostic?.({
                        source: 'separation',
                        operation: 'flac-output',
                        code: 'SEPARATION_FLAC_FALLBACK',
                        error,
                        context: { trackId, presetId: prepared.engineRecipeId },
                      }),
                    assertCurrent: () => {
                      assertCurrent();
                      assertOutputFormat(prepared.outputFormat);
                      requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
                    },
                  }
                : {}),
              workerPath: resolveRuntimeEntry(
                path.resolve(__dirname, '../..'),
                'separationWorker',
              ),
              workerData: {
                inputPath: prepared.inputPath,
                outputDir: prepared.outputDir,
                modelPath: prepared.modelPath,
                ffmpegPath: prepared.ffmpegPath,
                recipeId: prepared.engineRecipeId,
                profileId: prepared.profileId,
                modelId: prepared.modelId,
                preferGpu: prepared.preferGpu,
              },
              emitProgress,
            });
          },
        }),
        cancel: () => heavyJobScheduler.cancel(jobId),
      };
    },
  });

  const queueService = createSeparationQueue({
    resolveRecipe,
    getScopeKey: () => {
      const scope = getLibraryScope();
      return JSON.stringify([path.resolve(scope.dir), scope.epoch]);
    },
    createItemId: randomUUID,
    hasCurrentResult: ({ trackId, recipeId }) => {
      const recipe = resolveRecipe(recipeId);
      const dir = resolveDownloadDir(getConfig());
      const separationsDir = resolveSeparationsOutputDir(dir, trackId);
      if (!separationsDir) return false;
      const result =
        loadStoredSeparationManifest(separationsDir).results[recipe.id];
      return Boolean(
        result?.profileId === recipe.profileId &&
        hasStoredSeparationResultFile(separationsDir, result.artifactFilename),
      );
    },
    runTrack: async ({
      trackId,
      recipeId,
      outputFormat,
      onProgress,
      assertCurrent = () => {},
    }) => {
      // A queue item can start long after it was added. Recheck the gate at
      // the execution boundary, but keep this expected control flow outside
      // the operational diagnostic wrapper.
      requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'separation',
            operation: 'run',
            code: 'SEPARATION_RUN_FAILED',
            context: { presetId: recipeId },
          },
          classifyError: (error) =>
            error?.code === SOURCE_UNAVAILABLE_CODE
              ? { failureReason: 'source-unavailable' }
              : undefined,
          publicError: {
            code: 'SEPARATION_RUN_FAILED',
            title: '伴奏準備未完成',
            message: '伴奏還沒準備好，請再試一次。',
            context: { presetId: recipeId, retryable: true },
          },
        },
        async () => {
          const result = await service.run({
            trackId,
            recipeId,
            ...(outputFormat ? { outputFormat } : {}),
            assertCurrent,
            onProgress: (progress) => {
              getMainWindow()?.webContents.send(
                'separation:progress',
                progress,
              );
              onProgress(progress);
            },
          });
          const protectedTrackIds =
            queueService
              .getStatus()
              .queue?.items.filter(({ status }) =>
                ['pending', 'checking', 'running'].includes(status),
              )
              .map(({ trackId: queuedTrackId }) => queuedTrackId) ?? [];
          await enforceLibraryStoragePolicySafely({
            enforceLibraryStoragePolicy,
            options: {
              protectedTrackIds: [...new Set([trackId, ...protectedTrackIds])],
            },
            recordDiagnostic,
          });
          assertCurrent();
          notifyLibraryUpdated();
          // Publication succeeded. Lyrics are an independent opt-in job;
          // even a scheduling failure must preserve this successful accompaniment.
          try {
            onSeparationComplete(trackId);
          } catch (error) {
            try {
              recordDiagnostic?.({
                source: 'separation',
                operation: 'enqueue-experimental-lyrics',
                code: 'LYRICS_EXPERIMENTAL_ENQUEUE_FAILED',
                error,
              });
            } catch {
              /* Optional diagnostics. */
            }
          }
          return result;
        },
      );
    },
    cancelActiveTrack: () => service.cancelActiveJob(),
    onUpdate: (status) => {
      try {
        onQueueUpdate(status);
      } catch (error) {
        recordDiagnostic({
          source: 'separation',
          operation: 'project-taskbar-progress',
          code: 'SEPARATION_TASKBAR_PROGRESS_FAILED',
          error,
        });
      }
      getMainWindow()?.webContents.send('separation:queue-progress', status);
    },
  });

  ipcMain.handle(
    'separation:run',
    async (event, trackId, recipeId, outputFormat) => {
      requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
      const format = assertOutputFormat(outputFormat);
      const resolvedRecipeId = recipeId ?? DEFAULT_RECIPE_ID;
      const queued = queueService.enqueue({
        trackIds: [trackId],
        recipeId: resolvedRecipeId,
        regenerate: true,
        ...(format === 'flac5' ? { outputFormat: format } : {}),
      });
      const completed = await queueService.waitForItem(queued.itemIds[0]);
      const artifactFilename =
        completed?.result?.artifactFilename ?? `${resolvedRecipeId}.wav`;
      return {
        stemsUrl: `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}/separations/${encodeURIComponent(artifactFilename)}`,
      };
    },
  );

  ipcMain.handle('separation:cancel', async () => ({
    cancelled: await queueService.cancelActive(),
  }));

  ipcMain.handle('separation:get-queue-status', async () =>
    queueService.getStatus(),
  );

  ipcMain.handle('separation:enqueue', async (event, payload) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    const format = assertOutputFormat(payload?.outputFormat);
    return queueService.enqueue({
      trackIds: payload?.trackIds,
      recipeId: payload?.recipeId ?? DEFAULT_RECIPE_ID,
      regenerate: payload?.regenerate ?? false,
      ...(format === 'flac5' ? { outputFormat: format } : {}),
    });
  });

  ipcMain.handle('separation:pause-queue', async () => queueService.pause());

  ipcMain.handle('separation:resume-queue', async () => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    return queueService.resume();
  });

  ipcMain.handle(
    'separation:move-queue-item',
    async (event, itemId, offset) => ({
      moved: queueService.move(itemId, offset),
    }),
  );

  ipcMain.handle('separation:remove-queue-item', async (event, itemId) => ({
    removed: queueService.remove(itemId),
  }));

  ipcMain.handle('separation:retry-queue-item', async (event, itemId) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    return { retried: queueService.retry(itemId) };
  });

  ipcMain.handle('separation:clear-pending', async () => ({
    removed: queueService.clearPending(),
  }));

  ipcMain.handle('separation:clear-completed', async () => ({
    removed: queueService.clearCompleted(),
  }));

  // Switches which already-produced result plays, without running any
  // DSP — a cheap metadata write, so unlike separation:run this is not
  // gated by separationInProgress and stays usable while a different
  // track is separating. Both throws below mean "the requested target no
  // longer exists" (track/recipe removed out-of-band) — expected control
  // flow, not an operational failure, so they stay outside the diagnostic
  // boundary and are never persisted.
  ipcMain.handle('separation:select', async (event, trackId, recipeId) => {
    const dir = resolveDownloadDir(getConfig());
    const separationsDir = resolveSeparationsOutputDir(dir, trackId);
    if (!separationsDir) {
      throw createAppError({
        code: 'SEPARATION_INVALID_TRACK',
        severity: 'warning',
        title: '找不到這首歌曲',
        message: '這首歌曲的伴奏目前無法使用。',
      });
    }

    const selected = selectStoredSeparationResult(separationsDir, recipeId);
    if (!selected) {
      throw createAppError({
        code: 'SEPARATION_RESULT_MISSING',
        severity: 'warning',
        title: '找不到這個伴奏版本',
        message: '這個伴奏版本目前無法使用，請重新準備。',
      });
    }

    notifyLibraryUpdated();
    return { ok: true };
  });
}

module.exports = { registerSeparationHandlers };
