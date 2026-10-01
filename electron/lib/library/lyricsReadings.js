'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const { alignOkurigana, katakanaToHiragana } = require('../lyricsReading');
const {
  LYRICS_DIRNAME,
  LYRICS_READINGS_DIRNAME,
  READING_DOC_VERSION,
} = require('./constants');
const { isLyricsSubtitleFilename } = require('./paths');

const LEGACY_READING_DOC_VERSION = 1;
const STABLE_ID_READING_DOC_VERSION = 2;
const SHA256_RE = /^[a-f0-9]{64}$/;

function normalizeCanonicalIdentity(
  identity,
  readingLines,
  { requireNormalizerProfile = true } = {},
) {
  if (
    !identity ||
    typeof identity.documentId !== 'string' ||
    identity.documentId.length === 0 ||
    identity.documentId.length > 200 ||
    (requireNormalizerProfile &&
      (typeof identity.normalizerProfileId !== 'string' ||
        identity.normalizerProfileId.length === 0 ||
        identity.normalizerProfileId.length > 200)) ||
    !SHA256_RE.test(identity.sourceFingerprint) ||
    !Array.isArray(identity.lines) ||
    identity.lines.length !== readingLines.length
  ) {
    return null;
  }

  const seen = new Set();
  const lines = identity.lines.map((line, index) => {
    const lineId = line?.lineId;
    if (
      typeof lineId !== 'string' ||
      lineId.length === 0 ||
      lineId.length > 200 ||
      seen.has(lineId) ||
      line?.text !== readingLines[index]?.text
    ) {
      return null;
    }
    seen.add(lineId);
    return { lineId, text: line.text };
  });
  if (lines.some((line) => line === null)) return null;
  return {
    documentId: identity.documentId,
    normalizerProfileId: identity.normalizerProfileId ?? null,
    sourceFingerprint: identity.sourceFingerprint,
    lines,
    targetLineId: identity.targetLineId,
  };
}

function getReadingsDirFromTrackDir(trackDir) {
  return path.join(trackDir, LYRICS_DIRNAME, LYRICS_READINGS_DIRNAME);
}

// Sidecar filenames are the FULL source filename + .json, not the stem —
// manual.lrc and manual.vtt would otherwise collide on one doc (see
// LYRICS_READINGS_DIRNAME's comment in constants.js).
function readingSidecarPath(trackDir, sourceFilename) {
  if (!isLyricsSubtitleFilename(sourceFilename)) return null;
  return path.join(
    getReadingsDirFromTrackDir(trackDir),
    `${sourceFilename}.json`,
  );
}

