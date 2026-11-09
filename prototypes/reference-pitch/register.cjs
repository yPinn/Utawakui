/* global require, __dirname, module, process, setTimeout, clearTimeout, AbortController */
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { Worker } = require('node:worker_threads');
const {
  readGuideReviewMarks,
  registerGuideReview,
} = require('./guideReview.cjs');
const {
  buildCacheKey,
  readPitchCache,
  writePitchCache,
} = require('./cache.cjs');
const {
  isBoundedTrackId,
  resolveTrackAudioPath,
} = require('../../electron/lib/library/paths');
const {
  loadSeparationManifest,
  resolveSeparationResultPath,
  resolveSeparationsDir,
} = require('../../electron/lib/library/separationManifest');
const {
  loadTrackMusicStructure,
} = require('../../electron/lib/library/musicStructure');

const decode = promisify(execFile);
const MODEL_HASH =
  '6385e8c2ebc3872e82c9ff5946228de44cd3be77a750ea53698b7dbfe94b0a22';
const MAX_SECONDS = 12 * 60;
const PCM_BYTES_PER_SECOND = 32_000;
const MAX_LIVE_SAMPLE_BYTES = 48 * 1024 * 1024;
const JOB_ID = /^[0-9a-f-]{36}$/;
const activityHash = createHash('sha256')
  .update(fs.readFileSync(path.join(__dirname, 'guideActivity.cjs')))
  .update(fs.readFileSync(path.join(__dirname, 'backingRejection.cjs')))
  .digest('hex');

function reviewMarksFile(cacheFile) {
  return cacheFile
    ? path.join(path.dirname(cacheFile), 'reference-pitch-review-v1.json')
    : null;
}

async function performerBeats(dir, trackId, durationSeconds) {
  try {
    const { signals, sourceDurationMs } = await loadTrackMusicStructure(
      dir,
      trackId,
    );
    if (
      sourceDurationMs === null ||
      Math.abs(sourceDurationMs - durationSeconds * 1000) >= 100
    )
      return [];
    return signals.beats
      .filter((beat) => beat.confidence >= 0.5)
      .map(({ timeMs, downbeat, positionInBar }) => ({
        timeMs,
        downbeat: downbeat ?? positionInBar === 1,
      }));
  } catch {
    // Beat guides are optional.
    return [];
  }
}

function sourceFor({ dir, epoch }, trackId) {
  const directory = resolveSeparationsDir(dir, trackId);
  if (!directory) return null;
  const manifest = loadSeparationManifest(directory);
  const result = manifest.results[manifest.selectedRecipeId];
  if (result?.outputLayout !== 'accompaniment-guide-4ch') return null;
  const selected = resolveSeparationResultPath(
    dir,
    trackId,
    result.artifactFilename,
  );
  if (!selected) return null;
  const source = fs.realpathSync(selected);
  const relative = path.relative(fs.realpathSync(dir), source);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const stat = fs.statSync(source);
  if (!stat.isFile()) return null;
  const usesHq4 =
    manifest.selectedRecipeId === 'general' &&
    result.profileId === 'mdx-inst-hq4-v1' &&
    result.modelIds.length === 1 &&
    result.modelIds[0] === 'inst-hq4';
  const rejectBacking =
    usesHq4 && process.env.UTAWAKUI_REFERENCE_JA_REST === '1';
  const completedAtMs = Date.parse(result.completedAt) || 0;
  const original =
    usesHq4 && !rejectBacking
      ? findOriginal(dir, trackId, completedAtMs)
      : null;
  return {
    source,
    phaseAvailable: usesHq4 && !rejectBacking,
    cacheFile:
      path.dirname(source) === fs.realpathSync(directory)
        ? path.join(path.dirname(source), 'reference-pitch-v1.json')
        : null,
    original: original?.source,
    recipeId: manifest.selectedRecipeId,
    rejectBacking,
    completedAtMs,
    stamp: JSON.stringify([
      epoch,
      source,
      stat.size,
      stat.mtimeMs,
      stat.ctimeMs,
      manifest.selectedRecipeId,
      result.profileId,
      result.modelIds,
      result.completedAt,
      original,
    ]),
  };
}

