'use strict';

// Runs the CPU-bound separateTrack() off the main thread so it doesn't
// stall the utawakui-media:// protocol handler. Spawned by main.js's
// separation:run handler. Messages are `type`-discriminated (not an `ok`
// boolean) since there are three kinds: zero+ 'progress', then one
// 'done'/'error'.

const { parentPort, workerData } = require('worker_threads');
const { separateTrack } = require('./vocalSeparation');

(async () => {
  try {
    const {
      inputPath,
      outputDir,
      modelPath,
      ffmpegPath,
      recipeId,
      profileId,
      modelId,
    } = workerData;
    const result = await separateTrack(
      inputPath,
      outputDir,
      modelPath,
      ffmpegPath,
      (progress) => {
        parentPort.postMessage({ type: 'progress', ...progress });
      },
      recipeId,
      profileId,
      modelId,
    );
    parentPort.postMessage({ type: 'done', result });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      error: err.message || String(err),
    });
  }
})();
