'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const { app } = require('electron');
const {
  resolveSeparationsDir,
  resolveTrackAudioPath,
  selectSeparationResult,
  findTrackRecord,
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
  createOnnxMdxJob,
} = require('../lib/audioProcessing/engines/onnxMdxJob');
const { MEDIA_SCHEME } = require('./mediaScheme');

function registerSeparationHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
}) {
  const service = createAudioProcessingService({
    resolveRecipe,
    createJobId: randomUUID,
    prepareJob: async ({ trackId, recipe }) => {
      const dir = resolveDownloadDir(getConfig());
      const track = findTrackRecord(dir, trackId);
      if (!track) throw new Error(`unknown track id: ${trackId}`);

      const outputDir = resolveSeparationsDir(dir, trackId);
      if (!outputDir) throw new Error('invalid track id');
      const inputPath = resolveTrackAudioPath(dir, track.id);
      if (!inputPath) throw new Error(`missing audio for track id: ${trackId}`);

      // Preparation remains an explicit Settings action. Runs only verify the
      // paths here, so starting a job never hides a download from a livestream.
      const userDataDir = app.getPath('userData');
      const ffmpegPath = getPreparedFfmpegPath(
        userDataDir,
        getConfig().systemFfmpegPath,
      );
      const modelPath = getPreparedSeparationModelPath(
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
      };
    },
    createEngineJob: ({ engineId, prepared, emitProgress }) => {
      if (engineId !== 'onnx-mdx') {
        throw new Error(`unsupported audio-processing engine: ${engineId}`);
      }
      return createOnnxMdxJob({
        workerPath: path.join(
          __dirname,
          '..',
          'lib',
          'vocalSeparationWorker.js',
        ),
        workerData: {
          inputPath: prepared.inputPath,
          outputDir: prepared.outputDir,
          modelPath: prepared.modelPath,
          ffmpegPath: prepared.ffmpegPath,
          recipeId: prepared.engineRecipeId,
          profileId: prepared.profileId,
          modelId: prepared.modelId,
        },
        emitProgress,
      });
    },
  });

  ipcMain.handle('separation:run', async (event, trackId, recipeId) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);
    const resolvedRecipeId = recipeId ?? DEFAULT_RECIPE_ID;
    await service.run({
      trackId,
      recipeId: resolvedRecipeId,
      onProgress: (progress) => {
        getMainWindow()?.webContents.send('separation:progress', progress);
      },
    });

    // Lets any subscriber pick up hasSeparation/stemsUrl even if the
    // triggering component has since unmounted.
    notifyLibraryUpdated();

    return {
      stemsUrl: `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}/separations/${encodeURIComponent(resolvedRecipeId)}.wav`,
    };
  });

  ipcMain.handle('separation:cancel', async () => ({
    cancelled: await service.cancelActiveJob(),
  }));

  // Switches which already-produced result plays, without running any
  // DSP — a cheap metadata write, so unlike separation:run this is not
  // gated by separationInProgress and stays usable while a different
  // track is separating.
  ipcMain.handle('separation:select', async (event, trackId, recipeId) => {
    const dir = resolveDownloadDir(getConfig());
    const separationsDir = resolveSeparationsDir(dir, trackId);
    if (!separationsDir) throw new Error('invalid track id');

    const selected = selectSeparationResult(separationsDir, recipeId);
    if (!selected) {
      throw new Error(
        `no separation result for recipe "${recipeId}" on track ${trackId}`,
      );
    }

    notifyLibraryUpdated();
    return { ok: true };
  });
}

module.exports = { registerSeparationHandlers };
