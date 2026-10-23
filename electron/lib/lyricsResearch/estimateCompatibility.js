'use strict';
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  normalizeLyricsDocument,
} = require('../../../src/utils/lyricsDocument.js');
const {
  createAcousticEstimate,
} = require('../library/lyricsAcousticEstimates');
const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const memo = new Map();
const rule = 'normalizer-v2-v3-exact-v1';
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function compatibleEstimate(input, raw, strict, contentSha) {
  if (
    raw.version !== 5 ||
    raw.estimate?.schemaVersion !== 2 ||
    raw.estimate.source.normalizerProfileId !== 'lyrics-source-v2' ||
    raw.estimate.method.version !== '4' ||
    input.canonical.normalizerProfileId !== 'lyrics-source-v3' ||
    input.canonical.granularity !== 'T1' ||
    input.canonical.lines.some((l) => l.segments?.length) ||
    input.context.source.timingSha256 !== null ||
    raw.estimate.source.timingSha256 !== null
  )
    return null;
  if (
    Object.entries(input.context.source).some(
      ([key, value]) =>
        key !== 'normalizerProfileId' && raw.estimate.source[key] !== value,
    ) ||
    JSON.stringify(raw.estimate.audio) !== JSON.stringify(input.context.audio)
  )
    return null;
  const library = path.resolve(input.trackDir, '../..');
  // Main-derived input only. Never treat a relabeled parser result as proof.
  if (input.identity !== sha([library, input.context, input.canonical]))
    return null;
  const key = sha([rule, input.identity, input.sourceRevision, contentSha]);
  if (memo.has(key)) {
    const value = memo.get(key);
    memo.delete(key);
    memo.set(key, value);
    return value;
  }
  const canonical = normalizeLyricsDocument({
    text: input.text,
    source: input.source,
    sourceFingerprint: input.context.source.sha256,
    normalizerProfileId: 'lyrics-source-v2',
  });
  const context = {
    ...input.context,
    source: {
      ...input.context.source,
      normalizerProfileId: 'lyrics-source-v2',
    },
  };
  const witness = {
    ...input,
    canonical,
    context,
    identity: sha([library, context, canonical]),
  };
  // This exact historical generation hash and the unchanged strict validator
  // certify text, occurrences, provenance, file stamps, audio, method and routing.
  const old = strict(witness, raw);
  if (old.status !== 'ready') return null;
  const source = {
    ...raw.estimate.source,
    normalizerProfileId: input.canonical.normalizerProfileId,
  };
  const reasonsByLine = {};
  const chunks = old.preview.lines.map((line, i) => {
    if (line.reason)
      reasonsByLine[input.canonical.lines[i].lineId] = line.reason;
    return line.chunks.map((chunk, j) => ({
      ...chunk,
      chunkId: `${input.canonical.lines[i].lineId}-compat-c-${j.toString(36)}`,
    }));
  });
  const fineTimingByLine = old.preview.lines.map((line, i) =>
    line.fineTiming
      ? {
          version: line.fineTiming.version,
          units: line.fineTiming.units.map((unit, j) => ({
            ...unit,
            unitId: `${input.canonical.lines[i].lineId}-compat-f-${j.toString(36)}`,
          })),
        }
      : undefined,
  );
  const estimate = createAcousticEstimate(
    { source, audio: raw.estimate.audio, method: raw.estimate.method },
    input.canonical,
    chunks,
    { reasonsByLine, fineTimingByLine, schemaVersion: 2 },
  );
  // Factory validation may decline optional evidence. Compatibility must never
  // silently drop an interval, reason or pause instead of preserving it.
  const evidence = (lines) =>
    lines.map((line) => ({
      ...line,
      lineId: undefined,
      chunks: line.chunks.map((chunk) => ({ ...chunk, chunkId: undefined })),
      ...(line.fineTiming
        ? {
            fineTiming: {
              ...line.fineTiming,
              units: line.fineTiming.units.map((unit) => ({
                ...unit,
                unitId: undefined,
              })),
            },
          }
        : {}),
    }));
  if (
    JSON.stringify(evidence(estimate.lines)) !==
    JSON.stringify(evidence(raw.estimate.lines))
  )
    return null;
  const value = freeze({
    ...old,
    compatibility: {
      rule,
      sourceEstimateId: raw.estimate.estimateId,
      fromProfile: 'lyrics-source-v2',
      toProfile: 'lyrics-source-v3',
    },
    preview: {
      ...old.preview,
      estimateId: estimate.estimateId,
      documentId: estimate.documentId,
      normalizerProfileId: estimate.source.normalizerProfileId,
      lines: estimate.lines,
    },
  });
  memo.set(key, value);
  if (memo.size > 8) memo.delete(memo.keys().next().value);
  return value;
}
module.exports = { compatibleEstimate };