function findOriginal(dir, trackId, completedAtMs) {
  try {
    const resolved = resolveTrackAudioPath(dir, trackId);
    if (!resolved) return null;
    const source = fs.realpathSync(resolved);
    const relative = path.relative(fs.realpathSync(dir), source);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    if (path.dirname(source) !== fs.realpathSync(path.dirname(resolved)))
      return null;
    const stat = fs.statSync(source);
    return stat.isFile() && stat.mtimeMs <= completedAtMs
      ? { source, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs }
      : null;
  } catch {
    return null;
  }
}

async function decodePcm(ffmpeg, source, filter, bytesPerSecond, signal) {
  const { stdout } = await decode(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-xerror',
      '-threads',
      '1',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      source,
      '-map',
      '0:a:0',
      ...filter,
      '-ar',
      '16000',
      '-t',
      String(MAX_SECONDS + 1),
      '-f',
      's16le',
      'pipe:1',
    ],
    {
      encoding: 'buffer',
      windowsHide: true,
      maxBuffer: (MAX_SECONDS + 2) * bytesPerSecond,
      timeout: 30_000,
      signal,
    },
  );
  return stdout;
}

const pairedFilter = ['-af', 'pan=stereo|c0=0.5*c2+0.5*c3|c1=0.5*c0+0.5*c1'];

function runPitchWorker(file, workerData, transferList, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, file), {
      workerData,
      transferList,
    });
    let output;
    const cancel = () => {
      void worker.terminate();
    };
    const deadline = setTimeout(cancel, 45_000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.once('message', (pitches) => {
      output = pitches;
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
      if (code === 0 && output && !signal.aborted) resolve(output);
      else reject(new Error(`Pitch worker exited (${code})`));
    });
  });
}

function loadModel(modelPath) {
  const stat = fs.statSync(modelPath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size !== 135_090) return null;
  const model = fs.readFileSync(modelPath);
  return createHash('sha256').update(model).digest('hex') === MODEL_HASH
    ? model
    : null;
}

function registerLiveVocalPitch({
  ipcMain,
  modelPath,
  requireGate,
  scheduler,
  recordDiagnostic,
}) {
  let active = null;
  ipcMain.handle('performer-pitch:cancel-live', (event, requestId) => {
    if (active?.sender === event.sender && active.requestId === requestId)
      active.cancel();
  });
  ipcMain.handle(
    'performer-pitch:analyze-live',
    async (event, requestId, buffer) => {
      if (
        typeof requestId !== 'string' ||
        !JOB_ID.test(requestId) ||
        !(buffer instanceof ArrayBuffer) ||
        buffer.byteLength < 256 * Float32Array.BYTES_PER_ELEMENT ||
        buffer.byteLength > MAX_LIVE_SAMPLE_BYTES ||
        buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0
      )
        return { status: 'unavailable' };
      if (active) return { status: 'busy' };
      try {
        requireGate();
      } catch {
        return { status: 'gate-disabled' };
      }
      const controller = new AbortController();
      const jobId = `performer-live-pitch-${requestId}`;
      const cancel = () => {
        controller.abort();
        void scheduler.cancel(jobId);
      };
      const events = [
        'did-start-navigation',
        'destroyed',
        'render-process-gone',
      ];
      active = { sender: event.sender, requestId, cancel };
      for (const name of events) event.sender.once(name, cancel);
      try {
        const model = loadModel(modelPath);
        if (!model) return { status: 'no-model' };
        const pitches = await scheduler.schedule({
          jobId,
          start: () => ({
            result: runPitchWorker(
              'liveVocalWorker.cjs',
              { samples: new Float32Array(buffer), model },
              [buffer],
              controller.signal,
            ),
            cancel: () => controller.abort(),
          }),
        });
        if (controller.signal.aborted) return { status: 'cancelled' };
        try {
          requireGate();
        } catch {
          return { status: 'gate-disabled' };
        }
        return { status: 'ready', pitches };
      } catch (error) {
        if (controller.signal.aborted) return { status: 'cancelled' };
        recordDiagnostic({
          process: 'main',
          level: 'warning',
          source: 'reference-pitch',
          operation: 'analyze-live-vocal',
          code: 'LIVE_VOCAL_PITCH_FAILED',
          error,
        });
        return { status: 'unavailable' };
      } finally {
        for (const name of events) event.sender.removeListener(name, cancel);
        active = null;
      }
    },
  );
}

