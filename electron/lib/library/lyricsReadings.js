'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const { alignOkurigana, katakanaToHiragana } = require('../reading');
const {
  LYRICS_DIRNAME,
  LYRICS_READINGS_DIRNAME,
  READING_DOC_VERSION,
} = require('./constants');
const { isLyricsSubtitleFilename } = require('./paths');

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
      doc.version !== READING_DOC_VERSION ||
      doc.sourceFilename !== sourceFilename ||
      !Array.isArray(doc.lines)
    ) {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}

// `readingDoc` is buildReadingDoc()'s return shape ({ analyzer, lines }).
// Writes the versioned sidecar; overwrites any existing doc for this
// source wholesale (readingDoc is always the result of a fresh generation
// at this call site, never a partial update — setReadingLine below is the
// partial-update path).
function saveTrackReading(trackDir, sourceFilename, script, readingDoc) {
  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  if (!sidecarPath || !readingDoc || !Array.isArray(readingDoc.lines)) {
    return null;
  }

  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  const doc = {
    version: READING_DOC_VERSION,
    sourceFilename,
    script,
    generatedAt: new Date().toISOString(),
    analyzer: readingDoc.analyzer ?? null,
    lines: readingDoc.lines,
  };
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

// Manual per-line correction. Branches on the doc's own stored `script`:
//
// - 'ja': `readingValue` is a whole-line kana string (not per-segment) —
//   re-running alignOkurigana against the line's own text generalizes
//   correctly to multi-kanji-run lines (see reading.js's right-to-left
//   matching), so there's only one segment-construction path for both
//   automatic generation and manual correction.
// - anything else (Korean, per Stage 5c): there's no kana-to-ruby step to
//   redo — 한글 lyrics never produce ruby segments — so `readingValue` IS
//   the corrected romaji string directly, and segments stay the same
//   single plain `{ t: line.text }` buildRomanizationDoc always produces.
//
// Returns the updated doc, or null if there's no existing doc / the line
// index is out of range.
function setReadingLine(
  trackDir,
  sourceFilename,
  lineIndex,
  readingValue,
  options = {},
) {
  const doc = getTrackReading(trackDir, sourceFilename);
  if (!doc) return null;
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

  const nextLines = doc.lines.slice();
  nextLines[lineIndex] = { ...line, segments, romaji, edited: true };

  const sidecarPath = readingSidecarPath(trackDir, sourceFilename);
  const nextDoc = { ...doc, lines: nextLines };
  atomicWriteJson(sidecarPath, nextDoc);
  return nextDoc;
}

module.exports = {
  getReadingsDirFromTrackDir,
  readingSidecarPath,
  getTrackReading,
  saveTrackReading,
  deleteTrackReading,
  setReadingLine,
};
