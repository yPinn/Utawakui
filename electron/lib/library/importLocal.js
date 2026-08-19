'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJson } = require('../atomicWrite');
const {
  AUDIO_EXTENSIONS,
  STRUCTURED_AUDIO_BASENAME,
  CONTENT_HASH_CHUNK_SIZE,
  INDEX_FILENAME,
} = require('./constants');
const {
  isSafeTrackId,
  resolveTrackDir,
  resolveTrackAudioPath,
} = require('./paths');
const { loadIndex, saveIndexEntry } = require('./metadataIndex');
// listTrackRecords is the filesystem-truth track list buildContentHashTrackMap
// walks to find existing content hashes. This is the one place a "not
// tracks.js" submodule needs tracks.js: buildContentHashTrackMap can't
// duplicate track enumeration/migration logic without drifting from it.
const { listTrackRecords } = require('./tracks');

function isSha256Digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function computeFileContentHash(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(CONTENT_HASH_CHUNK_SIZE);
  const fd = fs.openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function localTrackIdBaseFromFilePath(filePath) {
  const stem = path.basename(filePath, path.extname(filePath)).trim();
  return isSafeTrackId(stem) ? stem : 'track';
}

function uniqueLocalTrackId(dir, baseId) {
  let candidate = baseId;
  let suffix = 2;
  while (resolveTrackAudioPath(dir, candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function buildContentHashTrackMap(dir) {
  const index = loadIndex(dir);
  const trackIdByContentHash = new Map();
  let changed = false;

  for (const record of listTrackRecords(dir)) {
    const indexed = index.tracks[record.id];
    let contentHash = indexed?.contentHash;
    if (
      !isSha256Digest(contentHash) &&
      indexed?.sourceType === 'local-file' &&
      indexed?.storageType === 'managed'
    ) {
      const audioPath = resolveTrackAudioPath(dir, record.id);
      if (audioPath) {
        try {
          contentHash = computeFileContentHash(audioPath);
          index.tracks[record.id] = { ...indexed, contentHash };
          changed = true;
        } catch {
          contentHash = undefined;
        }
      }
    }

    if (isSha256Digest(contentHash) && !trackIdByContentHash.has(contentHash)) {
      trackIdByContentHash.set(contentHash, record.id);
    }
  }

  if (changed) atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  return trackIdByContentHash;
}

function importLocalAudioFiles(dir, filePaths) {
  const result = { imported: [], skipped: [] };
  if (!Array.isArray(filePaths)) return result;

  const trackIdByContentHash = buildContentHashTrackMap(dir);

  for (const sourcePath of filePaths) {
    if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
      result.skipped.push({ path: sourcePath, reason: 'invalid-path' });
      continue;
    }

    const ext = path.extname(sourcePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      result.skipped.push({
        path: sourcePath,
        reason: 'unsupported-extension',
      });
      continue;
    }
    if (!fs.existsSync(sourcePath)) {
      result.skipped.push({ path: sourcePath, reason: 'missing-file' });
      continue;
    }

    let sourceStats;
    let contentHash;
    try {
      sourceStats = fs.statSync(sourcePath);
      contentHash = computeFileContentHash(sourcePath);
    } catch (err) {
      result.skipped.push({
        path: sourcePath,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const existingTrackId = trackIdByContentHash.get(contentHash);
    if (existingTrackId) {
      result.skipped.push({
        path: sourcePath,
        reason: 'duplicate-content',
        existingTrackId,
      });
      continue;
    }

    const title = path.basename(sourcePath, ext).trim() || '未命名曲目';
    const trackId = uniqueLocalTrackId(
      dir,
      localTrackIdBaseFromFilePath(sourcePath),
    );
    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) {
      result.skipped.push({ path: sourcePath, reason: 'invalid-track-id' });
      continue;
    }

    try {
      const audioFilename = `${STRUCTURED_AUDIO_BASENAME}${ext}`;
      fs.mkdirSync(trackDir, { recursive: true });
      fs.copyFileSync(sourcePath, path.join(trackDir, audioFilename));
      saveIndexEntry(dir, trackId, {
        title,
        sourceType: 'local-file',
        storageType: 'managed',
        audioFilename,
        originalFilename: path.basename(sourcePath),
        importedAt: new Date().toISOString(),
        fileSize: sourceStats.size,
        contentHash,
      });
      trackIdByContentHash.set(contentHash, trackId);
      result.imported.push({ id: trackId, title });
    } catch (err) {
      result.skipped.push({
        path: sourcePath,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

module.exports = {
  importLocalAudioFiles,
};
