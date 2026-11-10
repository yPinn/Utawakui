'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteExclusiveText } = require('../atomicWrite');
const { isLyricsSourceFilename } = require('./paths');
const { maxDocumentBytes } = require('../../../shared/lyricsTimingValues.json');

const languages = ['zh-TW', 'en'];
const maxTextLength = 1000;

function translationPath(trackDir, filename) {
  if (!isLyricsSourceFilename(filename) || filename.length > 240)
    throw new Error('invalid translation source');
  const directory = path.join(trackDir, 'lyrics', 'translations');
  if (
    fs.realpathSync(path.dirname(directory)) !== path.dirname(directory) ||
    (fs.existsSync(directory) && fs.realpathSync(directory) !== directory)
  )
    throw new Error('invalid translation directory');
  return path.join(directory, `${filename}.json`);
}

function read(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.nlink > 1 || stat.size > maxDocumentBytes)
    throw new Error('invalid translation file');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    value?.version !== 1 ||
    typeof value.revision !== 'string' ||
    !languages.every((language) => Array.isArray(value.rows?.[language]))
  )
    throw new Error('invalid translation document');
  return value;
}

function matchingRows(rows, document, strict = false) {
  if (!Array.isArray(rows) || (strict && rows.length > document.lines.length))
    throw new Error('invalid translation rows');
  const originals = new Map(document.lines.map((line) => [line.lineId, line]));
  const seen = new Set();
  return rows.flatMap((row) => {
    const original = originals.get(row?.lineId);
    if (
      !original ||
      original.text !== row.original ||
      seen.has(row.lineId) ||
      typeof row.text !== 'string' ||
      row.text.length > maxTextLength
    ) {
      if (strict) throw new Error('invalid translation line');
      return [];
    }
    seen.add(row.lineId);
    const text = row.text.trim();
    return text
      ? [{ lineId: original.lineId, original: original.text, text }]
      : [];
  });
}

function loadTranslations(trackDir, filename, document) {
  const stored = read(translationPath(trackDir, filename));
  return {
    revision: stored?.revision ?? null,
    rows: Object.fromEntries(
      languages.map((language) => [
        language,
        stored?.documentId === document.documentId
          ? matchingRows(stored.rows[language], document)
          : [],
      ]),
    ),
  };
}

function saveTranslations(trackDir, filename, document, revision, rows) {
  const file = translationPath(trackDir, filename);
  if ((read(file)?.revision ?? null) !== revision) {
    const error = new Error('translation revision changed');
    error.code = 'LYRICS_SOURCE_CONFLICT';
    throw error;
  }
  const saved = {
    version: 1,
    revision: randomUUID(),
    documentId: document.documentId,
    rows: Object.fromEntries(
      languages.map((language) => [
        language,
        matchingRows(rows?.[language], document, true),
      ]),
    ),
  };
  const body = JSON.stringify(saved);
  if (Buffer.byteLength(body) > maxDocumentBytes)
    throw new Error('translation document too large');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteExclusiveText(file, body);
  return { revision: saved.revision, rows: saved.rows };
}

function deleteTranslations(trackDir, filename) {
  try {
    fs.rmSync(translationPath(trackDir, filename), { force: true });
  } catch {
    // Source deletion is authoritative even if its optional sidecar cannot be removed.
  }
}

module.exports = { deleteTranslations, loadTranslations, saveTranslations };
