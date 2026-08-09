'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { atomicWriteJson } = require('./atomicWrite');
const { VIDEO_ID_RE } = require('./youtube');

// Single source of truth for "what's a servable audio file" — also the
// Content-Type used when serving it (see buildRangeResponse). Derived as
// a Set below rather than duplicating the extension list separately.
const MIME_TYPES = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};
const AUDIO_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

// Vocal-separation output lives in its own subdirectory — listTracks()'s
// isFile() filter already skips it, no enumeration change needed. A single
// 4-channel stems.wav, not separate files: vocalSeparation.js writes
// channels in a FIXED order (0/1 instrumental L/R, 2/3 vocals L/R) that
// usePlayer.js's ChannelSplitter routing depends on — changing one side
// without the other silently swaps instrumental and vocals.
const SEPARATED_DIRNAME = '.separated';
const SEPARATED_VARIANTS = new Set(['stems.wav']);

// Interim, text-only metadata store — deliberately not the future SQLite
// index (pitch/tempo, lyrics offset). Lives inside the download dir so it
// travels with the tracks when the user changes download folder.
const INDEX_FILENAME = 'library.json';
const INDEX_VERSION = 1;

// The filesystem is the sole source of truth for which tracks exist — this
// index is enrichment only, and tolerates a missing/corrupt file (degrades
// to empty rather than throwing). Orphaned entries are harmless — never
// looked up — so no cleanup pass is needed.
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

// Merges a single track's metadata into the index and writes atomically —
// avoids a half-written index surviving a crash mid-download.
function saveIndexEntry(dir, id, entry) {
  const index = loadIndex(dir);
  index.tracks[id] = { ...index.tracks[id], ...entry };
  atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  return index;
}

// Shared gate between the protocol handler and listTracks: the handler must
// never be able to serve anything listTracks couldn't have returned. Flat
// namespace only — no path separators — since tracks live directly in the
// resolved download dir, not in subfolders.
function isServableFilename(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  return AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase());
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

// trackId is untrusted IPC input — checked against the .separated ROOT
// specifically, not just `dir`: a trackId of "../evil" resolves to
// <dir>/evil, which is technically still inside `dir` and would wrongly
// pass a check that only verified containment within `dir` itself.
function resolveSeparatedDir(dir, trackId) {
  if (typeof trackId !== 'string' || trackId.length === 0) return null;

  const separatedRoot = path.resolve(dir, SEPARATED_DIRNAME);
  const separatedDir = path.resolve(separatedRoot, trackId);
  const relative = path.relative(separatedRoot, separatedDir);

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return separatedDir;
}

// For the protocol handler — variantFilename is checked against the fixed
// SEPARATED_VARIANTS allowlist (not an extension check) before it ever
// touches the filesystem.
function resolveSeparatedFilePath(dir, trackId, variantFilename) {
  if (!SEPARATED_VARIANTS.has(variantFilename)) return null;
  const separatedDir = resolveSeparatedDir(dir, trackId);
  if (!separatedDir) return null;
  return path.join(separatedDir, variantFilename);
}

function hasSeparation(dir, trackId) {
  const separatedDir = resolveSeparatedDir(dir, trackId);
  if (!separatedDir) return false;
  return [...SEPARATED_VARIANTS].every((variant) =>
    fs.existsSync(path.join(separatedDir, variant)),
  );
}

