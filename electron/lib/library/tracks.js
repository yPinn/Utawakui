'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const { VIDEO_ID_RE } = require('../youtube');
const {
  TRACKS_DIRNAME,
  INDEX_FILENAME,
  LYRICS_DIRNAME,
  SEPARATIONS_DIRNAME,
} = require('./constants');
const { uiLocale } = require('../../../shared/uiLocaleValues.json');
const {
  isSafeTrackId,
  isStructuredAudioFilename,
  isArtworkFilename,
  isServableFilename,
  compareFilenames,
  trackIdFromFilename,
  resolveTrackDir,
  resolveTrackAudioPath,
  resolveTrackPath,
} = require('./paths');
const { getTrackLyricsState } = require('./lyrics');
const {
  normalizeStructuredTrackSidecars,
  migrateLegacyFlatSeparation,
  migrateLibrary,
  trackFolderNeedsMigration,
} = require('./migrations');
const { loadIndex, saveIndexEntry } = require('./metadataIndex');
const { METADATA_FIELDS } = require('../reconciliation/metadata');
const { assertNoTransaction } = require('../reconciliation/transaction');
const {
  resolveSeparationsDir,
  loadSeparationManifest,
  manifestHasSelectedResult,
} = require('./separationManifest');

// Manual, repeatable counterpart to migrateTrackAlbumMetadata (metadataIndex.js);
// not version-gated, so it can rerun any time (e.g. after yt:download-audio wrote
// a track without album/releaseYear). Walks listTrackRecords (filesystem truth),
// so it also covers ids library.json has never seen. No network refetch:
// readTrackInfo only reads the info.json already on disk.
//
// Assigns only the two fields it fixes, onto a copy of the existing entry. A
// blind spread of readTrackInfo's result would blank good title/artist/duration
// when a sidecar lacks them and write thumbnailUrl into library.json, which
// AGENTS.md reserves for scalar metadata.
function refreshTrackMetadataFromSidecars(dir, readTrackInfo) {
  assertNoTransaction(dir);
  const index = loadIndex(dir);
  let updatedCount = 0;

  for (const record of listTrackRecords(dir)) {
    const trackDir = resolveTrackDir(dir, record.id);
    if (!trackDir) continue;
    const fields = readTrackInfo(trackDir) || {};
    if (fields.album === undefined && fields.releaseYear === undefined) {
      continue;
    }

    const existing = index.tracks[record.id] || {};
    const next = { ...existing };
    if (fields.album !== undefined && existing.albumOrigin !== 'manual')
      next.album = fields.album;
    if (
      fields.releaseYear !== undefined &&
      existing.releaseYearOrigin !== 'manual'
    )
      next.releaseYear = fields.releaseYear;
    if (
      next.album === existing.album &&
      next.releaseYear === existing.releaseYear
    ) {
      continue;
    }

    index.tracks[record.id] = next;
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  }
  return updatedCount;
}

function isPresentText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDuration(value) {
  return Number.isFinite(value) && value > 0;
}

