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
const {
  planLineLanguages,
  isAnalysisLanguage,
  resolveAnalysisLanguage,
} = require('./language');
const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const method = Object.freeze({
  kind: 'model',
  id: 'experimental-hfa-small-cpu',
  version: '4',
  modelManifestSha256: sha(
    require('../../../scripts/research/lyricsFreshEvaluation/trial-assets.json'),
  ),
  environmentLockSha256: sha(require('./installed-pins.json')),
  decoderVersion: 'hfa-word-intervals-v4',
  g2pVersion: 'hfa-zh-ja-en-per-line-v3',
  chunkerVersion: 'hfa-starts-fine-zh-ja-occurrence-v1',
  nodeVersion: process.versions.node,
  icuVersion: process.versions.icu,
});
const previousMethod = Object.freeze({
  ...method,
  version: '3',
  decoderVersion: 'hfa-small-per-line-v3',
  chunkerVersion: 'hfa-starts-v1',
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
function validationSummary(lines) {
  const summary = {
    checked: 0,
    supported: 0,
    uncertain: 0,
    contradictions: 0,
    missingLyrics: 0,
    silent: 0,
  };
  const keys = {
    supported: 'supported',
    insufficient: 'uncertain',
    contradiction: 'contradictions',
    'possible-missing-lyrics': 'missingLyrics',
    silence: 'silent',
  };
  for (const line of lines) {
    if (line.segments?.length || !Object.hasOwn(keys, line.content)) continue;
    summary.checked++;
    summary[keys[line.content]]++;
  }
  return summary.checked ? summary : null;
}
function validSummary(value, max) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'checked,contradictions,missingLyrics,silent,supported,uncertain'
  )
    return false;
  if (
    Object.values(value).some(
      (n) => !Number.isSafeInteger(n) || n < 0 || n > max,
    )
  )
    return false;
  return (
    value.checked ===
    value.supported +
      value.uncertain +
      value.contradictions +
      value.missingLyrics +
      value.silent
  );
}
function preview(estimate, validation) {
  return {
    status: 'ready',
    experimental: true,
    timingAcceptance: 'pending',
    ...(validation ? { validation: { ...validation } } : {}),
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
  let estimate = createAcousticEstimate(
    context,
    input.canonical,
    input.canonical.lines.map((line) =>
      line.segments?.length ? [] : (byId.get(line.lineId)?.chunks ?? []),
    ),
    {
      fineTimingByLine: input.canonical.lines.map((line) =>
        line.segments?.length ? undefined : byId.get(line.lineId)?.fineTiming,
      ),
    },
  );
  const file = location(input);
  const routing = planLineLanguages(
    input.canonical.lines,
    input.language ??
      resolveAnalysisLanguage(input.source.language, '').language ??
      'auto',
  );
  const validation = validationSummary(
    input.canonical.lines.map((line) => ({
      ...line,
      content: byId.get(line.lineId)?.content,
    })),
  );
  const serialize = () =>
    JSON.stringify({
      version: 5,
      identity: sha([input.identity, routing]),
      routing,
      validation,
      estimate,
    });
  let bytes = serialize();
  if (
    Buffer.byteLength(bytes) > 2097152 &&
    estimate.lines.some((line) => line.fineTiming)
  ) {
    estimate = createAcousticEstimate(
      context,
      input.canonical,
      estimate.lines.map((line) => line.chunks),
      {
        reasonsByLine: Object.fromEntries(
          estimate.lines.map((line) => [line.lineId, line.reason]),
        ),
      },
    );
    bytes = serialize();
  }
  if (Buffer.byteLength(bytes) > 2097152)
    throw Error('experimental estimate budget');
  // The producer rechecks full input identity; no await between its last check and rename.
  if (!isCurrent()) throw Error('experimental estimate cancelled or stale');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  contained(input.trackDir, `${file}.tmp`);
  atomicWriteText(file, bytes);
  return preview(estimate, validation);
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
      ![1, 2, 3, 4, 5].includes(raw.version) ||
      Object.keys(raw).sort().join(',') !==
        (raw.version >= 4
          ? 'estimate,identity,routing,validation,version'
          : raw.version === 3
            ? 'analysisLanguage,estimate,identity,validation,version'
            : raw.version === 2
              ? 'analysisLanguage,estimate,identity,version'
              : 'estimate,identity,version') ||
      ([2, 3].includes(raw.version) &&
        !['zh', 'ja', 'en'].includes(raw.analysisLanguage)) ||
      (raw.version >= 4 &&
        (raw.routing?.version !== 1 || !isAnalysisLanguage(raw.routing.hint)))
    )
      return { status: 'unsupported' };
    const estimate = validateAcousticEstimate(raw.estimate);
    if (
      (raw.version === 3 || (raw.version >= 4 && raw.validation !== null)) &&
      !validSummary(
        raw.validation,
        input.canonical.lines.filter((line) => !line.segments?.length).length,
      )
    )
      return { status: 'corrupt' };
    if (
      estimate.source.filename === input.source.filename &&
      estimate.source.offsetUsedMs !== (input.source.offsetMs ?? 0)
    )
      return { status: 'stale', reason: 'offset-changed' };
    if (
      raw.version >= 4 &&
      JSON.stringify(raw.routing) !==
        JSON.stringify(
          planLineLanguages(input.canonical.lines, raw.routing.hint),
        )
    )
      return { status: 'stale' };
    if (
      raw.identity !==
        (raw.version >= 4
          ? sha([input.identity, raw.routing])
          : raw.version >= 2
            ? sha([input.identity, raw.analysisLanguage])
            : input.identity) ||
      (JSON.stringify(estimate.method) !== JSON.stringify(method) &&
        !(
          raw.version < 5 &&
          estimate.schemaVersion === 1 &&
          JSON.stringify(estimate.method) === JSON.stringify(previousMethod)
        ))
    )
      return { status: 'stale' };
    // Rebuilding checks canonical occurrence IDs, text, envelope and the content-addressed estimate ID.
    const rebuilt = createAcousticEstimate(
      {
        source: { ...estimate.source },
        audio: estimate.audio,
        method: estimate.method,
      },
      input.canonical,
      estimate.lines.map((line) => line.chunks),
      {
        fineTimingByLine: estimate.lines.map((line) => line.fineTiming),
        schemaVersion: estimate.schemaVersion,
      },
    );
    if (JSON.stringify(estimate) !== JSON.stringify(rebuilt))
      return { status: 'stale' };
    return preview(estimate, raw.version >= 3 ? raw.validation : null);
  } catch {
    return { status: 'corrupt' };
  }
}
module.exports = { saveExperimentalEstimate, loadExperimentalEstimate };
