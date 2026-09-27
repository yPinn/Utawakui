'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteBuffer, atomicCopyFileSync } = require('../atomicWrite');
const {
  IMAGE_EXTENSIONS,
  EXTENSION_BY_IMAGE_MIME_TYPE,
  PLAYLIST_COVERS_DIRNAME,
  PLAYLIST_COVER_BASENAME,
} = require('./constants');
const { isSafeTrackId, resolveChildPath, findFirstFile } = require('./paths');

// writePlaylistCoverFromUrl's imageUrl is renderer-supplied — restricting
// to https (below) keeps it off file:/loopback addresses, but a renderer
// compromise could still point the main process at an arbitrary HTTPS host.
// The only legitimate caller is playlists:upsert-album with a thumbnailUrl
// yt-dlp/fetchPlaylist just returned from YouTube's own playlist metadata,
// so restrict to the hosts YouTube actually serves thumbnails from.
const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'i.ytimg.com',
  'i9.ytimg.com',
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
]);
const DEFAULT_PLAYLIST_COVER_TIMEOUT_MS = 15_000;
const MAX_PLAYLIST_COVER_BYTES = 10 * 1024 * 1024;

function isPlaylistCoverFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (
    path.basename(filename, path.extname(filename)) !== PLAYLIST_COVER_BASENAME
  ) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// playlistId is always a crypto.randomUUID() from playlists.js, but validated
// the same way as a trackId anyway — isSafeTrackId is a generic path-safety
// check, not YouTube-id-specific.
function resolvePlaylistCoverDir(dir, playlistId) {
  if (!isSafeTrackId(playlistId)) return null;
  const coversRoot = path.resolve(dir, PLAYLIST_COVERS_DIRNAME);
  return resolveChildPath(coversRoot, playlistId);
}

function findPlaylistCoverFilename(coverDir) {
  return findFirstFile(coverDir, isPlaylistCoverFilename);
}

// For the protocol handler — mirrors resolveTrackAssetPath's artwork branch:
// the requested filename must match whatever cover file actually exists on
// disk, not just look like a valid cover filename.
function resolvePlaylistCoverPath(dir, playlistId, coverFilename) {
  const coverDir = resolvePlaylistCoverDir(dir, playlistId);
  if (!coverDir || !isPlaylistCoverFilename(coverFilename)) return null;
  const actual = findPlaylistCoverFilename(coverDir);
  return actual === coverFilename ? path.join(coverDir, actual) : null;
}

// Copies a user-picked image into playlist-covers/<id>/cover.<ext>, replacing
// any previous cover file first — including one with a different extension,
// since the user may switch from a .png to a .jpg. Returns the new cover's
// bare filename (for playlists.js to persist), or null if sourcePath isn't a
// recognized image extension.
function writePlaylistCoverFile(dir, playlistId, sourcePath) {
  if (!isSafeTrackId(playlistId)) return null;
  const ext = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const coverDir = path.resolve(dir, PLAYLIST_COVERS_DIRNAME, playlistId);
  fs.mkdirSync(coverDir, { recursive: true });

  const existing = findPlaylistCoverFilename(coverDir);
  const filename = `${PLAYLIST_COVER_BASENAME}${ext}`;
  if (existing && existing !== filename) {
    fs.rmSync(path.join(coverDir, existing), { force: true });
  }
  atomicCopyFileSync(sourcePath, path.join(coverDir, filename));
  return filename;
}

function deletePlaylistCoverDir(dir, playlistId) {
  const coverDir = resolvePlaylistCoverDir(dir, playlistId);
  if (!coverDir) return;
  fs.rmSync(coverDir, { recursive: true, force: true });
}

// Album covers are read-only, normalized from the source's own metadata
// (see main.js's playlists:upsert-album handler) — this is the automated
// counterpart to writePlaylistCoverFile's user-picker path. Best-effort:
// any failure (network, non-2xx, unrecognized content type) just returns
// null rather than throwing, so a flaky fetch never blocks the album import
// itself, which is the part the user actually asked for.
async function writePlaylistCoverFromUrl(
  dir,
  playlistId,
  imageUrl,
  options = {},
) {
  if (!isSafeTrackId(playlistId)) return null;
  if (typeof imageUrl !== 'string' || imageUrl.length === 0) return null;

  try {
    const parsedUrl = new URL(imageUrl);
    // imageUrl is renderer-supplied (playlists:upsert-album); restrict to
    // https so this can't be pointed at an internal/loopback address, and
    // to a known YouTube thumbnail host so it can't be pointed at an
    // arbitrary HTTPS host — see ALLOWED_THUMBNAIL_HOSTS above.
    if (parsedUrl.protocol !== 'https:') return null;
    if (!ALLOWED_THUMBNAIL_HOSTS.has(parsedUrl.hostname)) return null;

    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs =
      Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_PLAYLIST_COVER_TIMEOUT_MS;
    const controller = new AbortController();
    let rejectDeadline;
    const deadline = new Promise((_, reject) => {
      rejectDeadline = reject;
    });
    const timeout = setTimeout(() => {
      const error = Object.assign(new Error('playlist cover timed out'), {
        name: 'TimeoutError',
      });
      controller.abort(error);
      rejectDeadline(error);
    }, timeoutMs);
    timeout.unref?.();

    try {
      const response = await Promise.race([
        fetchImpl(imageUrl, { signal: controller.signal }),
        deadline,
      ]);
      if (!response.ok) return null;

      const declaredLength = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_PLAYLIST_COVER_BYTES
      ) {
        await response.body?.cancel?.().catch(() => undefined);
        return null;
      }

      const contentType = response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim();
      const urlExt = path.extname(parsedUrl.pathname).toLowerCase();
      const ext =
        EXTENSION_BY_IMAGE_MIME_TYPE[contentType] ||
        (IMAGE_EXTENSIONS.has(urlExt) ? urlExt : null);
      if (!ext) return null;

      const buffer = Buffer.from(
        await Promise.race([response.arrayBuffer(), deadline]),
      );
      if (buffer.length > MAX_PLAYLIST_COVER_BYTES) return null;

      const coverDir = path.resolve(dir, PLAYLIST_COVERS_DIRNAME, playlistId);
      fs.mkdirSync(coverDir, { recursive: true });

      const existing = findPlaylistCoverFilename(coverDir);
      const filename = `${PLAYLIST_COVER_BASENAME}${ext}`;
      if (existing && existing !== filename) {
        fs.rmSync(path.join(coverDir, existing), { force: true });
      }
      const targetPath = path.join(coverDir, filename);
      atomicWriteBuffer(targetPath, buffer);
      return filename;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

module.exports = {
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  deletePlaylistCoverDir,
};
