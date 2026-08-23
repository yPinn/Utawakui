'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const { VIDEO_ID_RE } = require('../youtube');
const { TRACKS_DIRNAME, INDEX_FILENAME } = require('./constants');
const {
  isSafeTrackId,
  findStructuredAudioFilename,
  findArtworkFilename,
  hasTrackInfo,
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
} = require('./migrations');
const { loadIndex, saveIndexEntry } = require('./metadataIndex');
const {
  resolveSeparationsDir,
  loadSeparationManifest,
  manifestHasSelectedResult,
} = require('./separationManifest');

// Manual, repeatable counterpart to migrateTrackAlbumMetadata (metadataIndex.js)
// — not version-gated, so it can run again any time a user asks (e.g. after
// yt:download-audio wrote a track without album/releaseYear, a bug fixed
// separately). Walks the filesystem-truth track list (listTrackRecords),
// not just existing index entries, so it also covers ids library.json has
// never seen. Never does a network refetch: readTrackInfo only reads the
// info.json already on disk, so a track with no sidecar or a sidecar that
// genuinely lacks album/year is left untouched.
//
// Only ever assigns the two fields it exists to fix, onto a copy of the
// existing entry — never spreads readTrackInfo's whole return value. That
// return value always carries title/artist/duration keys (undefined when
// absent) plus an optional thumbnailUrl; a blind spread would blank out
// already-good title/artist/duration whenever a sidecar happens to lack
// them, and would write thumbnailUrl into library.json, which CLAUDE.md's
// library.json section reserves for scalar text/number fields only.
function refreshTrackMetadataFromSidecars(dir, readTrackInfo) {
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
    if (fields.album !== undefined) next.album = fields.album;
    if (fields.releaseYear !== undefined) next.releaseYear = fields.releaseYear;
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

// Settings' repeatable, offline maintenance pass. Title/artist are rewritten
// only when missing or when the current scalar still equals the provider's
// previous projection; this lets newer normalization repair old imports without
// trampling manual edits. Duration is fill-only, while album/year keep the
// existing sidecar-authoritative refresh behavior. Artwork remains filesystem
// state and network repair stays with runBackfillPass.
function organizeTrackMetadataFromSidecars(dir, readTrackInfo) {
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
    if (isPresentText(fields.album) && fields.album !== existing.album) {
      next.album = fields.album;
      enrichedChanged = true;
    }
    if (
      Number.isInteger(fields.releaseYear) &&
      fields.releaseYear !== existing.releaseYear
    ) {
      next.releaseYear = fields.releaseYear;
      enrichedChanged = true;
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
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareTracks(a, b) {
  return (
    compareOptionalStrings(a.artist, b.artist) ||
    compareOptionalStrings(a.title, b.title) ||
    compareFilenames(a.filename, b.filename) ||
    a.id.localeCompare(b.id)
  );
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
    .map((entry) => {
      const trackDir = path.join(tracksRoot, entry.name);
      normalizeStructuredTrackSidecars(trackDir);
      migrateLegacyFlatSeparation(trackDir);
      const audioFilename = findStructuredAudioFilename(trackDir);
      if (!audioFilename) return null;
      const artworkFilename = findArtworkFilename(trackDir);
      const lyrics = getTrackLyricsState(trackDir);
      const ext = path.extname(audioFilename);
      return {
        id: entry.name,
        filename: `${entry.name}${ext}`,
        audioFilename,
        hasInfo: hasTrackInfo(trackDir),
        hasArtwork: Boolean(artworkFilename),
        lyrics,
        url: `utawakui-media://track/${encodeURIComponent(entry.name)}/${encodeURIComponent(audioFilename)}`,
        thumbnailUrl: artworkFilename
          ? `utawakui-media://track/${encodeURIComponent(entry.name)}/${encodeURIComponent(artworkFilename)}`
          : undefined,
      };
    })
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
      hasInfo: false,
      hasArtwork: false,
      lyrics: { status: 'unchecked', sources: [] },
      url: `utawakui-media://local/${encodeURIComponent(filename)}`,
      thumbnailUrl: undefined,
    }));
}

function listTrackRecords(dir) {
  migrateLibrary(dir);
  const structured = listStructuredTracks(dir);
  const structuredIds = new Set(structured.map((track) => track.id));
  return [...structured, ...listLegacyTracks(dir, structuredIds)];
}

function listTracks(dir) {
  const index = loadIndex(dir);

  return listTrackRecords(dir)
    .map((record) => {
      const id = record.id;
      const indexed = index.tracks[id];
      const separationsDir = resolveSeparationsDir(dir, id);
      const separationManifest = separationsDir
        ? loadSeparationManifest(separationsDir)
        : { selectedRecipeId: null, results: {} };
      const resultCount = Object.keys(separationManifest.results).length;
      const selectedResultExists = manifestHasSelectedResult(
        separationsDir,
        separationManifest,
      );
      const metadataNeedsBackfill =
        !indexed?.title ||
        (indexed?.artist === undefined &&
          indexed?.artistOrigin === 'provider') ||
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
        sourceType: indexed?.sourceType,
        storageType: indexed?.storageType,
        originalFilename: indexed?.originalFilename,
        importedAt: indexed?.importedAt,
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
    })
    .sort(compareTracks);
}

function findTrackRecord(dir, trackId) {
  return listTrackRecords(dir).find((track) => track.id === trackId) || null;
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

  return listTracks(dir).find((track) => track.id === trackId) || null;
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
  findTrackRecord,
  updateTrackMetadata,
  deleteTrack,
};
