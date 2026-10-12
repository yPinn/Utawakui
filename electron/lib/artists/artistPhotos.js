'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteBuffer, atomicWriteJson } = require('../atomicWrite');
const { resolveChildPath } = require('../library/paths');
const { isChannelId } = require('./channelAvatar');

// Artist photos are the first persisted artist data (ADR 0022):
// <library>/artists/<artistId>/photo.<ext> plus photo.json provenance.
const ARTISTS_DIRNAME = 'artists';
const PROVENANCE_FILENAME = 'photo.json';
const LEGACY_PROVENANCE_SCHEMA_VERSION = 1;
const PROVENANCE_SCHEMA_VERSION = 2;
const ARTIST_ID_RE =
  /^artist-(?:[0-9a-f]{16}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
const PHOTO_FILENAME_RE = /^photo\.(?:jpg|png|webp)$/u;
const PHOTO_EXTENSIONS = new Set(['.jpg', '.png', '.webp']);
const LEGACY_PHOTO_SOURCES = new Set(['youtube-channel', 'local-file']);
const PHOTO_SOURCES = new Set([...LEGACY_PHOTO_SOURCES, 'youtube-music']);
const YOUTUBE_MUSIC_SELECTIONS = new Set([
  'automatic-evidence',
  'user-confirmed',
]);
const MAX_LISTED_ARTISTS = 5000;

function isArtistId(value) {
  return typeof value === 'string' && ARTIST_ID_RE.test(value);
}

function resolveArtistDir(dir, artistId) {
  if (!isArtistId(artistId)) return null;
  return resolveChildPath(path.resolve(dir, ARTISTS_DIRNAME), artistId);
}

function readProvenance(artistDir) {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(artistDir, PROVENANCE_FILENAME), 'utf8'),
    );
    const isLegacy =
      data?.schemaVersion === LEGACY_PROVENANCE_SCHEMA_VERSION &&
      LEGACY_PHOTO_SOURCES.has(data.source);
    const isCurrent =
      data?.schemaVersion === PROVENANCE_SCHEMA_VERSION &&
      PHOTO_SOURCES.has(data.source);
    if (
      (!isLegacy && !isCurrent) ||
      !PHOTO_FILENAME_RE.test(data.filename) ||
      Number.isNaN(Date.parse(data.acceptedAt)) ||
      (data.source === 'youtube-channel' && !isChannelId(data.channelId)) ||
      (data.source === 'youtube-music' &&
        !YOUTUBE_MUSIC_SELECTIONS.has(data.selection))
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// Provenance and the photo file must agree; either alone is not a photo.
function readArtistPhoto(dir, artistId) {
  const artistDir = resolveArtistDir(dir, artistId);
  if (!artistDir) return null;
  const provenance = readProvenance(artistDir);
  if (!provenance) return null;
  if (!fs.existsSync(path.join(artistDir, provenance.filename))) return null;
  return {
    filename: provenance.filename,
    source: provenance.source,
    acceptedAt: provenance.acceptedAt,
  };
}

function buildArtistPhotoUrl(artistId, photo) {
  const version = Date.parse(photo.acceptedAt);
  return `utawakui-media://artist-photo/${encodeURIComponent(artistId)}/${encodeURIComponent(photo.filename)}?v=${version}`;
}

// For the media protocol: the requested filename must be the recorded photo.
function resolveArtistPhotoPath(dir, artistId, filename) {
  if (!PHOTO_FILENAME_RE.test(filename)) return null;
  const photo = readArtistPhoto(dir, artistId);
  if (!photo || photo.filename !== filename) return null;
  return path.join(resolveArtistDir(dir, artistId), photo.filename);
}

function listArtistPhotoUrls(dir) {
  const urls = new Map();
  let entries;
  try {
    entries = fs.readdirSync(path.resolve(dir, ARTISTS_DIRNAME), {
      withFileTypes: true,
    });
  } catch {
    return urls;
  }
  for (const entry of entries.slice(0, MAX_LISTED_ARTISTS)) {
    if (!entry.isDirectory() || !isArtistId(entry.name)) continue;
    const photo = readArtistPhoto(dir, entry.name);
    if (photo) urls.set(entry.name, buildArtistPhotoUrl(entry.name, photo));
  }
  return urls;
}

function writeArtistPhoto(
  dir,
  artistId,
  { buffer, extension, source, channelId, selection, now = new Date() },
) {
  const artistDir = resolveArtistDir(dir, artistId);
  if (!artistDir) throw new Error('invalid artist id');
  if (!PHOTO_EXTENSIONS.has(extension)) throw new Error('invalid photo type');
  if (!PHOTO_SOURCES.has(source)) throw new Error('invalid photo source');
  if (source === 'youtube-channel' && !isChannelId(channelId)) {
    throw new Error('invalid channel id');
  }
  if (source === 'youtube-music' && !YOUTUBE_MUSIC_SELECTIONS.has(selection)) {
    throw new Error('invalid photo selection');
  }

  fs.mkdirSync(artistDir, { recursive: true });
  const filename = `photo${extension}`;
  for (const existing of fs.readdirSync(artistDir)) {
    if (PHOTO_FILENAME_RE.test(existing) && existing !== filename) {
      fs.rmSync(path.join(artistDir, existing), { force: true });
    }
  }
  atomicWriteBuffer(path.join(artistDir, filename), buffer);
  atomicWriteJson(path.join(artistDir, PROVENANCE_FILENAME), {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    filename,
    source,
    ...(source === 'youtube-channel' ? { channelId } : {}),
    ...(source === 'youtube-music' ? { selection } : {}),
    acceptedAt: now.toISOString(),
  });
  return readArtistPhoto(dir, artistId);
}

// Removal is remembered so automatic resolution never brings the photo back;
// a later local pick replaces the marker.
function clearArtistPhoto(dir, artistId, { now = new Date() } = {}) {
  const artistDir = resolveArtistDir(dir, artistId);
  if (!artistDir) return false;
  fs.rmSync(artistDir, { recursive: true, force: true });
  fs.mkdirSync(artistDir, { recursive: true });
  atomicWriteJson(path.join(artistDir, PROVENANCE_FILENAME), {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    status: 'removed',
    removedAt: now.toISOString(),
  });
  return true;
}

function isArtistPhotoRemoved(dir, artistId) {
  const artistDir = resolveArtistDir(dir, artistId);
  if (!artistDir) return false;
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(artistDir, PROVENANCE_FILENAME), 'utf8'),
    );
    return (
      (data?.schemaVersion === LEGACY_PROVENANCE_SCHEMA_VERSION ||
        data?.schemaVersion === PROVENANCE_SCHEMA_VERSION) &&
      data.status === 'removed'
    );
  } catch {
    return false;
  }
}

