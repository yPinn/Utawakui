'use strict';

const fs = require('node:fs');
const path = require('node:path');
const storageValues = require('../../../shared/libraryStorageValues.json');
const {
  AUDIO_EXTENSIONS,
  SEPARATIONS_DIRNAME,
  TRACKS_DIRNAME,
} = require('./constants');
const { isSafeTrackId, isStructuredAudioFilename } = require('./paths');
const {
  hasSeparationResultFile,
  loadSeparationManifest,
  removeSeparationResult,
} = require('./separationManifest');

function safeProduct(left, right) {
  const value = Number(left) * Number(right);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readDriveSpace(libraryDir, statfsSync) {
  try {
    const status = statfsSync(libraryDir);
    return {
      driveFreeBytes: safeProduct(status.bavail, status.bsize),
      driveCapacityBytes: safeProduct(status.blocks, status.bsize),
    };
  } catch {
    return { driveFreeBytes: null, driveCapacityBytes: null };
  }
}

function inspectLibraryStorage(
  libraryDir,
  { statfsSync = fs.statfsSync } = {},
) {
  const root = path.resolve(libraryDir);
  const totals = {
    totalBytes: 0,
    songBytes: 0,
    separationBytes: 0,
    otherBytes: 0,
  };
  const trackIds = new Set();
  const separationTrackIds = new Set();

  function visit(directory, segments) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      const nextSegments = [...segments, entry.name];
      if (entry.isDirectory()) {
        visit(entryPath, nextSegments);
        continue;
      }
      if (!entry.isFile()) continue;

      const bytes = fs.statSync(entryPath).size;
      totals.totalBytes += bytes;
      const isStructuredSong =
        nextSegments.length === 3 &&
        nextSegments[0] === TRACKS_DIRNAME &&
        isSafeTrackId(nextSegments[1]) &&
        isStructuredAudioFilename(nextSegments[2]);
      const isLegacySong =
        nextSegments.length === 1 &&
        AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase());
      const isSeparationAudio =
        nextSegments.length === 4 &&
        nextSegments[0] === TRACKS_DIRNAME &&
        isSafeTrackId(nextSegments[1]) &&
        nextSegments[2] === SEPARATIONS_DIRNAME &&
        /^[a-z0-9-]+\.wav$/iu.test(nextSegments[3]);

      if (isStructuredSong || isLegacySong) {
        totals.songBytes += bytes;
        trackIds.add(isStructuredSong ? nextSegments[1] : entry.name);
      } else if (isSeparationAudio) {
        totals.separationBytes += bytes;
        separationTrackIds.add(nextSegments[1]);
      } else {
        totals.otherBytes += bytes;
      }
    }
  }

  visit(root, []);
  return {
    ...totals,
    trackCount: trackIds.size,
    separationTrackCount: separationTrackIds.size,
    ...readDriveSpace(root, statfsSync),
  };
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listSeparationCandidates(
  libraryDir,
  { lastPlayedAtByTrackId = {}, protectedTrackIds = [] } = {},
) {
  const tracksRoot = path.join(path.resolve(libraryDir), TRACKS_DIRNAME);
  const protectedIds = new Set(protectedTrackIds);
  let trackEntries;
  try {
    trackEntries = fs.readdirSync(tracksRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const candidates = [];
  for (const trackEntry of trackEntries) {
    if (!trackEntry.isDirectory() || !isSafeTrackId(trackEntry.name)) continue;
    if (protectedIds.has(trackEntry.name)) continue;
    const separationsDir = path.join(
      tracksRoot,
      trackEntry.name,
      SEPARATIONS_DIRNAME,
    );
    const manifest = loadSeparationManifest(separationsDir);
    for (const [recipeId, result] of Object.entries(manifest.results)) {
      if (!hasSeparationResultFile(separationsDir, result.artifactFilename)) {
        continue;
      }
      const artifactPath = path.join(separationsDir, result.artifactFilename);
      candidates.push({
        trackId: trackEntry.name,
        recipeId,
        separationsDir,
        bytes: fs.statSync(artifactPath).size,
        selected: manifest.selectedRecipeId === recipeId,
        usedAt: timestamp(
          lastPlayedAtByTrackId[trackEntry.name] || result.completedAt,
        ),
        completedAt: timestamp(result.completedAt),
      });
    }
  }

  return candidates.sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? 1 : -1;
    if (left.usedAt !== right.usedAt) return left.usedAt - right.usedAt;
    if (left.completedAt !== right.completedAt) {
      return left.completedAt - right.completedAt;
    }
    return right.bytes - left.bytes;
  });
}

