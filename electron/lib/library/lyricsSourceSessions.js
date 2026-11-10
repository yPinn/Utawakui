'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { findTrackRecord } = require('./tracks');
const {
  resolveTrackDir,
  isBoundedTrackId,
  isLyricsSourceFilename,
  isAuthoredLyricsFilename,
} = require('./paths');
const {
  readTrackLyrics,
  listTrackLyricsSources,
  setLyricsSourceOffset,
  saveTrackLyricsManifest,
} = require('./lyrics');
const {
  authoredDocument,
  readAuthoredLyrics,
  reviseAuthoredLyrics,
  writeAuthoredLyrics,
} = require('./lyricsAuthored');
const {
  isLegacyReferenceLabel,
  normalizeLyricsDocument,
  referenceLyricsDraft,
} = require('../../../src/utils/lyricsDocument.js');
const {
  timingSidecarPath,
  saveTrackLyricsTiming,
  validateLyricsTimingDocument,
} = require('./lyricsTiming');
const {
  maxDocumentBytes,
  normalizerProfileId,
} = require('../../../shared/lyricsTimingValues.json');
const UUID = /^[a-f0-9-]{36}$/;
const REVISION = /^[a-f0-9]{64}$/;
function failure(code = 'LYRICS_SOURCE_STALE') {
  const error = new Error(code);
  error.code = code;
  return error;
}
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function fileStamp(file, { optional = false, contents = false } = {}) {
  const parent = path.dirname(file);
  if (fs.existsSync(parent) && fs.realpathSync(parent) !== parent)
    throw failure();
  let stat;
  try {
    stat = fs.lstatSync(file, { bigint: true });
  } catch (error) {
    if (optional && error.code === 'ENOENT') return 'missing';
    throw error;
  }
  if (!stat.isFile() || stat.nlink > 1n || fs.realpathSync(file) !== file)
    throw failure();
  if (contents && stat.size > BigInt(maxDocumentBytes))
    throw failure('LYRICS_SOURCE_UNUSABLE');
  const stamp = [
    stat.dev,
    stat.ino,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
  return contents
    ? digest(`${stamp}\0${digest(fs.readFileSync(file))}`)
    : stamp;
}
function validSession(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 3 &&
    ['id', 'timingRevision', 'offsetRevision'].every((key) =>
      Object.hasOwn(value, key),
    ) &&
    UUID.test(value.id) &&
    REVISION.test(value.timingRevision) &&
    UUID.test(value.offsetRevision),
  );
}