// Automatic, repeatable offline maintenance pass. Title/artist are rewritten
// only when missing or when the current scalar still equals the provider's
// previous projection; this lets newer normalization repair old imports without
// trampling manual edits. Duration, album and year are fill-only because legacy
// entries have no reliable provenance for edits to those fields. Artwork remains filesystem
// state and network repair stays with runBackfillPass.
function organizeTrackMetadataFromSidecars(dir, readTrackInfo) {
  assertNoTransaction(dir);
  const index = loadIndex(dir);
  const updatedTrackIds = new Set();
  const normalizedTrackIds = new Set();
  const enrichedTrackIds = new Set();
  const skippedTrackIds = new Set();

  for (const record of listTrackRecords(dir)) {
    const trackDir = resolveTrackDir(dir, record.id);
    if (!trackDir) continue;
    const maintenance = readTrackInfo(trackDir);
    if (!maintenance?.normalized) continue;

    const fields = maintenance.normalized;
    const previousProjections = Array.isArray(maintenance.previousProjections)
      ? maintenance.previousProjections
      : [maintenance.previousProjection || {}];
    const hasExistingEntry = Object.prototype.hasOwnProperty.call(
      index.tracks,
      record.id,
    );
    const existing = index.tracks[record.id] || {};
    const next = { ...existing };
    if (!hasExistingEntry) {
      next.titleOrigin = 'provider';
      next.artistOrigin = 'provider';
    }
    let normalizedChanged = false;
    let enrichedChanged = false;
    let skipped = false;

    for (const field of ['title', 'artist']) {
      const proposed = fields[field];
      if (!isPresentText(proposed) || proposed === existing[field]) continue;

      if (existing[`${field}Origin`] === 'manual') {
        skipped = true;
        continue;
      }
      // Pre-origin indexes cannot distinguish "never had an artist" from a
      // user who intentionally cleared it. Preserve that ambiguous legacy
      // absence; new manual edits carry artistOrigin and brand-new tracks
      // without any index entry are still handled by provider backfill.
      if (
        field === 'artist' &&
        hasExistingEntry &&
        !isPresentText(existing.artist) &&
        existing.artistOrigin === undefined
      ) {
        skipped = true;
        continue;
      }
      if (
        !isPresentText(existing[field]) ||
        existing[`${field}Origin`] === 'provider' ||
        previousProjections.some(
          (previous) =>
            isPresentText(previous?.[field]) &&
            existing[field] === previous[field],
        )
      ) {
        next[field] = proposed;
        next[`${field}Origin`] = 'provider';
        normalizedChanged = true;
      } else {
        skipped = true;
      }
    }

    if (
      !isValidDuration(existing.duration) &&
      isValidDuration(fields.duration)
    ) {
      next.duration = fields.duration;
      enrichedChanged = true;
    }
    for (const field of METADATA_FIELDS.filter(
      (field) => !['title', 'artist'].includes(field),
    )) {
      const proposed = fields[field];
      const present = (value) =>
        typeof value === 'string'
          ? isPresentText(value)
          : Number.isSafeInteger(value) && value > 0;
      if (!present(proposed) || proposed === existing[field]) continue;
      if (existing[`${field}Origin`] === 'manual') {
        skipped = true;
        continue;
      }
      if (
        !present(existing[field]) ||
        existing[`${field}Origin`] === 'provider'
      ) {
        next[field] = proposed;
        next[`${field}Origin`] = 'provider';
        enrichedChanged = true;
      }
    }

    if (normalizedChanged || enrichedChanged) {
      index.tracks[record.id] = next;
      updatedTrackIds.add(record.id);
    }
    if (normalizedChanged) normalizedTrackIds.add(record.id);
    if (enrichedChanged) enrichedTrackIds.add(record.id);
    if (skipped) skippedTrackIds.add(record.id);
  }

  if (updatedTrackIds.size > 0) {
    atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  }

  return {
    updated: updatedTrackIds.size,
    normalized: normalizedTrackIds.size,
    enriched: enrichedTrackIds.size,
    skipped: skippedTrackIds.size,
  };
}

function compareOptionalStrings(a, b) {
  const hasA = typeof a === 'string' && a.length > 0;
  const hasB = typeof b === 'string' && b.length > 0;
  if (hasA && !hasB) return -1;
  if (!hasA && hasB) return 1;
  if (!hasA && !hasB) return 0;
  return a.localeCompare(b, uiLocale, { sensitivity: 'base' });
}

function compareTracks(a, b) {
  return (
    compareOptionalStrings(a.artist, b.artist) ||
    compareOptionalStrings(a.title, b.title) ||
    compareFilenames(a.filename, b.filename) ||
    a.id.localeCompare(b.id)
  );
}

function fileModifiedAt(filePath) {
  try {
    const modifiedAt = fs.statSync(filePath).mtime;
    return Number.isNaN(modifiedAt.getTime())
      ? undefined
      : modifiedAt.toISOString();
  } catch {
    return undefined;
  }
}

// Records built from a folder listing without a separations/ subfolder;
// buildTrack skips the manifest read for them.
const recordsWithoutSeparations = new WeakSet();

function readTrackFolder(trackDir) {
  let entries;
  try {
    entries = fs.readdirSync(trackDir, { withFileTypes: true });
  } catch {
    return null;
  }
  return {
    filenames: entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort(compareFilenames),
    // Links may point at folders; keep them so the reads still follow them.
    dirnames: new Set(
      entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name),
    ),
  };
}