function resolveReserveBytes(capacityBytes) {
  if (!Number.isFinite(capacityBytes) || capacityBytes <= 0) {
    return storageValues.minimumReserveBytes;
  }
  return Math.min(
    storageValues.maximumReserveBytes,
    Math.max(
      storageValues.minimumReserveBytes,
      Math.round(capacityBytes * storageValues.reserveVolumeRatio),
    ),
  );
}

function cleanupSeparationStorage(
  libraryDir,
  {
    limitBytes,
    lastPlayedAtByTrackId = {},
    protectedTrackIds = [],
    targetRatio = storageValues.cleanupTargetRatio,
    reserveFreeBytes,
    statfsSync = fs.statfsSync,
  } = {},
) {
  const before = inspectLibraryStorage(libraryDir, { statfsSync });
  const reserve = Number.isFinite(reserveFreeBytes)
    ? Math.max(0, reserveFreeBytes)
    : resolveReserveBytes(before.driveCapacityBytes);
  const quotaBytesToFree =
    Number.isFinite(limitBytes) && before.separationBytes > limitBytes
      ? before.separationBytes - Math.floor(limitBytes * targetRatio)
      : 0;
  const reserveBytesToFree = Number.isFinite(before.driveFreeBytes)
    ? Math.max(0, reserve - before.driveFreeBytes)
    : 0;
  const bytesToFree = Math.max(quotaBytesToFree, reserveBytesToFree);
  if (bytesToFree === 0) {
    return {
      freedBytes: 0,
      removed: [],
      remainingBytesToFree: 0,
      storage: before,
    };
  }

  const removed = [];
  let freedBytes = 0;
  const candidates = listSeparationCandidates(libraryDir, {
    lastPlayedAtByTrackId,
    protectedTrackIds,
  });
  for (const candidate of candidates) {
    if (freedBytes >= bytesToFree) break;
    const result = removeSeparationResult(
      candidate.separationsDir,
      candidate.recipeId,
    );
    if (!result) continue;
    freedBytes += candidate.bytes;
    removed.push({
      trackId: candidate.trackId,
      recipeId: candidate.recipeId,
      bytes: candidate.bytes,
    });
  }

  const storage = inspectLibraryStorage(libraryDir, { statfsSync });
  if (
    Number.isFinite(before.driveFreeBytes) &&
    Number.isFinite(storage.driveFreeBytes)
  ) {
    storage.driveFreeBytes = Math.min(
      storage.driveCapacityBytes ?? Number.MAX_SAFE_INTEGER,
      Math.max(storage.driveFreeBytes, before.driveFreeBytes + freedBytes),
    );
  }
  return {
    freedBytes,
    removed,
    remainingBytesToFree: Math.max(0, bytesToFree - freedBytes),
    storage,
  };
}

function createLibraryStorageService({
  resolveLibraryDir,
  getLastPlayedAtByTrackId = () => ({}),
  getProtectedTrackIds = () => [],
  notifyLibraryUpdated = () => undefined,
  statfsSync = fs.statfsSync,
}) {
  function inspect() {
    return inspectLibraryStorage(resolveLibraryDir(), { statfsSync });
  }

  function cleanup(policy, options = {}) {
    const protectedTrackIds = [
      ...new Set([
        ...getProtectedTrackIds(),
        ...(options.protectedTrackIds || []),
      ]),
    ];
    const result = cleanupSeparationStorage(resolveLibraryDir(), {
      limitBytes: policy.separationLimitBytes,
      lastPlayedAtByTrackId: getLastPlayedAtByTrackId(),
      protectedTrackIds,
      statfsSync,
    });
    if (result.removed.length > 0) notifyLibraryUpdated();
    return result;
  }

  function enforcePolicy(policy, options) {
    if (!policy.autoManageSeparation) {
      return {
        freedBytes: 0,
        removed: [],
        remainingBytesToFree: 0,
        storage: inspect(),
      };
    }
    return cleanup(policy, options);
  }

  return { inspect, cleanup, enforcePolicy };
}

module.exports = {
  cleanupSeparationStorage,
  createLibraryStorageService,
  inspectLibraryStorage,
  listSeparationCandidates,
  resolveReserveBytes,
};