function createLyricsSourceSessions({
  getContext,
  beforeMutation = () => {},
} = {}) {
  const sessions = new Map(),
    offsets = new Map();
  function boundedSet(map, key, value) {
    if (!map.has(key) && map.size >= 128) map.delete(map.keys().next().value);
    map.set(key, value);
  }
  function snapshot(trackId, filename, requireMedia = true) {
    if (
      !isBoundedTrackId(trackId) ||
      ['__proto__', 'prototype', 'constructor'].includes(trackId) ||
      (filename != null && !isLyricsSourceFilename(filename))
    )
      throw failure('LYRICS_SOURCE_INVALID');
    const scope = getContext(),
      dir = path.resolve(scope.dir),
      epoch = scope.epoch;
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir || (requireMedia && !findTrackRecord(dir, trackId)))
      return null;
    if (fs.realpathSync(trackDir) !== trackDir) throw failure();
    const stat = fs.statSync(trackDir, { bigint: true }),
      identity = `${stat.dev}:${stat.ino}`;
    const sources = listTrackLyricsSources(trackDir).sources;
    const source = filename
      ? sources.find((row) => row.filename === filename)
      : sources[0];
    if (!source) return null;
    const sourceFile = path.join(trackDir, 'lyrics', source.filename);
    const authored = isAuthoredLyricsFilename(source.filename);
    const timingFile = authored
      ? sourceFile
      : timingSidecarPath(trackDir, source.filename);
    const sourceStamp = authored ? 'authored' : fileStamp(sourceFile);
    const timingStampOptions = {
      optional: true,
      contents: true,
    };
    const timingStamp = fileStamp(timingFile, timingStampOptions);
    const result = readTrackLyrics(dir, trackId, source.filename);
    if (
      !result ||
      (!authored && fileStamp(sourceFile) !== sourceStamp) ||
      fileStamp(timingFile, timingStampOptions) !== timingStamp
    )
      throw failure();
    const offsetMs = Number.isInteger(result.source.offsetMs)
      ? result.source.offsetMs
      : 0;
    const offsetKey = `${dir}\0${epoch}\0${identity}\0${source.filename}`;
    let offset = offsets.get(offsetKey);
    if (!offset || offset.value !== offsetMs) {
      offset = { value: offsetMs, revision: randomUUID() };
      boundedSet(offsets, offsetKey, offset);
    }
    return {
      dir,
      epoch,
      trackDir,
      identity,
      trackId,
      filename: source.filename,
      authored,
      sourceStamp,
      result,
      timingRevision: digest(timingStamp),
      offsetRevision: offset.revision,
    };
  }
  function projected(value, id) {
    return {
      id,
      timingRevision: value.timingRevision,
      offsetRevision: value.offsetRevision,
    };
  }
  function current(trackId, filename, input, requireMedia = true) {
    if (!validSession(input)) throw failure('LYRICS_SOURCE_INVALID');
    const opened = sessions.get(input.id);
    if (!opened || opened.trackId !== trackId || opened.filename !== filename)
      throw failure();
    const value = snapshot(trackId, filename, requireMedia);
    if (
      !value ||
      ['dir', 'epoch', 'identity', 'sourceStamp'].some(
        (key) => opened[key] !== value[key],
      ) ||
      opened.fingerprint !== value.result.timing.sourceFingerprint
    )
      throw failure();
    return value;
  }
  function inspect(trackId, filename, input) {
    const value = current(trackId, filename, input, false);
    if (
      value.timingRevision !== input.timingRevision ||
      value.offsetRevision !== input.offsetRevision
    )
      throw failure('LYRICS_SOURCE_CONFLICT');
    return value;
  }

  function writeAuthoredCopy(value, targetDir = value.trackDir) {
    const { source, timing } = value.result;
    if (
      Buffer.byteLength(value.result.text, 'utf8') > maxDocumentBytes ||
      !timing.sourceFingerprint ||
      !['missing', 'current'].includes(timing.status)
    )
      throw failure('LYRICS_SOURCE_UNUSABLE');
    const id = randomUUID();
    const filename = `authored-${id}.json`;
    const original = normalizeLyricsDocument({
      ...value.result,
      sourceFingerprint: timing.sourceFingerprint,
      normalizerProfileId: timing.normalizerProfileId,
    });
    if (original.lines.length === 0) throw failure('LYRICS_SOURCE_UNUSABLE');
    let document;
    try {
      document = authoredDocument(filename, { ...original, documentId: id });
    } catch {
      throw failure('LYRICS_SOURCE_UNUSABLE');
    }
    const copy = {
      filename,
      kind: 'authored',
      language: source.language,
      offsetMs: source.offsetMs,
    };
    const lyricsDir = path.join(targetDir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    writeAuthoredLyrics(targetDir, filename, {
      schemaVersion: 1,
      revision: 1,
      base: {
        filename: source.filename,
        fingerprint: timing.sourceFingerprint,
      },
      document,
      recheckLineIds: timing.recheckLineIds ?? [],
    });
    try {
      const sources = listTrackLyricsSources(targetDir).sources;
      saveTrackLyricsManifest(targetDir, [...sources, copy], {
        preference: { filename, origin: 'user' },
      });
    } catch (error) {
      fs.rmSync(path.join(lyricsDir, filename), { force: true });
      throw error;
    }
    return { source: copy };
  }

  return {
    inspect,
    readReference(trackId, filename, { timed = false } = {}) {
      const value = snapshot(trackId, filename);
      if (!value) return null;
      if (timed) return value.result;
      const text = referenceLyricsDraft(value.result);
      return text ? { text } : null;
    },
    copyLinkedReference(trackId, referenceId, filename) {
      const value = snapshot(referenceId, filename);
      if (!value || trackId === referenceId || !isBoundedTrackId(trackId))
        throw failure();
      const targetDir = resolveTrackDir(value.dir, trackId);
      if (
        !targetDir ||
        !findTrackRecord(value.dir, trackId) ||
        fs.realpathSync(targetDir) !== targetDir
      )
        throw failure();
      const sources = listTrackLyricsSources(targetDir).sources;
      if (sources.length) {
        const [existing] = sources;
        if (
          sources.length !== 1 ||
          existing.kind !== 'manual' ||
          !isLegacyReferenceLabel(existing.label) ||
          existing.offsetMs
        )
          throw failure();
        const legacy = snapshot(trackId, existing.filename)?.result;
        if (
          legacy?.timing.status !== 'missing' ||
          legacy.text.trim() !== referenceLyricsDraft(value.result)
        )
          throw failure();
      }
      return writeAuthoredCopy(value, targetDir);
    },
    invalidateTrack(trackId) {
      for (const [id, session] of sessions)
        if (!trackId || session.trackId === trackId) sessions.delete(id);
    },
    open(trackId, filename) {
      const value = snapshot(trackId, filename);
      if (!value) return null;
      for (const [id, opened] of sessions) {
        if (
          opened.trackId === trackId &&
          opened.filename === value.filename &&
          ['dir', 'epoch', 'identity', 'sourceStamp'].every(
            (key) => opened[key] === value[key],
          ) &&
          opened.fingerprint === value.result.timing.sourceFingerprint
        ) {
          sessions.delete(id);
          sessions.set(id, opened);
          return { ...value.result, sourceSession: projected(value, id) };
        }
      }
      const id = randomUUID();
      boundedSet(sessions, id, {
        dir: value.dir,
        epoch: value.epoch,
        identity: value.identity,
        sourceStamp: value.sourceStamp,
        fingerprint: value.result.timing.sourceFingerprint,
        trackId,
        filename: value.filename,
      });
      return { ...value.result, sourceSession: projected(value, id) };
    },
    cancel(id) {
      if (typeof id !== 'string' || !UUID.test(id))
        throw failure('LYRICS_SOURCE_INVALID');
      sessions.delete(id);
      return { status: 'cancelled' };
    },
    forkAuthored(trackId, filename, input) {
      const value = inspect(trackId, filename, input);
      if (!findTrackRecord(value.dir, trackId))
        throw failure('LYRICS_SOURCE_UNUSABLE');
      return writeAuthoredCopy(value);
    },
    editAuthored(trackId, filename, input, edit) {
      const value = inspect(trackId, filename, input);
      if (!value.authored) throw failure('LYRICS_SOURCE_INVALID');
      const { value: saved } = readAuthoredLyrics(value.trackDir, filename);
      if (!saved || !findTrackRecord(value.dir, trackId))
        throw failure('LYRICS_SOURCE_UNUSABLE');
      let updated;
      try {
        updated = reviseAuthoredLyrics(filename, saved, edit);
      } catch {
        throw failure('LYRICS_SOURCE_INVALID');
      }
      if (updated !== saved) {
        beforeMutation(value);
        writeAuthoredLyrics(value.trackDir, filename, updated);
      }
      return this.open(trackId, filename);
    },
    saveTiming(trackId, filename, fingerprint, document, input) {
      const value = current(trackId, filename, input);
      if (
        value.timingRevision !== input.timingRevision ||
        fingerprint !== value.result.timing.sourceFingerprint
      )
        throw failure('LYRICS_SOURCE_CONFLICT');
      if (
        ['corrupt', 'unsupported', 'unavailable'].includes(
          value.result.timing.status,
        )
      )
        throw failure('LYRICS_SOURCE_UNUSABLE');
      let validated;
      try {
        if (
          !['lyrics-source-v2', normalizerProfileId].includes(
            document?.normalizerProfileId,
          )
        )
          throw failure('LYRICS_SOURCE_INVALID');
        validated = validateLyricsTimingDocument(document, {
          sourceFilename: filename,
          sourceSha256: fingerprint,
        });
      } catch {
        throw failure('LYRICS_SOURCE_INVALID');
      }
      if (
        value.result.timing.status !== 'current' ||
        JSON.stringify(validated) !==
          JSON.stringify(value.result.timing.document)
      ) {
        if (value.authored) {
          const { value: saved } = readAuthoredLyrics(value.trackDir, filename);
          if (
            !saved ||
            validated.documentId !== saved.document.documentId ||
            validated.normalizerProfileId !==
              saved.document.normalizerProfileId ||
            validated.lines.length !== saved.document.lines.length ||
            validated.lines.some(
              (line, index) =>
                line.lineId !== saved.document.lines[index].lineId ||
                line.text !== saved.document.lines[index].text,
            )
          )
            throw failure('LYRICS_SOURCE_INVALID');
          beforeMutation(value);
          writeAuthoredLyrics(value.trackDir, filename, {
            ...saved,
            revision: saved.revision + 1,
            document: validated,
          });
        } else {
          beforeMutation(value);
          saveTrackLyricsTiming(
            value.trackDir,
            filename,
            fingerprint,
            document,
          );
        }
      }
      const saved = current(trackId, filename, input);
      return {
        ...saved.result.timing,
        sourceSession: projected(saved, input.id),
      };
    },
    saveOffset(trackId, filename, offsetMs, input) {
      const value = current(trackId, filename, input);
      if (value.offsetRevision !== input.offsetRevision)
        throw failure('LYRICS_SOURCE_CONFLICT');
      if (!Number.isInteger(offsetMs) || Math.abs(offsetMs) > 3600000)
        throw failure('LYRICS_SOURCE_INVALID');
      if ((value.result.source.offsetMs ?? 0) !== offsetMs) {
        beforeMutation(value);
        if (!setLyricsSourceOffset(value.trackDir, filename, offsetMs))
          throw failure();
      }
      const saved = current(trackId, filename, input);
      return {
        source: saved.result.source,
        sourceSession: projected(saved, input.id),
      };
    },
  };
}
module.exports = { createLyricsSourceSessions, validSession };
