/* global require, module, AbortController */
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { atomicWriteExclusiveText } = require('../../electron/lib/atomicWrite');

const decode = promisify(execFile);
const RATE = 16000;
const SPAN_MS = 8000;
const LABELS = new Set([
  'voice',
  'no-voice',
  'unsure',
  'octave-up',
  'octave-down',
]);
const TECHNIQUE_KINDS = new Set(['rise', 'fall', 'vibrato']);
const MAX_TECHNIQUE_CUES = 128;
const MAX_TECHNIQUE_CUE_BYTES = 16 * 1024;
const REQUEST_ID = /^[0-9a-f-]{36}$/;
const MAX_MARKS = 256;

function validRange(from, to, floor, ceiling) {
  return (
    Number.isSafeInteger(from) &&
    Number.isSafeInteger(to) &&
    from >= floor &&
    to <= ceiling &&
    to - from >= 16
  );
}

function readMarks(file) {
  if (!file) return [];
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isFile() || stat.size > 128 * 1024) throw Error('REVIEW_FILE');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    data.version !== 1 ||
    !Array.isArray(data.marks) ||
    data.marks.length > MAX_MARKS ||
    !data.marks.every(
      (mark) =>
        mark &&
        typeof mark.trackId === 'string' &&
        typeof mark.recipeId === 'string' &&
        Number.isSafeInteger(mark.completedAtMs) &&
        validRange(mark.fromMs, mark.toMs, 0, 720000) &&
        LABELS.has(mark.label),
    )
  )
    throw Error('REVIEW_FILE');
  return data.marks;
}

function sameVersion(mark, source) {
  return (
    mark.trackId === source.trackId &&
    mark.recipeId === source.recipeId &&
    mark.completedAtMs === source.completedAtMs
  );
}

function readGuideReviewMarks(file, source) {
  return readMarks(file).filter((mark) => sameVersion(mark, source));
}

function readGuideTechniqueReview(cacheFile, source, durationSeconds) {
  const empty = { techniqueCues: [], hiddenTechniqueMarks: [] };
  if (!cacheFile) return empty;
  const file = path.join(
    path.dirname(cacheFile),
    'reference-pitch-technique-cues-v1.json',
  );
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_TECHNIQUE_CUE_BYTES) return empty;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      data?.version !== 1 ||
      !sameVersion(data, source) ||
      !Array.isArray(data.cues) ||
      data.cues.length > MAX_TECHNIQUE_CUES
    )
      return empty;
    const ceiling = Math.floor(durationSeconds * 1000);
    const cues = [];
    for (const cue of data.cues) {
      if (!cue) return empty;
      const { kind, fromMs, toMs, hintMs } = cue;
      if (
        !TECHNIQUE_KINDS.has(kind) ||
        !validRange(fromMs, toMs, cues.at(-1)?.toMs ?? 0, ceiling) ||
        !Number.isSafeInteger(hintMs) ||
        hintMs < 0 ||
        fromMs - hintMs < 1 ||
        fromMs - hintMs > 1000
      )
        return empty;
      cues.push({ kind, fromMs, toMs, hintMs });
    }
    const hidden = data.hidden;
    const validHidden =
      Array.isArray(hidden) &&
      hidden.length <= MAX_TECHNIQUE_CUES &&
      hidden.every(
        (mark) =>
          mark &&
          TECHNIQUE_KINDS.has(mark.kind) &&
          Number.isSafeInteger(mark.atMs) &&
          mark.atMs >= 0 &&
          mark.atMs < ceiling,
      );
    return {
      techniqueCues: cues,
      hiddenTechniqueMarks: validHidden
        ? hidden.map(({ kind, atMs }) => ({ kind, atMs }))
        : [],
    };
  } catch {
    return empty;
  }
}

function readGuideTechniqueCues(cacheFile, source, durationSeconds) {
  return readGuideTechniqueReview(cacheFile, source, durationSeconds)
    .techniqueCues;
}

function saveGuideReviewMark(source, fromMs, toMs, label) {
  if (
    !source.marksFile ||
    !LABELS.has(label) ||
    !validRange(fromMs, toMs, 0, Math.round(source.durationSeconds * 1000)) ||
    toMs - fromMs > SPAN_MS
  )
    return { status: 'invalid-range' };
  const marks = readMarks(source.marksFile).filter(
    (mark) =>
      !sameVersion(mark, source) ||
      mark.fromMs !== fromMs ||
      mark.toMs !== toMs,
  );
  if (marks.length >= MAX_MARKS) return { status: 'limit' };
  const mark = {
    trackId: source.trackId,
    recipeId: source.recipeId,
    completedAtMs: source.completedAtMs,
    fromMs,
    toMs,
    label,
  };
  marks.push(mark);
  atomicWriteExclusiveText(
    source.marksFile,
    JSON.stringify({ version: 1, marks }, null, 2),
  );
  return { status: 'saved', mark };
}

async function readClip(ffmpeg, source, fromMs, toMs, paired, signal) {
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
      '-ss',
      String(fromMs / 1000),
      '-i',
      source,
      '-map',
      '0:a:0',
      ...(paired
        ? ['-af', 'pan=stereo|c0=0.5*c2+0.5*c3|c1=0.5*c0+0.5*c1']
        : ['-ac', '1']),
      '-ar',
      String(RATE),
      '-t',
      String((toMs - fromMs) / 1000),
      '-f',
      's16le',
      'pipe:1',
    ],
    {
      encoding: 'buffer',
      windowsHide: true,
      maxBuffer: 600_000,
      timeout: 10000,
      signal,
    },
  );
  return stdout;
}

