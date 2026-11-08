'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const values = require('../../../shared/lyricsTimingValues.json');
const { LYRICS_DIRNAME } = require('./constants');
const { hasControlCharactersExceptLineBreaks } = require('../textGuards');
const { atomicWriteExclusiveText } = require('../atomicWrite');
const { isAuthoredLyricsFilename, isLyricsSourceFilename } = require('./paths');
const { validateLyricsTimingDocument } = require('./lyricsTiming');

function authoredPath(trackDir, filename) {
  if (!isAuthoredLyricsFilename(filename))
    throw new Error('Invalid authored source');
  const directory = path.join(trackDir, LYRICS_DIRNAME);
  if (fs.realpathSync(directory) !== directory)
    throw new Error('Redirected lyrics directory');
  return path.join(directory, filename);
}

function fingerprint(lines) {
  return createHash('sha256')
    .update(JSON.stringify(lines.map(({ lineId, text }) => [lineId, text])))
    .digest('hex');
}

function authoredDocument(filename, document, lines = document.lines) {
  return validateLyricsTimingDocument({
    ...document,
    source: { filename, sha256: fingerprint(lines) },
    lines,
  });
}

function readAuthoredLyrics(trackDir, filename) {
  try {
    const file = authoredPath(trackDir, filename);
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > values.maxDocumentBytes
    )
      throw new Error('Invalid authored source file');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw?.schemaVersion !== 1) return { status: 'unsupported' };
    const { base, document, revision, recheckLineIds } = raw;
    if (
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      !isLyricsSourceFilename(base?.filename) ||
      typeof base.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(base.fingerprint) ||
      !Array.isArray(recheckLineIds) ||
      !['lyrics-source-v2', values.normalizerProfileId].includes(
        document?.normalizerProfileId,
      )
    )
      throw new Error('Invalid authored source metadata');
    const validated = validateLyricsTimingDocument(document, {
      sourceFilename: filename,
      sourceSha256: fingerprint(document.lines),
    });
    const lineIds = new Set(validated.lines.map((line) => line.lineId));
    if (
      new Set(recheckLineIds).size !== recheckLineIds.length ||
      !recheckLineIds.every((id) => lineIds.has(id))
    )
      throw new Error('Invalid recheck lines');
    return {
      status: 'current',
      value: {
        schemaVersion: 1,
        revision,
        base: { filename: base.filename, fingerprint: base.fingerprint },
        document: validated,
        recheckLineIds,
      },
    };
  } catch {
    return { status: 'corrupt' };
  }
}

function writeAuthoredLyrics(trackDir, filename, value) {
  const file = authoredPath(trackDir, filename);
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, 'utf8') > values.maxDocumentBytes)
    throw new Error('Authored source exceeds size limit');
  atomicWriteExclusiveText(file, text);
}

function reviseAuthoredLyrics(filename, saved, edit) {
  const { operation = 'replace', text, lineId } = edit ?? {};
  const index = saved.document.lines.findIndex(
    (line) => line.lineId === lineId,
  );
  if (
    index < 0 ||
    !['replace', 'insert', 'split', 'merge'].includes(operation) ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > values.maxTextLength ||
    hasControlCharactersExceptLineBreaks(text)
  )
    throw new Error('Invalid lyric edit');

  const lines = saved.document.lines.slice();
  const previous = lines[index];
  if (operation === 'replace' && previous.text === text) return saved;
  const recheck = new Set(saved.recheckLineIds);
  const untimed = (text, id = randomUUID()) => {
    recheck.add(id);
    return { lineId: id, text, startMs: null, endMs: null };
  };
  if (operation === 'replace') {
    lines[index] = { ...previous, text };
    delete lines[index].segments;
    recheck.add(lineId);
  } else if (operation === 'insert') {
    lines.splice(index + 1, 0, untimed(text));
  } else if (operation === 'split') {
    const parts = text.split(/\r?\n/u);
    if (parts.length < 2 || parts.some((part) => !part.trim()))
      throw new Error('A split needs at least two nonempty lines');
    lines.splice(
      index,
      1,
      ...parts.map((part, partIndex) =>
        untimed(part, partIndex === 0 ? lineId : undefined),
      ),
    );
  } else {
    const next = lines[index + 1];
    if (!next) throw new Error('No following line');
    recheck.delete(next.lineId);
    lines.splice(index, 2, untimed(`${text} ${next.text}`, lineId));
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.endInferred && line.endMs !== lines[index + 1]?.startMs) {
      lines[index] = { ...line, endMs: null };
      delete lines[index].endInferred;
    }
  }
  return {
    ...saved,
    revision: saved.revision + 1,
    document: authoredDocument(filename, saved.document, lines),
    recheckLineIds: [...recheck],
  };
}

module.exports = {
  authoredDocument,
  readAuthoredLyrics,
  reviseAuthoredLyrics,
  writeAuthoredLyrics,
};