function getTrackReading(trackDir, sourceFilename) {
  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  if (!sidecarPath) return null;

  try {
    const doc = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    if (
      typeof doc !== 'object' ||
      doc === null ||
      ![
        LEGACY_READING_DOC_VERSION,
        STABLE_ID_READING_DOC_VERSION,
        READING_DOC_VERSION,
      ].includes(doc.version) ||
      doc.sourceFilename !== sourceFilename ||
      !Array.isArray(doc.lines)
    ) {
      return null;
    }
    if (
      doc.version !== LEGACY_READING_DOC_VERSION &&
      !normalizeCanonicalIdentity(doc, doc.lines, {
        requireNormalizerProfile: doc.version === READING_DOC_VERSION,
      })
    ) {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}

function normalizeReadingLineSegments(line) {
  if (
    typeof line?.text !== 'string' ||
    !Array.isArray(line.segments) ||
    line.segments.some((segment) => typeof segment?.t !== 'string')
  ) {
    return { line, changed: false };
  }
  if (line.segments.map((segment) => segment.t).join('') === line.text) {
    return { line, changed: false };
  }

  const segments = [];
  let offset = 0;
  let changed = false;
  for (const segment of line.segments) {
    if (line.text.startsWith(segment.t, offset)) {
      segments.push(segment);
      offset += segment.t.length;
      continue;
    }
    if (segment.r || !/^\s+$/u.test(segment.t)) {
      return { line, changed: false };
    }

    let whitespaceEnd = offset;
    while (
      whitespaceEnd < line.text.length &&
      /\s/u.test(line.text[whitespaceEnd])
    ) {
      whitespaceEnd += 1;
    }
    if (whitespaceEnd === offset) {
      changed = true;
      continue;
    }
    const sourceWhitespace = line.text.slice(offset, whitespaceEnd);
    segments.push({ ...segment, t: sourceWhitespace });
    offset = whitespaceEnd;
    changed ||= sourceWhitespace !== segment.t;
  }

  if (offset !== line.text.length) return { line, changed: false };
  return {
    line: changed ? { ...line, segments } : line,
    changed,
  };
}

function normalizeReadingDocumentSegments(doc) {
  if (doc?.script !== 'ja' || !Array.isArray(doc.lines)) {
    return { doc, changed: false };
  }
  let changed = false;
  const lines = doc.lines.map((line) => {
    const normalized = normalizeReadingLineSegments(line);
    changed ||= normalized.changed;
    return normalized.line;
  });
  return { doc: changed ? { ...doc, lines } : doc, changed };
}

function loadTrackReadingForIdentity(trackDir, sourceFilename, identity) {
  const storedDoc = getTrackReading(trackDir, sourceFilename);
  if (!storedDoc) return null;
  const normalized = normalizeReadingDocumentSegments(storedDoc);
  const doc = normalized.doc;

  const canonical = normalizeCanonicalIdentity(identity, doc.lines);
  if (!canonical) return null;

  const hasCurrentIdentity =
    doc.version === READING_DOC_VERSION &&
    doc.documentId === canonical.documentId &&
    doc.normalizerProfileId === canonical.normalizerProfileId &&
    doc.sourceFingerprint === canonical.sourceFingerprint &&
    doc.lines.every(
      (line, index) => line.lineId === canonical.lines[index].lineId,
    );
  if (hasCurrentIdentity) {
    if (normalized.changed) {
      atomicWriteJson(readingSidecarPath(trackDir, sourceFilename), doc);
    }
    return doc;
  }

  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  const migrated = {
    ...doc,
    version: READING_DOC_VERSION,
    documentId: canonical.documentId,
    normalizerProfileId: canonical.normalizerProfileId,
    sourceFingerprint: canonical.sourceFingerprint,
    identityMigratedAt: new Date().toISOString(),
    lines: doc.lines.map((line, index) => ({
      ...line,
      lineId: canonical.lines[index].lineId,
    })),
  };
  atomicWriteJson(sidecarPath, migrated);
  return migrated;
}

// `readingDoc` is buildReadingDoc()'s return shape ({ analyzer, lines }).
// Writes the versioned sidecar; overwrites any existing doc for this
// source wholesale (readingDoc is always the result of a fresh generation
// at this call site, never a partial update — setReadingLine below is the
// partial-update path).
function saveTrackReading(
  trackDir,
  sourceFilename,
  script,
  readingDoc,
  identity = null,
) {
  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  if (!sidecarPath || !readingDoc || !Array.isArray(readingDoc.lines)) {
    return null;
  }

  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  const canonical = normalizeCanonicalIdentity(identity, readingDoc.lines);
  if (identity !== null && !canonical) return null;
  const doc = {
    version: canonical ? READING_DOC_VERSION : LEGACY_READING_DOC_VERSION,
    sourceFilename,
    script,
    generatedAt: new Date().toISOString(),
    analyzer: readingDoc.analyzer ?? null,
    lines: canonical
      ? readingDoc.lines.map((line, index) => ({
          ...line,
          lineId: canonical.lines[index].lineId,
        }))
      : readingDoc.lines,
  };
  if (canonical) {
    doc.documentId = canonical.documentId;
    doc.normalizerProfileId = canonical.normalizerProfileId;
    doc.sourceFingerprint = canonical.sourceFingerprint;
  }
  atomicWriteJson(sidecarPath, doc);
  return doc;
}

function deleteTrackReading(trackDir, sourceFilename) {
  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  if (!sidecarPath) return false;
  try {
    fs.unlinkSync(sidecarPath);
    return true;
  } catch {
    return false;
  }
}

// Manual per-line correction. Branches on the doc's stored `script`:
// - 'ja': `readingValue` is a whole-line kana string; re-running alignOkurigana
//   on the line text handles multi-kanji-run lines, so automatic generation and
//   manual correction share one segment-construction path.
// - otherwise (Korean): there is no ruby step, so `readingValue` is the corrected
//   romaji itself and segments stay the single plain `{ t: line.text }`.
//
// Returns the updated doc, or null if there is no doc or the index is out of range.
function setReadingLine(
  trackDir,
  sourceFilename,
  lineReference,
  readingValue,
  options = {},
) {
  const doc = getTrackReading(trackDir, sourceFilename);
  if (!doc) return null;
  const canonical = normalizeCanonicalIdentity(lineReference, doc.lines);
  const lineIndex = canonical
    ? canonical.lines.findIndex(
        (line) => line.lineId === canonical.targetLineId,
      )
    : lineReference;
  if (!Number.isSafeInteger(lineIndex) || lineIndex < 0) return null;
  const line = doc.lines[lineIndex];
  if (!line) return null;

  const value = typeof readingValue === 'string' ? readingValue : '';
  let segments;
  let romaji;
  if (doc.script === 'ja') {
    segments = value ? alignOkurigana(line.text, value) : [{ t: line.text }];
    romaji =
      typeof options.kanaToRomaji === 'function'
        ? options.kanaToRomaji(katakanaToHiragana(value))
        : line.romaji;
  } else {
    segments = [{ t: line.text }];
    romaji = value;
  }

  const nextLines = canonical
    ? doc.lines.map((candidate, index) => ({
        ...candidate,
        lineId: canonical.lines[index].lineId,
      }))
    : doc.lines.slice();
  nextLines[lineIndex] = {
    ...nextLines[lineIndex],
    segments,
    romaji,
    edited: true,
  };

  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  const nextDoc = canonical
    ? {
        ...doc,
        version: READING_DOC_VERSION,
        documentId: canonical.documentId,
        normalizerProfileId: canonical.normalizerProfileId,
        sourceFingerprint: canonical.sourceFingerprint,
        lines: nextLines,
      }
    : { ...doc, lines: nextLines };
  atomicWriteJson(sidecarPath, nextDoc);
  return nextDoc;
}

module.exports = {
  getReadingsDirFromTrackDir,
  readingSidecarPath,
  getTrackReading,
  loadTrackReadingForIdentity,
  saveTrackReading,
  deleteTrackReading,
  setReadingLine,
};
