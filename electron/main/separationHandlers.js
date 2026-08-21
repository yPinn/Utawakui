'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { app } = require('electron');
const {
  resolveSeparationsDir,
  resolveTrackAudioPath,
  selectSeparationResult,
  findTrackRecord,
} = require('../lib/library');
const {
  SEPARATION_PRESETS,
  DEFAULT_PRESET_ID,
  resolvePreset,
} = require('../lib/vocalSeparation');
const {
  getPreparedFfmpegPath,
  getPreparedSeparationModelPath,
} = require('../lib/featureDependencies');
const { MEDIA_SCHEME } = require('./mediaScheme');

// Main owns this guard because renderer disabled state is not authoritative.
let separationInProgress = false;

function registerSeparationHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  getMainWindow,
  notifyLibraryUpdated,
  requireFeatureGate,
  featureIds,
}) {
  ipcMain.handle('separation:run', async (event, trackId, presetId) => {
    requireFeatureGate(featureIds.AUDIO_PROCESSING_FLOW);

    const dir = resolveDownloadDir(getConfig());
    const track = findTrackRecord(dir, trackId);
    if (!track) throw new Error(`unknown track id: ${trackId}`);

    const outDir = resolveSeparationsDir(dir, trackId);
    if (!outDir) throw new Error('invalid track id');
    const inputPath = resolveTrackAudioPath(dir, track.id);
    if (!inputPath) throw new Error(`missing audio for track id: ${trackId}`);

    // Fail loudly on an unrecognized preset id rather than silently
    // falling back — a UI bug should surface immediately, not quietly
    // always run "standard".
    if (presetId != null && !SEPARATION_PRESETS[presetId]) {
      throw new Error(`unknown separation preset: ${presetId}`);
    }
    const resolvedPresetId = presetId ?? DEFAULT_PRESET_ID;

    // Running two separations at once (same track racing writes, or
    // different tracks saturating ONNX's all-cores pool while the user
    // might be live) is worse than rejecting the second call.
    if (separationInProgress) {
      throw new Error('已經有一首曲目在分離中,請等它完成後再試一次。');
    }
    separationInProgress = true;
    try {
      // Dependency/model preparation is a Settings action. A separation run
      // only verifies paths here so livestream work never starts with a hidden
      // download. CPU-heavy decode/inference stays inside the worker.
      const { modelId } = resolvePreset(resolvedPresetId);
      const userDataDir = app.getPath('userData');
      const ffmpegPath = getPreparedFfmpegPath(
        userDataDir,
        getConfig().systemFfmpegPath,
      );
      const modelPath = getPreparedSeparationModelPath(userDataDir, modelId);
      await new Promise((resolve, reject) => {
        const worker = new Worker(
          path.join(__dirname, '..', 'lib', 'vocalSeparationWorker.js'),
          {
            workerData: {
              inputPath,
              outputDir: outDir,
              modelPath,
              ffmpegPath,
              presetId: resolvedPresetId,
            },
          },
        );
        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            const progressWin = getMainWindow();
            if (progressWin) {
              progressWin.webContents.send('separation:progress', {
                trackId,
                presetId: resolvedPresetId,
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
      notifyLibraryUpdated();
    } finally {
      separationInProgress = false;
    }

    return {
      stemsUrl: `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}/separations/${encodeURIComponent(resolvedPresetId)}.wav`,
    };
  });

  // Switches which already-produced result plays, without running any
  // DSP — a cheap metadata write, so unlike separation:run this is not
  // gated by separationInProgress and stays usable while a different
  // track is separating.
  ipcMain.handle('separation:select', async (event, trackId, presetId) => {
    const dir = resolveDownloadDir(getConfig());
    const separationsDir = resolveSeparationsDir(dir, trackId);
    if (!separationsDir) throw new Error('invalid track id');

    const selected = selectSeparationResult(separationsDir, presetId);
    if (!selected) {
      throw new Error(
        `no separation result for preset "${presetId}" on track ${trackId}`,
      );
    }

    notifyLibraryUpdated();
    return { ok: true };
  });
}

module.exports = { registerSeparationHandlers };