// One readdir per track; the migration path rereads only when it has work.
function structuredTrackRecord(tracksRoot, id) {
  const trackDir = path.join(tracksRoot, id);
  let folder = readTrackFolder(trackDir);
  if (folder && trackFolderNeedsMigration(folder.filenames)) {
    normalizeStructuredTrackSidecars(trackDir);
    migrateLegacyFlatSeparation(trackDir);
    folder = readTrackFolder(trackDir);
  }
  if (!folder) return null;
  const audioFilename = folder.filenames.find(isStructuredAudioFilename);
  if (!audioFilename) return null;
  const artworkFilename = folder.filenames.find(isArtworkFilename);
  const lyrics = getTrackLyricsState(trackDir, {
    lyricsDirExists: folder.dirnames.has(LYRICS_DIRNAME),
  });
  const ext = path.extname(audioFilename);
  const record = {
    id,
    filename: `${id}${ext}`,
    audioFilename,
    importedAt: fileModifiedAt(path.join(trackDir, audioFilename)),
    hasInfo: folder.filenames.includes('info.json'),
    hasArtwork: Boolean(artworkFilename),
    lyrics,
    url: `utawakui-media://track/${encodeURIComponent(id)}/${encodeURIComponent(audioFilename)}`,
    thumbnailUrl: artworkFilename
      ? `utawakui-media://track/${encodeURIComponent(id)}/${encodeURIComponent(artworkFilename)}`
      : undefined,
  };
  if (!folder.dirnames.has(SEPARATIONS_DIRNAME)) {
    recordsWithoutSeparations.add(record);
  }
  return record;
}

