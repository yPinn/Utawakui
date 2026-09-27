'use strict';

const fs = require('fs');
const path = require('path');
const {
  atomicCopyFileSync,
  atomicWriteBuffer,
  atomicWriteJson,
} = require('../atomicWrite');
const {
  ARTWORK_BASENAME,
  ARTWORK_PROVENANCE_FILENAME,
  IMAGE_EXTENSIONS,
} = require('./constants');
const {
  resolveTrackDir,
  resolveTrackAudioPath,
  isArtworkFilename,
} = require('./paths');
const { findTrackRecord } = require('./tracks');

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function deleteArtworkProvenance(trackDir) {
  const provenancePath = path.join(trackDir, ARTWORK_PROVENANCE_FILENAME);
  const existed = fs.existsSync(provenancePath);
  fs.rmSync(provenancePath, { force: true });
  return existed;
}

function removeOtherArtworkFiles(trackDir, keepFilename) {
  for (const entry of fs.readdirSync(trackDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      isArtworkFilename(entry.name) &&
      entry.name !== keepFilename
    ) {
      fs.rmSync(path.join(trackDir, entry.name), { force: true });
    }
  }
}

function normalizeArtworkProvenance(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.source !== 'cover-art-archive' ||
    value.provider !== 'musicbrainz'
  ) {
    return null;
  }
  const ids = {};
  for (const field of ['recordingMbid', 'releaseGroupMbid', 'releaseMbid']) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== 'string' || !MBID_RE.test(value[field])) {
      return null;
    }
    ids[field] = value[field].toLowerCase();
  }
  if (!ids.releaseGroupMbid && !ids.releaseMbid) return null;
  if (
    typeof value.selectedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.selectedAt))
  ) {
    return null;
  }
  let sourcePage;
  try {
    sourcePage = new URL(value.sourcePage);
  } catch {
    return null;
  }
  if (
    sourcePage.protocol !== 'https:' ||
    sourcePage.hostname !== 'musicbrainz.org' ||
    !/^\/(?:recording|release-group|release)\/[0-9a-f-]+$/iu.test(
      sourcePage.pathname,
    )
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    source: 'cover-art-archive',
    provider: 'musicbrainz',
    ...ids,
    selectedAt: new Date(value.selectedAt).toISOString(),
    sourcePage: sourcePage.href,
  };
}

function deleteTrackArtworkFiles(trackDir) {
  let entries;
  try {
    entries = fs.readdirSync(trackDir, { withFileTypes: true });
  } catch {
    return false;
  }

  let deleted = false;
  for (const entry of entries) {
    if (!entry.isFile() || !isArtworkFilename(entry.name)) continue;
    fs.rmSync(path.join(trackDir, entry.name), { force: true });
    deleted = true;
  }
  return deleted;
}

function writeTrackArtworkFile(dir, trackId, sourcePath) {
  if (!findTrackRecord(dir, trackId)) return null;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return null;

  if (typeof sourcePath !== 'string' || sourcePath.length === 0) return null;
  const ext = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  fs.mkdirSync(trackDir, { recursive: true });
  const filename = `${ARTWORK_BASENAME}${ext}`;
  deleteArtworkProvenance(trackDir);
  atomicCopyFileSync(sourcePath, path.join(trackDir, filename));
  removeOtherArtworkFiles(trackDir, filename);
  return filename;
}

function writeTrackArtworkBuffer(dir, trackId, buffer, extension, provenance) {
  if (!findTrackRecord(dir, trackId)) return null;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return null;
  const ext = String(extension || '').toLowerCase();
  const normalizedProvenance = normalizeArtworkProvenance(provenance);
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0 ||
    buffer.length > MAX_ARTWORK_BYTES ||
    !IMAGE_EXTENSIONS.has(ext) ||
    !normalizedProvenance
  ) {
    return null;
  }

  fs.mkdirSync(trackDir, { recursive: true });
  const filename = `${ARTWORK_BASENAME}${ext}`;
  deleteArtworkProvenance(trackDir);
  atomicWriteBuffer(path.join(trackDir, filename), buffer);
  removeOtherArtworkFiles(trackDir, filename);
  atomicWriteJson(
    path.join(trackDir, ARTWORK_PROVENANCE_FILENAME),
    normalizedProvenance,
  );
  return filename;
}

function deleteTrackArtworkFile(dir, trackId) {
  if (!findTrackRecord(dir, trackId)) return false;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return false;
  const artworkDeleted = deleteTrackArtworkFiles(trackDir);
  const provenanceDeleted = deleteArtworkProvenance(trackDir);
  return artworkDeleted || provenanceDeleted;
}

module.exports = {
  writeTrackArtworkFile,
  writeTrackArtworkBuffer,
  deleteTrackArtworkFile,
};
