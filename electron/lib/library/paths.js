'use strict';

const fs = require('fs');
const path = require('path');
const {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  LYRICS_EXTENSIONS,
  TRACKS_DIRNAME,
  STRUCTURED_AUDIO_BASENAME,
  ARTWORK_BASENAME,
} = require('./constants');

// Shared gate for legacy root-level audio and structured `audio.<ext>` files.
// Asset-serving helpers apply stricter basename checks on top of this, and no
// caller accepts path separators.
function isServableFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  return AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isStructuredAudioFilename(filename) {
  if (!isServableFilename(filename)) return false;
  return (
    path.basename(filename, path.extname(filename)) ===
    STRUCTURED_AUDIO_BASENAME
  );
}

function isArtworkFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (path.basename(filename, path.extname(filename)) !== ARTWORK_BASENAME) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isLyricsSubtitleFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  const ext = path.extname(filename).toLowerCase();
  const stem = path.basename(filename, ext);
  if (!LYRICS_EXTENSIONS.has(ext)) return false;
  if (stem.length === 0 || stem === '.' || stem === '..') return false;
  return /^[A-Za-z0-9._-]+$/.test(stem);
}

function compareFilenames(a, b) {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA < lowerB) return -1;
  if (lowerA > lowerB) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function trackIdFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

function isSafeTrackId(trackId) {
  if (typeof trackId !== 'string' || trackId.length === 0) return false;
  if (trackId.includes('/') || trackId.includes('\\')) return false;
  if (trackId === '.' || trackId === '..') return false;
  if (/^[A-Za-z]:/.test(trackId)) return false;
  return !path.isAbsolute(trackId) && !path.win32.isAbsolute(trackId);
}

function resolveChildPath(root, childName) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, childName);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

function resolveTrackDir(dir, trackId) {
  if (!isSafeTrackId(trackId)) return null;
  const tracksRoot = path.resolve(dir, TRACKS_DIRNAME);
  return resolveChildPath(tracksRoot, trackId);
}

function findFirstFile(dir, predicate) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const match = entries
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => entry.name)
    .sort(compareFilenames)[0];
  return match || null;
}

function findStructuredAudioFilename(trackDir) {
  return findFirstFile(trackDir, isStructuredAudioFilename);
}

function findArtworkFilename(trackDir) {
  return findFirstFile(trackDir, isArtworkFilename);
}

function hasTrackInfo(trackDir) {
  return fs.existsSync(path.join(trackDir, 'info.json'));
}

function resolveTrackAudioPath(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir) return null;
  const audioFilename = findStructuredAudioFilename(trackDir);
  return audioFilename ? path.join(trackDir, audioFilename) : null;
}

function resolveTrackAssetPath(dir, trackId, assetFilename) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir) return null;
  if (typeof assetFilename !== 'string' || assetFilename.length === 0) {
    return null;
  }
  if (assetFilename.includes('/') || assetFilename.includes('\\')) return null;

  if (isStructuredAudioFilename(assetFilename)) {
    const audioFilename = findStructuredAudioFilename(trackDir);
    return audioFilename === assetFilename
      ? path.join(trackDir, assetFilename)
      : null;
  }

  if (isArtworkFilename(assetFilename)) {
    const artworkFilename = findArtworkFilename(trackDir);
    return artworkFilename === assetFilename
      ? path.join(trackDir, assetFilename)
      : null;
  }

  return null;
}

// Resolves a (decoded, untrusted) filename against dir, returning the
// absolute path only if it's servable and stays inside dir. path.relative
// is used instead of startsWith(dir) to avoid the classic "/foo" vs
// "/foobar" prefix-match bug.
function resolveTrackPath(dir, filename) {
  if (!isServableFilename(filename)) return null;

  const resolvedDir = path.resolve(dir);
  const filePath = path.join(resolvedDir, filename);
  const relative = path.relative(resolvedDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

module.exports = {
  isServableFilename,
  isStructuredAudioFilename,
  isArtworkFilename,
  isLyricsSubtitleFilename,
  compareFilenames,
  trackIdFromFilename,
  isSafeTrackId,
  resolveChildPath,
  resolveTrackDir,
  findFirstFile,
  findStructuredAudioFilename,
  findArtworkFilename,
  hasTrackInfo,
  resolveTrackAudioPath,
  resolveTrackAssetPath,
  resolveTrackPath,
};