function listStructuredTracks(dir) {
  const tracksRoot = path.join(dir, TRACKS_DIRNAME);
  let entries;
  try {
    entries = fs.readdirSync(tracksRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && isSafeTrackId(entry.name))
    .map((entry) => structuredTrackRecord(tracksRoot, entry.name))
    .filter(Boolean);
}

function listLegacyTracks(dir, structuredIds) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const seenIds = new Set();
  return entries
    .filter((entry) => entry.isFile() && isServableFilename(entry.name))
    .map((entry) => entry.name)
    .sort(compareFilenames)
    .filter((filename) => {
      const id = trackIdFromFilename(filename);
      if (seenIds.has(id) || structuredIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .map((filename) => ({
      id: trackIdFromFilename(filename),
      filename,
      audioFilename: filename,
      importedAt: fileModifiedAt(path.join(dir, filename)),
      hasInfo: false,
      hasArtwork: false,
      lyrics: { status: 'unchecked', sources: [] },
      url: `utawakui-media://local/${encodeURIComponent(filename)}`,
      thumbnailUrl: undefined,
    }));
}

function listTrackRecords(dir) {
  assertNoTransaction(dir);
  migrateLibrary(dir);
  const structured = listStructuredTracks(dir);
  const structuredIds = new Set(structured.map((track) => track.id));
  return [...structured, ...listLegacyTracks(dir, structuredIds)];
}

function buildTrack(dir, index, record) {
  const id = record.id;
  const indexed = index.tracks[id];
  const separationsDir = resolveSeparationsDir(dir, id);
  const separationManifest =
    separationsDir && !recordsWithoutSeparations.has(record)
      ? loadSeparationManifest(separationsDir)
      : { selectedRecipeId: null, results: {} };
  const resultCount = Object.keys(separationManifest.results).length;
  const selectedResultExists = manifestHasSelectedResult(
    separationsDir,
    separationManifest,
  );
  const metadataNeedsBackfill =
    !indexed?.title ||
    (indexed?.artist === undefined && indexed?.artistOrigin === 'provider') ||
    indexed?.duration === undefined;
  const assetNeedsBackfill =
    VIDEO_ID_RE.test(id) &&
    (!record.hasInfo ||
      !record.hasArtwork ||
      record.lyrics.status === 'unchecked' ||
      record.lyrics.needsScan);
  return {
    id,
    filename: record.filename,
    url: record.url,
    title: indexed?.title || id,
    artist: indexed?.artist,
    duration: indexed?.duration,
    // Album is optional; including it would create endless backfill loops.
    album: indexed?.album,
    releaseYear: indexed?.releaseYear,
    ...Object.fromEntries(
      METADATA_FIELDS.filter(
        (field) =>
          !['title', 'artist', 'album', 'releaseYear'].includes(field) &&
          Object.hasOwn(indexed ?? {}, field),
      ).map((field) => [field, indexed[field]]),
    ),
    sourceType: indexed?.sourceType,
    storageType: indexed?.storageType,
    originalFilename: indexed?.originalFilename,
    importedAt: indexed?.importedAt || record.importedAt,
    fileSize: indexed?.fileSize,
    contentHash: indexed?.contentHash,
    needsBackfill: metadataNeedsBackfill || assetNeedsBackfill,
    hasSeparation: selectedResultExists,
    stemsUrl: selectedResultExists
      ? `utawakui-media://track/${encodeURIComponent(id)}/separations/${encodeURIComponent(
          separationManifest.results[separationManifest.selectedRecipeId]
            .artifactFilename,
        )}`
      : undefined,
    separation:
      resultCount > 0
        ? {
            selectedRecipeId: separationManifest.selectedRecipeId,
            results: separationManifest.results,
          }
        : undefined,
    thumbnailUrl: record.thumbnailUrl,
    lyrics: record.lyrics,
  };
}

function listTracks(dir) {
  const index = loadIndex(dir);
  return listTrackRecords(dir)
    .map((record) => buildTrack(dir, index, record))
    .sort(compareTracks);
}

// Single-track counterpart to listTrackRecords: same migration and record
// shape, but reads only this track's folder (or the legacy root files).
function findTrackRecord(dir, trackId) {
  assertNoTransaction(dir);
  if (typeof trackId !== 'string' || !trackId) return null;
  migrateLibrary(dir);
  if (isSafeTrackId(trackId)) {
    const tracksRoot = path.join(dir, TRACKS_DIRNAME);
    let isDirectory = false;
    try {
      isDirectory = fs.statSync(path.join(tracksRoot, trackId)).isDirectory();
    } catch {
      // Missing folder: fall through to the legacy layout.
    }
    const record = isDirectory
      ? structuredTrackRecord(tracksRoot, trackId)
      : null;
    if (record) return record;
  }
  return (
    listLegacyTracks(dir, new Set()).find((track) => track.id === trackId) ||
    null
  );
}

function findTrack(dir, trackId) {
  const record = findTrackRecord(dir, trackId);
  return record ? buildTrack(dir, loadIndex(dir), record) : null;
}

function updateTrackMetadata(dir, trackId, fields = {}) {
  if (!findTrackRecord(dir, trackId)) return null;

  const title = String(fields.title ?? '').trim();
  if (!title) throw new Error('title is required');

  const artist = String(fields.artist ?? '').trim();
  saveIndexEntry(dir, trackId, {
    title,
    artist: artist || undefined,
    titleOrigin: 'manual',
    artistOrigin: 'manual',
  });

  return findTrack(dir, trackId);
}

// Deletes the original audio file, its vocal-separation output (if any),
// and its library.json entry. Returns false without touching anything if
// trackId doesn't resolve to a real file — findTrackRecord walks the
// filesystem, the same source of truth listTracks() itself trusts, so
// that's the check used to decide whether there's anything to delete.
function deleteTrack(dir, trackId) {
  const record = findTrackRecord(dir, trackId);
  if (!record) return false;

  const trackDir = resolveTrackDir(dir, trackId);
  if (trackDir && resolveTrackAudioPath(dir, trackId)) {
    fs.rmSync(trackDir, { recursive: true, force: true });
  } else {
    const filePath = resolveTrackPath(dir, record.filename);
    if (!filePath) return false;
    fs.unlinkSync(filePath);
  }

  const index = loadIndex(dir);
  if (trackId in index.tracks) {
    delete index.tracks[trackId];
    atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  }

  return true;
}

module.exports = {
  organizeTrackMetadataFromSidecars,
  refreshTrackMetadataFromSidecars,
  compareTracks,
  listTrackRecords,
  listTracks,
  findTrack,
  findTrackRecord,
  updateTrackMetadata,
  deleteTrack,
};