function listTracks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const index = loadIndex(dir);

  const seenIds = new Set();

  return entries
    .filter((entry) => entry.isFile() && isServableFilename(entry.name))
    .sort((a, b) => compareFilenames(a.name, b.name))
    .filter((entry) => {
      const id = trackIdFromFilename(entry.name);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .map((entry) => {
      const id = trackIdFromFilename(entry.name);
      const indexed = index.tracks[id];
      // Existence-checked directly against the filesystem, same as the
      // track enumeration itself — not tracked in library.json, which
      // stays pure metadata (see the file-level comment above).
      const separated = hasSeparation(dir, id);
      return {
        id,
        filename: entry.name,
        url: `utawakui-media://local/${encodeURIComponent(entry.name)}`,
        // Falls back to the id (filename stem) — covers both a failed/
        // missing index write and a locally imported file with an
        // already-meaningful filename.
        title: indexed?.title || id,
        // No fallback — undefined when absent, renderer just omits it.
        artist: indexed?.artist,
        duration: indexed?.duration,
        // From the raw index lookup, before the title fallback above — a
        // real title could coincidentally equal the id, which shouldn't
        // also suppress a backfill retry.
        needsBackfill:
          !indexed?.title ||
          indexed?.artist === undefined ||
          indexed?.duration === undefined,
        hasSeparation: separated,
        // 4-channel file — see SEPARATED_VARIANTS's comment above for the
        // fixed channel order the player relies on.
        stemsUrl: separated
          ? `utawakui-media://separated/${encodeURIComponent(id)}/stems.wav`
          : undefined,
      };
    })
    .sort(compareTracks);
}

// trackId is the filename stem — the extension isn't known ahead of time
// (mp3/webm/m4a/etc.), so this scans dir the same way listTracks() does
// rather than trying each extension.
function findTrackFilename(dir, trackId) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const match = entries
    .filter((entry) => entry.isFile() && isServableFilename(entry.name))
    .sort((a, b) => compareFilenames(a.name, b.name))
    .find((entry) => trackIdFromFilename(entry.name) === trackId);
  return match ? match.name : null;
}

// Deletes the original audio file, its vocal-separation output (if any),
// and its library.json entry. Returns false without touching anything if
// trackId doesn't resolve to a real file — the filesystem enumeration is
// what listTracks() itself trusts (see the file-level comment above), so
// this is the same check used to decide whether there's anything to delete.
function deleteTrack(dir, trackId) {
  const filename = findTrackFilename(dir, trackId);
  if (!filename) return false;

  const filePath = resolveTrackPath(dir, filename);
  if (!filePath) return false;
  fs.unlinkSync(filePath);

  const separatedDir = resolveSeparatedDir(dir, trackId);
  if (separatedDir) {
    fs.rmSync(separatedDir, { recursive: true, force: true });
  }

  const index = loadIndex(dir);
  if (trackId in index.tracks) {
    delete index.tracks[trackId];
    atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  }

  return true;
}

let backfillInProgress = false;
// Session-only failure memory (not persisted) — resets on restart, so a
// permanently dead video gets retried once per launch.
const backfillFailedIds = new Set();

// fetchMetadata is injected so this module stays yt-dlp-agnostic. Resolves
// to whether anything changed; only one pass runs at a time.
async function runBackfillPass(dir, tracks, fetchMetadata) {
  if (backfillInProgress) return false;

  const candidates = tracks.filter(
    (track) =>
      VIDEO_ID_RE.test(track.id) &&
      track.needsBackfill &&
      !backfillFailedIds.has(track.id),
  );
  if (candidates.length === 0) return false;

  backfillInProgress = true;
  let updated = false;
  try {
    for (const track of candidates) {
      const metadata = await fetchMetadata(track.id);
      if (!metadata || !metadata.title) {
        backfillFailedIds.add(track.id);
        continue;
      }
      try {
        saveIndexEntry(dir, track.id, metadata);
        updated = true;
      } catch {
        // Leave needsBackfill true (don't add to backfillFailedIds) so a
        // transient write failure gets retried on the next pass instead
        // of silently dropping this track's metadata for the session.
      }
    }
  } finally {
    backfillInProgress = false;
  }

  return updated;
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

// Real HTTP Range/206 support — net.fetch(pathToFileURL(...)) looks like it
// should provide this but doesn't: given a Range header it silently slices
// the body yet still returns 200 with no Content-Range, which <audio> reads
// as "the whole file is this short" (every seek jumped back to 0). Verified
// byte-for-byte against fs.readFileSync of the same range — don't revert to
// net.fetch(file://...) without re-verifying.
function buildRangeResponse(filePath, rangeHeader) {
  const stat = fs.statSync(filePath);
  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match && (match[1] !== '' || match[2] !== '')) {
      if (match[1] !== '') start = Number(match[1]);
      if (match[2] !== '') end = Math.min(Number(match[2]), stat.size - 1);
      status = 206;
    }
  }

  const stream = fs.createReadStream(filePath, { start, end });
  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()],
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
  };
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }

  return new Response(Readable.toWeb(stream), { status, headers });
}

module.exports = {
  buildRangeResponse,
  deleteTrack,
  hasSeparation,
  INDEX_FILENAME,
  isServableFilename,
  listTracks,
  loadIndex,
  resolveSeparatedDir,
  resolveSeparatedFilePath,
  resolveTrackPath,
  runBackfillPass,
  saveIndexEntry,
};
