'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { atomicWriteText } = require('../atomicWrite');
const { contained } = require('../lyricsAcoustic/integrity');
const {
  prepareAcousticEstimateContext,
  createAcousticEstimate,
} = require('../library/lyricsAcousticEstimates');
const {
  validateAcousticEstimate,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const method = Object.freeze({
  kind: 'model',
  id: 'experimental-hfa-small-cpu',
  version: '1',
  modelManifestSha256: sha(
    require('../../../scripts/research/lyricsFreshEvaluation/trial-assets.json'),
  ),
  environmentLockSha256: sha(require('./installed-pins.json')),
  decoderVersion: 'hfa-small-content-v1',
  g2pVersion: 'hfa-zh-ja-v1',
  chunkerVersion: 'hfa-starts-v1',
  nodeVersion: process.versions.node,
  icuVersion: process.versions.icu,
});
function location(input) {
  return contained(
    input.trackDir,
    path.join(
      input.trackDir,
      'lyrics',
      'experimental-estimates',
      `${input.source.filename}.json`,
    ),
  );
}
function preview(estimate) {
  return {
    status: 'ready',
    experimental: true,
    timingAcceptance: 'pending',
    preview: {
      estimateId: estimate.estimateId,
      documentId: estimate.documentId,
      sourceFilename: estimate.source.filename,
      sourceFingerprint: estimate.source.sha256,
      normalizerProfileId: estimate.source.normalizerProfileId,
      offsetUsedMs: estimate.source.offsetUsedMs,
      methodKind: 'model',
      lines: estimate.lines,
    },
  };
}
async function saveExperimentalEstimate(input, result, isCurrent) {
  const context = await prepareAcousticEstimateContext(
    input.trackDir,
    input.source,
    { method },
  );
  if (
    JSON.stringify(context.source) !== JSON.stringify(input.context.source) ||
    JSON.stringify(context.audio) !== JSON.stringify(input.context.audio) ||
    context.inputStamp !== input.context.inputStamp
  )
    throw Error('experimental input changed');
  const byId = new Map(result.lines.map((line) => [line.lineId, line]));
  const estimate = createAcousticEstimate(
    context,
    input.canonical,
    input.canonical.lines.map((line) =>
      line.segments?.length ? [] : (byId.get(line.lineId)?.chunks ?? []),
    ),
  );
  const file = location(input);
  const bytes = JSON.stringify({
    version: 1,
    identity: input.identity,
    estimate,
  });
  if (Buffer.byteLength(bytes) > 2097152)
    throw Error('experimental estimate budget');
  // The producer rechecks full input identity; no await between its last check and rename.
  if (!isCurrent()) throw Error('experimental estimate cancelled or stale');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  contained(input.trackDir, `${file}.tmp`);
  atomicWriteText(file, bytes);
  return preview(estimate);
}
function loadExperimentalEstimate(input) {
  let raw;
  try {
    const file = location(input);
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(2097153);
      const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (length > 2097152) throw Error('experimental estimate budget');
      raw = JSON.parse(buffer.subarray(0, length).toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'missing' : 'corrupt' };
  }
  try {
    if (
      raw.version !== 1 ||
      Object.keys(raw).sort().join(',') !== 'estimate,identity,version'
    )
      return { status: 'unsupported' };
    const estimate = validateAcousticEstimate(raw.estimate);
    if (
      raw.identity !== input.identity ||
      JSON.stringify(estimate.method) !== JSON.stringify(method)
    )
      return { status: 'stale' };
    // Rebuilding checks canonical occurrence IDs, text, envelope and the content-addressed estimate ID.
    const rebuilt = createAcousticEstimate(
      { source: { ...estimate.source }, audio: estimate.audio, method },
      input.canonical,
      estimate.lines.map((line) => line.chunks),
    );
    if (JSON.stringify(estimate) !== JSON.stringify(rebuilt))
      return { status: 'stale' };
    return preview(estimate);
  } catch {
    return { status: 'corrupt' };
  }
}
module.exports = { saveExperimentalEstimate, loadExperimentalEstimate };
