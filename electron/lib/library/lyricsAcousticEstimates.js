'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteText } = require('../atomicWrite');
const {
  isLyricsSubtitleFilename,
  findStructuredAudioFilename,
} = require('./paths');
const {
  computeLyricsSourceFingerprint,
  timingSidecarPath,
} = require('./lyricsTiming');
const values = require('../../../shared/lyricsTimingValues.json');
const {
  validateAcousticEstimate,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const {
  validateLyricsFineTiming,
} = require('../../../shared/lyricsFineTiming.mjs');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const intervalHash = (lines) =>
  hash(
    JSON.stringify(
      lines.map(({ lineId, text, startMs, endMs }) => [
        lineId,
        text,
        startMs,
        endMs,
      ]),
    ),
  );
const estimateIdentity = (document) =>
  `acoustic_${hash(JSON.stringify([document.documentId, document.source, document.audio, document.method, document.lines]))}`;
function fileStamp(file) {
  try {
    const stat = fs.statSync(file, { bigint: true });
    if (!stat.isFile()) throw new Error('Input is not a file');
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs]
      .map(String)
      .join(':');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function inputStamp(trackDir, filename, audioFilename) {
  return JSON.stringify([
    fileStamp(path.join(trackDir, 'lyrics', filename)),
    fileStamp(timingSidecarPath(trackDir, filename)),
    fileStamp(path.join(trackDir, audioFilename)),
    findStructuredAudioFilename(trackDir),
  ]);
}
function inputsCurrent(trackDir, context) {
  return (
    inputStamp(trackDir, context.source.filename, context.audioFilename) ===
    context.inputStamp
  );
}
function acousticEstimatePath(trackDir, filename) {
  return isLyricsSubtitleFilename(filename) && filename.length <= 240
    ? path.join(trackDir, 'lyrics', 'acoustic-estimates', `${filename}.json`)
    : null;
}
function fixtureMethod() {
  return {
    kind: 'fixture',
    id: 'synthetic-v1',
    version: '1',
    modelManifestSha256: null,
    environmentLockSha256: null,
    decoderVersion: 'fixture-v1',
    g2pVersion: 'none-v1',
    chunkerVersion: 'fixture-v1',
    nodeVersion: process.versions.node,
    icuVersion: process.versions.icu,
  };
}
async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function optionalFileHash(file) {
  try {
    return await fileHash(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
async function prepareAcousticEstimateContext(
  trackDir,
  source,
  { method = fixtureMethod() } = {},
) {
  if (!acousticEstimatePath(trackDir, source?.filename))
    throw new Error('Acoustic source unavailable');
  const sourceSha256 = computeLyricsSourceFingerprint(
    trackDir,
    source.filename,
  );
  const audioFilename = findStructuredAudioFilename(trackDir);
  const offsetUsedMs = source.offsetMs ?? 0;
  if (
    !sourceSha256 ||
    !audioFilename ||
    !Number.isSafeInteger(offsetUsedMs) ||
    Math.abs(offsetUsedMs) > 3600000
  )
    throw new Error('Acoustic input unavailable');
  const stamp = inputStamp(trackDir, source.filename, audioFilename);
  const [audioSha256, timingSha256] = await Promise.all([
    fileHash(path.join(trackDir, audioFilename)),
    optionalFileHash(timingSidecarPath(trackDir, source.filename)),
  ]);
  if (
    stamp !== inputStamp(trackDir, source.filename, audioFilename) ||
    sourceSha256 !== computeLyricsSourceFingerprint(trackDir, source.filename)
  )
    throw new Error('Acoustic input changed');
  return {
    source: {
      filename: source.filename,
      sha256: sourceSha256,
      normalizerProfileId: values.normalizerProfileId,
      timingSha256,
      offsetUsedMs,
    },
    audio: { sha256: audioSha256, role: 'mix', decodeProfileId: 'source-v1' },
    method: { ...method },
    inputStamp: stamp,
    audioFilename,
  };
}
function matches(document, context) {
  return (
    Object.entries(context.source).every(
      ([key, value]) => document.source[key] === value,
    ) &&
    JSON.stringify(document.audio) === JSON.stringify(context.audio) &&
    Object.entries(context.method).every(
      ([key, value]) => document.method[key] === value,
    ) &&
    document.source.intervalsSha256 === intervalHash(document.lines) &&
    document.estimateId === estimateIdentity(document)
  );
}
function createAcousticEstimate(
  context,
  canonical,
  chunksByLine,
  { reasonsByLine = {}, fineTimingByLine = [], schemaVersion } = {},
) {
  const lines = canonical.lines.map((line, index) => ({
    lineId: line.lineId,
    text: line.text,
    startMs: line.startMs,
    endMs: line.endMs,
    status: chunksByLine[index]?.length >= 2 ? 'ready' : 'unsupported',
    reason:
      chunksByLine[index]?.length >= 2
        ? null
        : (reasonsByLine[line.lineId] ?? 'missing-boundaries'),
    chunks: chunksByLine[index]?.length >= 2 ? chunksByLine[index] : [],
  }));
  let document = validateAcousticEstimate({
    schemaVersion: schemaVersion ?? 1,
    estimateId: 'pending',
    documentId: canonical.documentId,
    source: { ...context.source, intervalsSha256: intervalHash(lines) },
    audio: context.audio,
    method: context.method,
    lines,
  });
  const enriched = document.lines.map((line, index) => {
    if (
      line.status !== 'ready' ||
      canonical.lines[index].segments?.length ||
      !fineTimingByLine[index]
    )
      return line;
    try {
      return {
        ...line,
        fineTiming: validateLyricsFineTiming(fineTimingByLine[index], line),
      };
    } catch {
      return line;
    }
  });
  if (enriched.some((line) => line.fineTiming)) {
    try {
      document = validateAcousticEstimate({
        ...document,
        schemaVersion: 2,
        lines: enriched,
      });
    } catch {
      // Optional evidence cannot invalidate coarse data through IDs or byte/count budgets.
    }
  }
  document.estimateId = estimateIdentity(document);
  return document;
}
function publicPreview(document) {
  return {
    estimateId: document.estimateId,
    documentId: document.documentId,
    sourceFilename: document.source.filename,
    sourceFingerprint: document.source.sha256,
    normalizerProfileId: document.source.normalizerProfileId,
    offsetUsedMs: document.source.offsetUsedMs,
    methodKind: document.method.kind,
    lines: document.lines,
  };
}
async function readBounded(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const bytes = Buffer.alloc(values.maxDocumentBytes + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        total,
        bytes.length - total,
        null,
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > values.maxDocumentBytes)
      throw new Error('Acoustic estimate too large');
    return JSON.parse(bytes.subarray(0, total).toString('utf8'));
  } finally {
    await handle.close();
  }
}
async function loadTrackAcousticEstimate(
  trackDir,
  source,
  { onError = () => {}, method = fixtureMethod() } = {},
) {
  const file = acousticEstimatePath(trackDir, source?.filename);
  if (!file) return { status: 'unavailable' };
  let raw;
  try {
    raw = await readBounded(file);
  } catch (error) {
    if (error.code && error.code !== 'ENOENT') {
      onError(error);
      return { status: 'unavailable' };
    }
    return { status: error.code === 'ENOENT' ? 'missing' : 'corrupt' };
  }
  if (![1, 2].includes(raw?.schemaVersion)) return { status: 'unsupported' };
  let document;
  try {
    document = validateAcousticEstimate(raw);
  } catch {
    return { status: 'corrupt' };
  }
  try {
    const context = await prepareAcousticEstimateContext(trackDir, source, {
      method,
    });
    if (!matches(document, context) || !inputsCurrent(trackDir, context))
      return { status: 'stale' };
    return { status: 'ready', preview: publicPreview(document) };
  } catch (error) {
    if (error.code && error.code !== 'ENOENT') onError(error);
    return { status: 'unavailable' };
  }
}
async function saveTrackAcousticEstimate(
  trackDir,
  source,
  raw,
  { isCurrent = () => true, method = fixtureMethod() } = {},
) {
  const document = validateAcousticEstimate(raw);
  const context = await prepareAcousticEstimateContext(trackDir, source, {
    method,
  });
  if (!matches(document, context) || !isCurrent())
    throw new Error('Acoustic estimate input changed');
  // No asynchronous operation between the final generation check and publication.
  // The producer supplies the live generation/source check; renderer cannot save.
  const file = acousticEstimatePath(trackDir, source.filename);
  if (!isCurrent() || !inputsCurrent(trackDir, context))
    throw new Error('Acoustic estimate input changed');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Match the validator's compact UTF-8 budget and the loader's byte limit.
  atomicWriteText(file, JSON.stringify(document));
  return { status: 'ready', preview: publicPreview(document) };
}

function deleteTrackAcousticEstimate(trackDir, filename) {
  const file = acousticEstimatePath(trackDir, filename);
  if (!file) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  inputsCurrent,
  acousticEstimatePath,
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  createFixtureAcousticEstimate: createAcousticEstimate,
  saveTrackAcousticEstimate,
  loadTrackAcousticEstimate,
  deleteTrackAcousticEstimate,
};
