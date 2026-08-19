'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const { INDEX_FILENAME, INDEX_VERSION } = require('./constants');
const { resolveTrackDir } = require('./paths');

// Filesystem is authoritative; this index only enriches discovered tracks.
function loadIndex(dir) {
  const emptyIndex = { version: INDEX_VERSION, tracks: {} };
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, INDEX_FILENAME), 'utf8');
  } catch {
    return emptyIndex;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyIndex;
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.tracks !== 'object' ||
    data.tracks === null
  ) {
    return emptyIndex;
  }

  return { version: INDEX_VERSION, tracks: data.tracks };
}

// Atomic write avoids a half-written index after a crash.
function saveIndexEntry(dir, id, entry) {
  const index = loadIndex(dir);
  index.tracks[id] = { ...index.tracks[id], ...entry };
  atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  return index;
}

// One-time offline album/releaseYear migration from existing info.json files.
// Reads the raw file version so loadIndex() cannot mask migration state.
function migrateTrackAlbumMetadata(dir, readTrackInfo) {
  const filePath = path.join(dir, INDEX_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.tracks !== 'object' ||
    data.tracks === null ||
    (typeof data.version === 'number' && data.version >= INDEX_VERSION)
  ) {
    return false;
  }

  let changed = false;
  for (const [id, entry] of Object.entries(data.tracks)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const trackDir = resolveTrackDir(dir, id);
    if (!trackDir) continue;
    const fields = readTrackInfo(trackDir) || {};
    if (fields.album === undefined && fields.releaseYear === undefined) {
      continue;
    }
    data.tracks[id] = { ...entry, ...fields };
    changed = true;
  }

  data.version = INDEX_VERSION;
  atomicWriteJson(filePath, data);
  return changed;
}

module.exports = {
  loadIndex,
  saveIndexEntry,
  migrateTrackAlbumMetadata,
};
