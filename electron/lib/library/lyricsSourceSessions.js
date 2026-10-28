'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { findTrackRecord } = require('./tracks');
const {
  resolveTrackDir,
  isBoundedTrackId,
  isLyricsSubtitleFilename,
} = require('./paths');
const {
  readTrackLyrics,
  listTrackLyricsSources,
  setLyricsSourceOffset,
} = require('./lyrics');
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
      (filename != null && !isLyricsSubtitleFilename(filename))
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
    const sourceStamp = fileStamp(sourceFile);
    const timingFile = timingSidecarPath(trackDir, source.filename);
    const timingStamp = fileStamp(timingFile, {
      optional: true,
      contents: true,
    });
    const result = readTrackLyrics(dir, trackId, source.filename);
    if (
      !result ||
      fileStamp(sourceFile) !== sourceStamp ||
      fileStamp(timingFile, { optional: true, contents: true }) !== timingStamp
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
  return {
    inspect(trackId, filename, input) {
      const value = current(trackId, filename, input, false);
      if (
        value.timingRevision !== input.timingRevision ||
        value.offsetRevision !== input.offsetRevision
      )
        throw failure('LYRICS_SOURCE_CONFLICT');
      return value;
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
        beforeMutation(value);
        saveTrackLyricsTiming(value.trackDir, filename, fingerprint, document);
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
