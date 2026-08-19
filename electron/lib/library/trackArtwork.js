'use strict';

const fs = require('fs');
const path = require('path');
const { ARTWORK_BASENAME, IMAGE_EXTENSIONS } = require('./constants');
const {
  resolveTrackDir,
  resolveTrackAudioPath,
  isArtworkFilename,
} = require('./paths');
const { findTrackRecord } = require('./tracks');

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
  for (const entry of fs.readdirSync(trackDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      isArtworkFilename(entry.name) &&
      entry.name !== filename
    ) {
      fs.rmSync(path.join(trackDir, entry.name), { force: true });
    }
  }
  fs.copyFileSync(sourcePath, path.join(trackDir, filename));
  return filename;
}

function deleteTrackArtworkFile(dir, trackId) {
  if (!findTrackRecord(dir, trackId)) return false;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return false;
  return deleteTrackArtworkFiles(trackDir);
}

module.exports = {
  writeTrackArtworkFile,
  deleteTrackArtworkFile,
};
