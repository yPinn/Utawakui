/* global require, __dirname, __filename, module, process, setTimeout, clearTimeout, AbortController */
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { Worker } = require('node:worker_threads');
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

const decode = promisify(execFile);
const MODEL_HASH =
  '6385e8c2ebc3872e82c9ff5946228de44cd3be77a750ea53698b7dbfe94b0a22';
const MAX_SECONDS = 12 * 60;
const PCM_BYTES_PER_SECOND = 32_000;
const JOB_ID = /^[0-9a-f-]{36}$/;
const algorithmHash = (() => {
  const hash = createHash('sha256').update(MODEL_HASH);
  for (const file of [
    'worker.cjs',
    'rangeRescue.cjs',
    'backingRejection.cjs',
    'cache.cjs',
  ]) {
    hash.update(fs.readFileSync(path.join(__dirname, file)));
  }
  return hash.update(fs.readFileSync(__filename)).digest('hex');
})();

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
    [
      '-af',
      rejectBacking
        ? 'pan=stereo|c0=0.5*c2+0.5*c3|c1=0.5*c0+0.5*c1'
        : 'pan=mono|c0=0.5*c2+0.5*c3',
    ],
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
  signal.throwIfAborted();
  const pcm = Uint8Array.from(stdout);
  const pitches = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'worker.cjs'), {
      workerData: { pcm, originalPcm, model, rejectBacking },
      transferList: originalPcm
        ? [pcm.buffer, originalPcm.buffer]
        : [pcm.buffer],
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
  return {
    status: 'ready',
    cacheable: !original || Boolean(originalPcm),
    durationSeconds: stdout.length / bytesPerSecond,
    stepSeconds: 0.016,
    pitches,
  };
}

function registerReferencePitch({
  ipcMain,
  getMainWindow,
  getScope,
  requireGate,
  getFfmpeg,
  modelPath,
  scheduler,
  recordDiagnostic,
}) {
  let active = null;
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
      JOB_ID.test(requestId)
    )
      cancel(requestId);
  });
  ipcMain.handle(
    'reference-pitch:analyze',
    async (event, trackId, requestId, cachedOnly = false) => {
      if (
        !allowed(event) ||
        !isBoundedTrackId(trackId) ||
        typeof requestId !== 'string' ||
        !JOB_ID.test(requestId) ||
        typeof cachedOnly !== 'boolean'
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
      active = { requestId, jobId, controller };
      event.sender.once('destroyed', abort);
      event.sender.once('render-process-gone', abort);
      try {
        const input = sourceFor(getScope(), trackId);
        if (!input) return { status: 'no-guide' };
        let ffmpeg;
        try {
          ffmpeg = getFfmpeg();
        } catch (error) {
          if (error?.code !== 'FEATURE_DEPENDENCY_MISSING') throw error;
        }
        if (!ffmpeg) return { status: 'no-decoder' };
        const stat = fs.statSync(modelPath, { throwIfNoEntry: false });
        if (!stat?.isFile() || stat.size !== 135_090)
          return { status: 'no-model' };
        const model = fs.readFileSync(modelPath);
        if (createHash('sha256').update(model).digest('hex') !== MODEL_HASH)
          return { status: 'no-model' };
        const key = await keyFor(input, ffmpeg, controller.signal);
        const cached = readPitchCache(input.cacheFile, key);
        if (controller.signal.aborted) return { status: 'cancelled' };
        if (!cached && cachedOnly) return { status: 'cache-miss' };
        const result =
          cached ??
          (await scheduler.schedule({
            jobId,
            start: () => ({
              result: analyze({
                ...input,
                ffmpeg,
                model,
                signal: controller.signal,
              }),
              cancel: () => controller.abort(),
            }),
          }));
        if (controller.signal.aborted) return { status: 'cancelled' };
        try {
          requireGate();
        } catch {
          return { status: 'gate-disabled' };
        }
        if (sourceFor(getScope(), trackId)?.stamp !== input.stamp)
          return { status: 'source-changed' };
        if (result.status !== 'ready') return result;
        const { cacheable, ...preview } = result;
        if (!cached && cacheable)
          writePitchCache(input.cacheFile, key, preview);
        return {
          ...preview,
          cached: Boolean(cached),
          recipeId: input.recipeId,
          completedAtMs: input.completedAtMs,
        };
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
    },
  );
}

module.exports = { registerReferencePitch, analyze };
