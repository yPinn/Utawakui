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
const PROVENANCE_SCHEMA_VERSION = 1;
const ARTIST_ID_RE = /^artist-[0-9a-f]{16}$/u;
const PHOTO_FILENAME_RE = /^photo\.(?:jpg|png|webp)$/u;
const PHOTO_EXTENSIONS = new Set(['.jpg', '.png', '.webp']);
const PHOTO_SOURCES = new Set(['youtube-channel', 'local-file']);
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
    if (
      data?.schemaVersion !== PROVENANCE_SCHEMA_VERSION ||
      !PHOTO_FILENAME_RE.test(data.filename) ||
      !PHOTO_SOURCES.has(data.source) ||
      Number.isNaN(Date.parse(data.acceptedAt))
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
  { buffer, extension, source, channelId, now = new Date() },
) {
  const artistDir = resolveArtistDir(dir, artistId);
  if (!artistDir) throw new Error('invalid artist id');
  if (!PHOTO_EXTENSIONS.has(extension)) throw new Error('invalid photo type');
  if (!PHOTO_SOURCES.has(source)) throw new Error('invalid photo source');
  if (source === 'youtube-channel' && !isChannelId(channelId)) {
    throw new Error('invalid channel id');
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
      data?.schemaVersion === PROVENANCE_SCHEMA_VERSION &&
      data.status === 'removed'
    );
  } catch {
    return false;
  }
}

module.exports = {
  ARTISTS_DIRNAME,
  buildArtistPhotoUrl,
  clearArtistPhoto,
  isArtistId,
  isArtistPhotoRemoved,
  listArtistPhotoUrls,
  readArtistPhoto,
  resolveArtistPhotoPath,
  writeArtistPhoto,
};