async function compareWithBacking(
  workerFile,
  source,
  ffmpeg,
  baseline,
  signal,
) {
  const bytesPerSecond = 2 * PCM_BYTES_PER_SECOND;
  const raw = await decodePcm(
    ffmpeg,
    source,
    pairedFilter,
    bytesPerSecond,
    signal,
  );
  if (raw.length !== Math.round(baseline.durationSeconds * 16_000) * 4)
    return null;
  const pcm = Uint8Array.from(raw);
  const pitches = baseline.pitches.slice();
  return runPitchWorker(
    workerFile,
    { pcm, pitches },
    [pcm.buffer, pitches.buffer],
    signal,
  );
}

async function analyze({
  source,
  original,
  ffmpeg,
  model,
  signal,
  rejectBacking = false,
}) {
  const bytesPerSecond = PCM_BYTES_PER_SECOND * (rejectBacking ? 2 : 1);
  const stdout = await decodePcm(
    ffmpeg,
    source,
    rejectBacking ? pairedFilter : ['-af', 'pan=mono|c0=0.5*c2+0.5*c3'],
    bytesPerSecond,
    signal,
  );
  if (stdout.length > MAX_SECONDS * bytesPerSecond)
    return { status: 'too-long' };
  if (
    stdout.length < bytesPerSecond * 0.016 ||
    stdout.length % (rejectBacking ? 4 : 2)
  )
    return { status: 'unavailable' };
  let originalPcm = null;
  if (original) {
    try {
      const raw = await decodePcm(
        ffmpeg,
        original,
        ['-ac', '1'],
        PCM_BYTES_PER_SECOND,
        signal,
      );
      if (
        raw.length % 2 === 0 &&
        Math.abs(raw.length - stdout.length) < PCM_BYTES_PER_SECOND / 10
      )
        originalPcm = Uint8Array.from(raw);
    } catch {
      signal.throwIfAborted();
    }
  }
  const pcm = Uint8Array.from(stdout);
  const pitches = await runPitchWorker(
    'worker.cjs',
    { pcm, originalPcm, model, rejectBacking },
    originalPcm ? [pcm.buffer, originalPcm.buffer] : [pcm.buffer],
    signal,
  );
  return {
    status: 'ready',
    cacheable: !original || Boolean(originalPcm),
    durationSeconds: stdout.length / bytesPerSecond,
    stepSeconds: 0.016,
    pitches,
  };
}

// Cache the baseline by its decoding and inference code, independently of
// request orchestration and display-only comparisons.
const algorithmHash = (() => {
  const hash = createHash('sha256').update(MODEL_HASH);
  for (const file of [
    'worker.cjs',
    'rangeRescue.cjs',
    'backingRejection.cjs',
  ]) {
    hash.update(fs.readFileSync(path.join(__dirname, file)));
  }
  return hash
    .update(
      JSON.stringify([
        MAX_SECONDS,
        PCM_BYTES_PER_SECOND,
        pairedFilter,
        decodePcm.toString(),
        runPitchWorker.toString(),
        analyze.toString(),
      ]),
    )
    .digest('hex');
})();

