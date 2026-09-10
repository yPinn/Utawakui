'use strict';

const crypto = require('crypto');

const MAX_CORRECTION_ENTRIES = 10_000;
const MAX_DOCUMENT_LINES = 10_000;
const MAX_LINE_LENGTH = 10_000;
const MAX_DOCUMENT_CHARACTERS = 250_000;
const MAX_COMPONENT_LENGTH = 256;
const MAX_SURFACE_LENGTH = 200;
const SAFE_COMPONENT_RE = /^[a-z0-9][a-z0-9._:@/-]{0,255}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const KANA_RE = /^[\u3040-\u30ff\u31f0-\u31ffー]+$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, allowed, required, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) {
    throw new TypeError(`${label} has invalid fields`);
  }
  if (required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} is missing required fields`);
  }
}

function assertSafeComponent(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_COMPONENT_LENGTH ||
    !SAFE_COMPONENT_RE.test(value) ||
    FORBIDDEN_KEYS.has(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertHash(value, label) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertOccurrence(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DOCUMENT_LINES) {
    throw new TypeError(`${label} is invalid`);
  }
}

function hashReadingLineText(text) {
  if (typeof text !== 'string') {
    throw new TypeError('reading line text must be a string');
  }
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function validateReadingCorrectionPack(pack) {
  assertExactKeys(
    pack,
    ['schemaVersion', 'packId', 'version', 'license', 'entries'],
    ['schemaVersion', 'packId', 'version', 'license', 'entries'],
    'reading correction pack',
  );
  if (pack.schemaVersion !== 1) {
    throw new TypeError('unsupported reading correction pack schema');
  }
  assertSafeComponent(pack.packId, 'reading correction pack id');
  assertSafeComponent(pack.version, 'reading correction pack version');
  assertSafeComponent(pack.license, 'reading correction pack license');
  if (
    !Array.isArray(pack.entries) ||
    pack.entries.length > MAX_CORRECTION_ENTRIES
  ) {
    throw new TypeError('reading correction entries are invalid');
  }

  const correctionIds = new Set();
  const scopes = new Set();
  for (const entry of pack.entries) {
    assertExactKeys(
      entry,
      ['correctionId', 'recordingIdentity', 'line', 'target', 'evidence'],
      ['correctionId', 'recordingIdentity', 'line', 'target', 'evidence'],
      'reading correction entry',
    );
    assertSafeComponent(entry.correctionId, 'reading correction id');
    assertSafeComponent(
      entry.recordingIdentity,
      'reading correction recording identity',
    );
    if (correctionIds.has(entry.correctionId)) {
      throw new TypeError('reading correction ids must be unique');
    }
    correctionIds.add(entry.correctionId);

    assertExactKeys(
      entry.line,
      ['textSha256', 'occurrence', 'previousTextSha256', 'nextTextSha256'],
      ['textSha256', 'occurrence'],
      'reading correction line',
    );
    assertHash(entry.line.textSha256, 'reading correction line hash');
    assertOccurrence(
      entry.line.occurrence,
      'reading correction line occurrence',
    );
    if (entry.line.previousTextSha256 !== undefined) {
      assertHash(
        entry.line.previousTextSha256,
        'reading correction previous line hash',
      );
    }
    if (entry.line.nextTextSha256 !== undefined) {
      assertHash(
        entry.line.nextTextSha256,
        'reading correction next line hash',
      );
    }

    assertExactKeys(
      entry.target,
      ['surface', 'occurrence', 'reading'],
      ['surface', 'occurrence', 'reading'],
      'reading correction target',
    );
    if (
      typeof entry.target.surface !== 'string' ||
      entry.target.surface.length === 0 ||
      entry.target.surface.length > MAX_SURFACE_LENGTH ||
      /[\r\n]/u.test(entry.target.surface)
    ) {
      throw new TypeError('reading correction target surface is invalid');
    }
    assertOccurrence(
      entry.target.occurrence,
      'reading correction target occurrence',
    );
    if (
      typeof entry.target.reading !== 'string' ||
      entry.target.reading.length === 0 ||
      entry.target.reading.length > MAX_SURFACE_LENGTH ||
      !KANA_RE.test(entry.target.reading)
    ) {
      throw new TypeError('reading correction target reading must be kana');
    }

    assertExactKeys(
      entry.evidence,
      ['kind', 'url'],
      ['kind'],
      'reading correction evidence',
    );
    assertSafeComponent(
      entry.evidence.kind,
      'reading correction evidence kind',
    );
    if (
      entry.evidence.url !== undefined &&
      (typeof entry.evidence.url !== 'string' ||
        entry.evidence.url.length > 2_048 ||
        !entry.evidence.url.startsWith('https://'))
    ) {
      throw new TypeError('reading correction evidence URL is invalid');
    }

    const scope = JSON.stringify([
      entry.recordingIdentity,
      entry.line.textSha256,
      entry.line.occurrence,
      entry.line.previousTextSha256 ?? null,
      entry.line.nextTextSha256 ?? null,
      entry.target.surface,
      entry.target.occurrence,
    ]);
    if (scopes.has(scope)) {
      throw new TypeError('conflicting correction scope');
    }
    scopes.add(scope);
  }

  return pack;
}

function indexesOf(text, needle) {
  const indexes = [];
  let fromIndex = 0;
  while (fromIndex <= text.length) {
    const foundAt = text.indexOf(needle, fromIndex);
    if (foundAt === -1) break;
    indexes.push(foundAt);
    fromIndex = foundAt + needle.length;
  }
  return indexes;
}

function resolveReadingCorrectionShadow(pack, input) {
  validateReadingCorrectionPack(pack);
  assertExactKeys(
    input,
    ['recordingIdentity', 'lines'],
    ['recordingIdentity', 'lines'],
    'reading correction shadow input',
  );
  assertSafeComponent(
    input.recordingIdentity,
    'reading correction recording identity',
  );
  if (
    !Array.isArray(input.lines) ||
    input.lines.length > MAX_DOCUMENT_LINES ||
    input.lines.some(
      (line) => typeof line !== 'string' || line.length > MAX_LINE_LENGTH,
    )
  ) {
    throw new TypeError('reading correction lines are invalid');
  }
  const documentCharacters = input.lines.reduce(
    (total, line) => total + line.length,
    0,
  );
  if (documentCharacters > MAX_DOCUMENT_CHARACTERS) {
    throw new TypeError('reading correction document text exceeds the limit');
  }

  const lineHashes = input.lines.map(hashReadingLineText);
  const lineIndexesByHash = new Map();
  for (let index = 0; index < lineHashes.length; index += 1) {
    const hash = lineHashes[index];
    const indexes = lineIndexesByHash.get(hash);
    if (indexes) indexes.push(index);
    else lineIndexesByHash.set(hash, [index]);
  }
  const matches = [];
  const skipped = [];
  const targetIndexesByScope = new Map();

  for (const entry of pack.entries) {
    if (entry.recordingIdentity !== input.recordingIdentity) {
      skipped.push({
        correctionId: entry.correctionId,
        reason: 'recording-mismatch',
      });
      continue;
    }

    const matchingLineIndexes =
      lineIndexesByHash.get(entry.line.textSha256) ?? [];
    const lineIndex = matchingLineIndexes[entry.line.occurrence];
    if (lineIndex === undefined) {
      skipped.push({
        correctionId: entry.correctionId,
        reason: 'line-mismatch',
      });
      continue;
    }

    const previousMatches =
      entry.line.previousTextSha256 === undefined ||
      lineHashes[lineIndex - 1] === entry.line.previousTextSha256;
    const nextMatches =
      entry.line.nextTextSha256 === undefined ||
      lineHashes[lineIndex + 1] === entry.line.nextTextSha256;
    if (!previousMatches || !nextMatches) {
      skipped.push({
        correctionId: entry.correctionId,
        reason: 'context-mismatch',
      });
      continue;
    }

    const lineText = input.lines[lineIndex];
    const targetScope = JSON.stringify([lineIndex, entry.target.surface]);
    let targetIndexes = targetIndexesByScope.get(targetScope);
    if (!targetIndexes) {
      targetIndexes = indexesOf(lineText, entry.target.surface);
      targetIndexesByScope.set(targetScope, targetIndexes);
    }
    const start = targetIndexes[entry.target.occurrence];
    if (start === undefined) {
      skipped.push({
        correctionId: entry.correctionId,
        reason: 'target-mismatch',
      });
      continue;
    }

    matches.push({
      correctionId: entry.correctionId,
      lineIndex,
      start,
      end: start + entry.target.surface.length,
      surface: entry.target.surface,
      reading: entry.target.reading,
    });
  }

  const conflictingCorrectionIds = new Set();
  const matchesByLine = new Map();
  for (const match of matches) {
    const lineMatches = matchesByLine.get(match.lineIndex);
    if (lineMatches) lineMatches.push(match);
    else matchesByLine.set(match.lineIndex, [match]);
  }
  for (const lineMatches of matchesByLine.values()) {
    lineMatches.sort((left, right) => left.start - right.start);
    let cluster = [];
    let clusterEnd = -1;
    const recordCluster = () => {
      if (cluster.length < 2) return;
      for (const match of cluster) {
        conflictingCorrectionIds.add(match.correctionId);
      }
    };
    for (const match of lineMatches) {
      if (cluster.length > 0 && match.start >= clusterEnd) {
        recordCluster();
        cluster = [];
        clusterEnd = -1;
      }
      cluster.push(match);
      clusterEnd = Math.max(clusterEnd, match.end);
    }
    recordCluster();
  }
  if (conflictingCorrectionIds.size > 0) {
    for (const match of matches) {
      if (conflictingCorrectionIds.has(match.correctionId)) {
        skipped.push({
          correctionId: match.correctionId,
          reason: 'overlapping-correction-conflict',
        });
      }
    }
  }

  return {
    mode: 'shadow',
    pack: { id: pack.packId, version: pack.version },
    matches: matches.filter(
      ({ correctionId }) => !conflictingCorrectionIds.has(correctionId),
    ),
    skipped,
  };
}

module.exports = {
  hashReadingLineText,
  resolveReadingCorrectionShadow,
  validateReadingCorrectionPack,
};