function photoPromotionRank(provenance) {
  if (provenance.source === 'local-file') return 30;
  if (
    provenance.source === 'youtube-music' &&
    provenance.selection === 'user-confirmed'
  ) {
    return 20;
  }
  return 10;
}

// A stable artist entity may absorb several previously derived ids. Promote
// one bounded sidecar into the stable directory, but keep every source
// directory intact so split／undo remains lossless. Existing stable state is
// always authoritative and is never overwritten by this migration helper.
function promoteArtistPhotoState(dir, sourceArtistIds, targetArtistId) {
  if (!isArtistId(targetArtistId)) {
    return { changed: false, state: 'invalid' };
  }
  if (
    readArtistPhoto(dir, targetArtistId) ||
    isArtistPhotoRemoved(dir, targetArtistId)
  ) {
    return { changed: false, state: 'existing' };
  }

  const candidates = [];
  const removals = [];
  for (const sourceArtistId of [
    ...new Set(Array.isArray(sourceArtistIds) ? sourceArtistIds : []),
  ]) {
    if (!isArtistId(sourceArtistId) || sourceArtistId === targetArtistId)
      continue;
    const artistDir = resolveArtistDir(dir, sourceArtistId);
    const provenance = artistDir ? readProvenance(artistDir) : null;
    if (provenance) {
      const filePath = path.join(artistDir, provenance.filename);
      if (fs.existsSync(filePath)) {
        candidates.push({
          sourceArtistId,
          filePath,
          provenance,
          rank: photoPromotionRank(provenance),
          acceptedAt: Date.parse(provenance.acceptedAt),
        });
      }
      continue;
    }
    if (!artistDir || !isArtistPhotoRemoved(dir, sourceArtistId)) continue;
    try {
      const marker = JSON.parse(
        fs.readFileSync(path.join(artistDir, PROVENANCE_FILENAME), 'utf8'),
      );
      removals.push({
        sourceArtistId,
        removedAt:
          typeof marker.removedAt === 'string' &&
          !Number.isNaN(Date.parse(marker.removedAt))
            ? marker.removedAt
            : new Date(0).toISOString(),
      });
    } catch {
      // isArtistPhotoRemoved already validated the marker; a concurrent
      // deletion simply leaves this source unavailable for promotion.
    }
  }

  candidates.sort(
    (left, right) =>
      right.rank - left.rank || right.acceptedAt - left.acceptedAt,
  );
  const selected = candidates[0];
  if (selected) {
    const extension = path.extname(selected.provenance.filename).toLowerCase();
    writeArtistPhoto(dir, targetArtistId, {
      buffer: fs.readFileSync(selected.filePath),
      extension,
      source: selected.provenance.source,
      channelId: selected.provenance.channelId,
      selection: selected.provenance.selection,
      now: new Date(selected.provenance.acceptedAt),
    });
    return {
      changed: true,
      sourceArtistId: selected.sourceArtistId,
      state: 'photo',
    };
  }

  removals.sort(
    (left, right) => Date.parse(right.removedAt) - Date.parse(left.removedAt),
  );
  const removal = removals[0];
  if (removal) {
    clearArtistPhoto(dir, targetArtistId, {
      now: new Date(removal.removedAt),
    });
    return {
      changed: true,
      sourceArtistId: removal.sourceArtistId,
      state: 'removed',
    };
  }
  return { changed: false, state: 'missing' };
}

module.exports = {
  ARTISTS_DIRNAME,
  buildArtistPhotoUrl,
  clearArtistPhoto,
  isArtistId,
  isArtistPhotoRemoved,
  listArtistPhotoUrls,
  promoteArtistPhotoState,
  readArtistPhoto,
  resolveArtistPhotoPath,
  writeArtistPhoto,
};