async function loadAudio(ffmpeg, source, fromMs, toMs, signal) {
  const [original, pair] = await Promise.all([
    readClip(ffmpeg, source.original, fromMs, toMs, false, signal),
    readClip(ffmpeg, source.source, fromMs, toMs, true, signal),
  ]);
  const frames = Math.min(original.length / 2, pair.length / 4);
  if (
    original.length % 2 ||
    pair.length % 4 ||
    frames < ((toMs - fromMs - 100) * RATE) / 1000 ||
    Math.abs(original.length / 2 - pair.length / 4) > RATE / 10
  )
    throw Error('REVIEW_AUDIO_LENGTH');
  const tracks = {
    original: new Int16Array(frames),
    guide: new Int16Array(frames),
    backing: new Int16Array(frames),
  };
  for (let i = 0; i < frames; i++) {
    tracks.original[i] = original.readInt16LE(i * 2);
    tracks.guide[i] = pair.readInt16LE(i * 4);
    tracks.backing[i] = pair.readInt16LE(i * 4 + 2);
  }
  return {
    sampleRate: RATE,
    tracks,
    toMs: fromMs + Math.floor((frames * 1000) / RATE),
  };
}

function registerGuideReview({
  ipcMain,
  getSource,
  requireGate,
  getFfmpeg,
  scheduler,
  recordDiagnostic,
}) {
  let active = null;
  let loaded = null;

  function cancel(operation) {
    if (!operation) return;
    operation.controller.abort();
    void scheduler.cancel(operation.jobId);
  }

  function report(error, operation) {
    recordDiagnostic({
      process: 'main',
      level: 'warning',
      source: 'reference-pitch',
      operation,
      code: 'REFERENCE_GUIDE_REVIEW_FAILED',
      error,
    });
  }

  ipcMain.handle(
    'performer-review:load',
    async (event, requestId, centerMs) => {
      if (
        typeof requestId !== 'string' ||
        !REQUEST_ID.test(requestId) ||
        !Number.isSafeInteger(centerMs) ||
        centerMs < 0
      )
        return { status: 'invalid-range' };
      cancel(active);
      loaded = null;
      const operation = {
        sender: event.sender,
        requestId,
        controller: new AbortController(),
        jobId: `guide-review-${randomUUID()}`,
      };
      const { signal } = operation.controller;
      active = operation;
      const abort = () => cancel(operation);
      event.sender.once('destroyed', abort);
      event.sender.once('render-process-gone', abort);
      try {
        requireGate();
        const source = getSource();
        if (!source) return { status: 'source-unavailable' };
        const durationMs = Math.floor(source.durationSeconds * 1000);
        const fromMs = Math.max(
          0,
          Math.min(centerMs - SPAN_MS / 2, durationMs - SPAN_MS),
        );
        const toMs = Math.min(durationMs, fromMs + SPAN_MS);
        if (!validRange(fromMs, toMs, 0, 720000))
          return { status: 'invalid-range' };
        const ffmpeg = getFfmpeg();
        if (!ffmpeg) return { status: 'source-unavailable' };
        const audio = await scheduler.schedule({
          jobId: operation.jobId,
          start: () => ({
            result: loadAudio(ffmpeg, source, fromMs, toMs, signal),
            cancel: () => operation.controller.abort(),
          }),
        });
        if (signal.aborted || active !== operation)
          return { status: 'cancelled' };
        requireGate();
        if (getSource()?.identity !== source.identity)
          return { status: 'source-changed' };
        let marks = [];
        let canSave = Boolean(source.marksFile);
        try {
          marks = readGuideReviewMarks(source.marksFile, source);
        } catch (error) {
          report(error, 'guide-review-read');
          canSave = false;
        }
        loaded = {
          requestId,
          sender: event.sender,
          identity: source.identity,
          fromMs,
          toMs: audio.toMs,
          canSave,
        };
        const stepMs = source.stepSeconds * 1000;
        const startFrame = Math.floor(fromMs / stepMs);
        const endFrame = Math.ceil(audio.toMs / stepMs);
        return {
          status: 'ready',
          ...audio,
          fromMs,
          canSave,
          marks,
          pitchFromMs: startFrame * stepMs,
          stepSeconds: source.stepSeconds,
          baseline: source.baseline.slice(startFrame, endFrame),
          shown: source.shown.slice(startFrame, endFrame),
          maskApplied: source.maskApplied,
        };
      } catch (error) {
        if (signal.aborted) return { status: 'cancelled' };
        report(error, 'guide-review-load');
        return { status: 'unavailable' };
      } finally {
        operation.controller.abort();
        event.sender.removeListener('destroyed', abort);
        event.sender.removeListener('render-process-gone', abort);
        if (active === operation) active = null;
      }
    },
  );

  ipcMain.handle('performer-review:cancel', (event, requestId) => {
    if (active?.sender === event.sender && active.requestId === requestId)
      cancel(active);
    if (loaded?.sender === event.sender && loaded.requestId === requestId)
      loaded = null;
  });

  ipcMain.handle(
    'performer-review:mark',
    (event, requestId, fromMs, toMs, label) => {
      if (
        !loaded?.canSave ||
        loaded.sender !== event.sender ||
        loaded.requestId !== requestId ||
        !LABELS.has(label) ||
        !validRange(fromMs, toMs, loaded.fromMs, loaded.toMs)
      )
        return { status: 'invalid-range' };
      try {
        requireGate();
        const source = getSource();
        if (source?.identity !== loaded.identity)
          return { status: 'source-changed' };
        return saveGuideReviewMark(source, fromMs, toMs, label);
      } catch (error) {
        report(error, 'guide-review-mark');
        return { status: 'unavailable' };
      }
    },
  );
}

module.exports = {
  readGuideReviewMarks,
  readGuideTechniqueCues,
  readGuideTechniqueReview,
  registerGuideReview,
  saveGuideReviewMark,
};
