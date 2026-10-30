'use strict';
const fs = require('fs'),
  path = require('path');
const { encodeWav } = require('../../electron/lib/vocalSeparation');
const {
  recordSeparationResult,
} = require('../../electron/lib/library/separationManifest');
const {
  createSeparationOutputJob,
} = require('../../electron/lib/audioProcessing/separationOutputJob');
const [outputDir, phase, livePid] = process.argv.slice(2);
process.on('message', () => {});
const metadata = {
  recipeId: 'general',
  recipeVersion: 1,
  engineId: 'onnx-mdx',
  profileId: 'mdx-inst-hq4-v1',
  modelIds: ['inst-hq4'],
  artifactFilename: 'general.wav',
  completedAt: '2026-10-30',
  outputLayout: 'accompaniment-guide-4ch',
};
function block() {
  process.send({ ready: true, phase });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
const job = createSeparationOutputJob({
  workerData: {
    outputDir,
    recipeId: 'general',
    profileId: metadata.profileId,
    modelId: 'inst-hq4',
  },
  createWorkerJob: ({ workerData }) => {
    fs.writeFileSync(
      path.join(workerData.outputDir, 'general.wav'),
      encodeWav(
        Array.from({ length: 4 }, () => new Float32Array([0.1, 0.2])),
        44100,
      ),
    );
    recordSeparationResult(workerData.outputDir, metadata);
    if (phase === 'worker') {
      process.send({ ready: true, phase });
      return { result: new Promise(() => {}), cancel: async () => {} };
    }
    return { result: Promise.resolve(), cancel: async () => {} };
  },
  createTranscodeJob: () => {
    if (phase === 'encoding') {
      const pid = Number(livePid);
      setImmediate(() => process.send({ ready: true, phase, childPid: pid }));
      return { pid, result: new Promise(() => {}), cancel: async () => {} };
    }
    return {
      result: Promise.reject(new Error('intentional test fallback')),
      cancel: async () => {},
    };
  },
  recordResult: (dir, result) => {
    if (phase === 'committed') recordSeparationResult(dir, result);
    block();
  },
});
job.result.catch((error) => {
  process.send({ error: String(error) });
  process.exitCode = 1;
  process.disconnect();
});