function registerReferencePitch({
  ipcMain,
  getMainWindow,
  getPerformerSource,
  getScope,
  requireGate,
  getFfmpeg,
  modelPath,
  scheduler,
  recordDiagnostic,
}) {
  let active = null;
  let reviewPitch = null;
  const recentKeys = new Map();
  async function keyFor(input, ffmpeg, signal) {
    if (!input.cacheFile) return null;
    try {
      const decoder = fs.statSync(ffmpeg);
      const stamp = [decoder.size, decoder.mtimeMs, decoder.ctimeMs];
      const identity = JSON.stringify([
        input.stamp,
        input.rejectBacking,
        stamp,
      ]);
      const existing = recentKeys.get(identity);
      if (existing) return existing;
      const key = await buildCacheKey(input, algorithmHash, stamp, signal);
      if (recentKeys.size >= 24)
        recentKeys.delete(recentKeys.keys().next().value);
      recentKeys.set(identity, key);
      return key;
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }
  const allowed = (event) => {
    const window = getMainWindow();
    return Boolean(
      window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame,
    );
  };
  const cancel = (requestId) => {
    if (active?.requestId !== requestId) return;
    const { jobId, controller } = active;
    controller.abort();
    void scheduler.cancel(jobId);
  };
  ipcMain.handle('reference-pitch:cancel', (event, requestId) => {
    if (
      allowed(event) &&
      typeof requestId === 'string' &&
      JOB_ID.test(requestId) &&
      active?.sender === event.sender
    )
      cancel(requestId);
  });
  async function requestAnalysis(
    event,
    trackId,
    requestId,
    cachedOnly = false,
    phase = false,
    expectedGuide = null,
  ) {
    if (
      !isBoundedTrackId(trackId) ||
      typeof requestId !== 'string' ||
      !JOB_ID.test(requestId) ||
      typeof cachedOnly !== 'boolean' ||
      typeof phase !== 'boolean' ||
      (cachedOnly && phase)
    )
      return { status: 'unavailable' };
    if (active) return { status: 'busy' };
    try {
      requireGate();
    } catch {
      return { status: 'gate-disabled' };
    }
    const controller = new AbortController();
    const jobId = `reference-pitch-${requestId}`;
    const abort = () => cancel(requestId);
    active = { requestId, jobId, controller, sender: event.sender };
    event.sender.once('destroyed', abort);
    event.sender.once('render-process-gone', abort);
    try {
      const scope = getScope();
      const input = sourceFor(scope, trackId);
      if (!input) return { status: 'no-guide' };
      if (
        expectedGuide &&
        (expectedGuide.recipeId !== input.recipeId ||
          expectedGuide.completedAtMs !== input.completedAtMs)
      )
        return { status: 'source-changed' };
      if (phase && !input.phaseAvailable)
        return { status: 'comparison-unavailable' };
      const activity = Boolean(expectedGuide && input.phaseAvailable);
      const comparisonWorker = activity
        ? 'guideActivity.cjs'
        : phase
          ? 'phaseComparison.cjs'
          : null;
      let ffmpeg;
      try {
        ffmpeg = getFfmpeg();
      } catch (error) {
        if (error?.code !== 'FEATURE_DEPENDENCY_MISSING') throw error;
      }
      if (!ffmpeg) return { status: 'no-decoder' };
      const model = loadModel(modelPath);
      if (!model) return { status: 'no-model' };
      const key = await keyFor(input, ffmpeg, controller.signal);
      const cached = readPitchCache(input.cacheFile, key);
      const activityFile =
        activity && input.cacheFile
          ? path.join(
              path.dirname(input.cacheFile),
              'reference-pitch-activity-v1.json',
            )
          : null;
      const activityKey =
        activityFile && key
          ? createHash('sha256').update(key).update(activityHash).digest('hex')
          : null;
      const cachedActivity =
        cached && readPitchCache(activityFile, activityKey);
      if (controller.signal.aborted) return { status: 'cancelled' };
      if (!cached && cachedOnly) return { status: 'cache-miss' };
      const { baseline, compared } =
        cached && (!comparisonWorker || cachedActivity)
          ? { baseline: cached, compared: cachedActivity?.pitches }
          : await scheduler.schedule({
              jobId,
              start: () => ({
                result: (async () => {
                  const baseline =
                    cached ??
                    (await analyze({
                      ...input,
                      ffmpeg,
                      model,
                      signal: controller.signal,
                    }));
                  const compared =
                    comparisonWorker && baseline.status === 'ready'
                      ? await compareWithBacking(
                          comparisonWorker,
                          input.source,
                          ffmpeg,
                          baseline,
                          controller.signal,
                        ).catch((error) => {
                          if (!activity) throw error;
                          controller.signal.throwIfAborted();
                          recordDiagnostic({
                            process: 'main',
                            level: 'warning',
                            source: 'reference-pitch',
                            operation: 'guide-activity',
                            code: 'REFERENCE_GUIDE_ACTIVITY_FAILED',
                            error,
                          });
                          return null;
                        })
                      : null;
                  return { baseline, compared };
                })(),
                cancel: () => controller.abort(),
              }),
            });
      if (controller.signal.aborted) return { status: 'cancelled' };
      try {
        requireGate();
      } catch {
        return { status: 'gate-disabled' };
      }
      if (sourceFor(getScope(), trackId)?.stamp !== input.stamp)
        return { status: 'source-changed' };
      if (baseline.status !== 'ready') return baseline;
      const { cacheable, ...preview } = baseline;
      if (!cached && cacheable) writePitchCache(input.cacheFile, key, preview);
      if (activity && compared && !cachedActivity && (cached || cacheable)) {
        writePitchCache(activityFile, activityKey, {
          ...preview,
          pitches: compared,
        });
      }
      if (phase && !compared) return { status: 'comparison-unavailable' };
      const result = {
        ...preview,
        pitches: compared ?? preview.pitches,
        phaseAvailable: input.phaseAvailable,
        cached: Boolean(cached),
        recipeId: input.recipeId,
        completedAtMs: input.completedAtMs,
      };
      if (expectedGuide) {
        const beats = await performerBeats(
          scope.dir,
          trackId,
          preview.durationSeconds,
        );
        if (controller.signal.aborted) return { status: 'cancelled' };
        if (sourceFor(getScope(), trackId)?.stamp !== input.stamp)
          return { status: 'source-changed' };
        let marks = [];
        try {
          marks = readGuideReviewMarks(
            reviewMarksFile(input.cacheFile),
            expectedGuide,
          );
        } catch {
          // An unreadable review file cannot replace the acoustic result.
        }
        reviewPitch = {
          stamp: input.stamp,
          playbackRevision: expectedGuide.playbackRevision,
          durationSeconds: preview.durationSeconds,
          stepSeconds: preview.stepSeconds,
          baseline: preview.pitches,
          shown: compared ?? preview.pitches,
          maskApplied: activity && Boolean(compared),
        };
        return { ...result, marks, beats };
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) return { status: 'cancelled' };
      recordDiagnostic({
        process: 'main',
        level: 'warning',
        source: 'reference-pitch',
        operation: 'analyze',
        code: 'REFERENCE_PITCH_FAILED',
        error,
      });
      return { status: 'unavailable' };
    } finally {
      event.sender.removeListener('destroyed', abort);
      event.sender.removeListener('render-process-gone', abort);
      active = null;
    }
  }
  ipcMain.handle('reference-pitch:analyze', async (event, ...args) =>
    allowed(event)
      ? requestAnalysis(event, ...args.slice(0, 4))
      : { status: 'unavailable' },
  );
  if (getPerformerSource) {
    registerLiveVocalPitch({
      ipcMain,
      modelPath,
      requireGate,
      scheduler,
      recordDiagnostic,
    });
    registerGuideReview({
      ipcMain,
      requireGate,
      getFfmpeg,
      scheduler,
      recordDiagnostic,
      getSource: () => {
        const current = getPerformerSource();
        if (
          !current ||
          reviewPitch?.playbackRevision !== current.playbackRevision
        )
          return null;
        const scope = getScope();
        const input = sourceFor(scope, current.trackId);
        if (
          !input ||
          input.stamp !== reviewPitch.stamp ||
          input.recipeId !== current.recipeId ||
          input.completedAtMs !== current.completedAtMs
        )
          return null;
        const original = findOriginal(
          scope.dir,
          current.trackId,
          input.completedAtMs,
        );
        if (!original) return null;
        return {
          ...reviewPitch,
          ...current,
          identity: JSON.stringify([
            input.stamp,
            current.playbackRevision,
            original,
          ]),
          original: original.source,
          source: input.source,
          marksFile: reviewMarksFile(input.cacheFile),
        };
      },
    });
    ipcMain.handle('performer-pitch:cancel', (event, requestId) => {
      if (active?.sender === event.sender && active.requestId === requestId)
        cancel(requestId);
    });
    ipcMain.handle('performer-pitch:analyze', async (event, requestId) => {
      const source = getPerformerSource();
      if (!source) return { status: 'no-guide' };
      const result = await requestAnalysis(
        event,
        source.trackId,
        requestId,
        false,
        false,
        source,
      );
      const current = getPerformerSource();
      return current?.trackId === source.trackId &&
        current.playbackRevision === source.playbackRevision &&
        current.recipeId === source.recipeId &&
        current.completedAtMs === source.completedAtMs
        ? result
        : { status: 'source-changed' };
    });
  }
}

module.exports = { registerReferencePitch, analyze };
