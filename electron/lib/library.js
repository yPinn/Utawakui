'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const {
  atomicWriteJson,
  atomicWriteText,
  atomicWriteBuffer,
} = require('./atomicWrite');
const { VIDEO_ID_RE } = require('./youtube');

// MIME maps are the allowlist for servable media extensions.
const AUDIO_MIME_TYPES = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};
const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MIME_TYPES = { ...AUDIO_MIME_TYPES, ...IMAGE_MIME_TYPES };
const AUDIO_EXTENSIONS = new Set(Object.keys(AUDIO_MIME_TYPES));
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));

// Separation files are per-preset 4-channel WAVs:
// 0/1 instrumental L/R, 2/3 vocals L/R. usePlayer.js depends on this order.
const TRACKS_DIRNAME = 'tracks';
const DUPLICATES_DIRNAME = '.duplicates';
const LEGACY_SEPARATED_DIRNAME = '.separated';
const STRUCTURED_AUDIO_BASENAME = 'audio';
const ARTWORK_BASENAME = 'thumbnail';
// User-chosen playlist/album cover images. Lives at the download-dir root
// (sibling of tracks/), not inside tracks/<id>/, since a cover belongs to a
// playlist id, not a track id.
const PLAYLIST_COVERS_DIRNAME = 'playlist-covers';
const PLAYLIST_COVER_BASENAME = 'cover';
const LYRICS_DIRNAME = 'lyrics';
const LYRICS_MANIFEST_FILENAME = 'lyrics.json';
const LYRICS_MANIFEST_VERSION = 8;
// Per-preset files avoid overwriting audio that may be open for playback.
// manifest.json stores selectedPresetId and result metadata; it is not served.
const SEPARATIONS_DIRNAME = 'separations';
const SEPARATION_MANIFEST_FILENAME = 'manifest.json';
const SEPARATION_MANIFEST_VERSION = 1;
const LYRICS_EXTENSIONS = new Set(['.vtt', '.lrc']);
const MANUAL_LYRICS_SOURCE_EXTENSIONS = new Set(['.vtt', '.lrc', '.txt']);
const TRANSLATED_SUBTITLE_TARGET_SUBTAGS = new Set(['en', 'ja', 'ko', 'zh']);
const CONTENT_HASH_CHUNK_SIZE = 1024 * 1024;

// Interim text metadata; future playback/lyrics state belongs in SQLite.
const INDEX_FILENAME = 'library.json';
const INDEX_VERSION = 2;

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

// Manual, repeatable counterpart to migrateTrackAlbumMetadata above — not
// version-gated, so it can run again any time a user asks (e.g. after
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

function deleteTrackArtworkFiles(trackDir) {
  let entries;
  try {
    entries = fs.readdirSync(trackDir, { withFileTypes: true });
  } catch {
    return false;
  }

  let deleted = false;
  for (const entry of entries) {
    if (!entry.isFile() || !isArtworkFilename(entry.name)) continue;
    fs.rmSync(path.join(trackDir, entry.name), { force: true });
    deleted = true;
  }
  return deleted;
}

function inferLyricsLanguage(filename) {
  return path.basename(filename, path.extname(filename));
}

function isTranslatedLyricsLanguage(language) {
  if (typeof language !== 'string' || language.length === 0) return false;
  const subtags = language
    .toLowerCase()
    .split(/[._-]+/)
    .filter(Boolean);
  if (subtags.length < 2 || subtags.at(-1) === 'orig') return false;
  return subtags
    .slice(1)
    .some((subtag) => TRANSLATED_SUBTITLE_TARGET_SUBTAGS.has(subtag));
}

function isAutomaticLyricsLanguage(language) {
  const normalized = String(language || '')
    .toLowerCase()
    .replaceAll('_', '-');
  return normalized.endsWith('-orig') || normalized.endsWith('.orig');
}

function isYtDlpArtworkSidecar(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (path.basename(filename, path.extname(filename)) !== 'audio') return false;
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function extractYtDlpSubtitleLanguage(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return null;
  if (filename.includes('/') || filename.includes('\\')) return null;
  const ext = path.extname(filename).toLowerCase();
  if (!LYRICS_EXTENSIONS.has(ext)) return null;
  const stem = path.basename(filename, ext);
  if (!stem.startsWith(`${STRUCTURED_AUDIO_BASENAME}.`)) return null;
  const language = stem.slice(STRUCTURED_AUDIO_BASENAME.length + 1);
  if (isAutomaticLyricsLanguage(language)) return null;
  if (isTranslatedLyricsLanguage(language)) return null;
  return isLyricsSubtitleFilename(`${language}${ext}`) ? language : null;
}

function getLyricsDirFromTrackDir(trackDir) {
  return path.join(trackDir, LYRICS_DIRNAME);
}

function loadTrackLyricsManifest(trackDir) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(getLyricsDirFromTrackDir(trackDir), LYRICS_MANIFEST_FILENAME),
        'utf8',
      ),
    );
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !Array.isArray(manifest.sources)
    ) {
      return { checked: false, needsScan: false, sources: [] };
    }
    return {
      checked: Boolean(manifest.checked),
      needsScan: manifest.version !== LYRICS_MANIFEST_VERSION,
      sources: manifest.sources.filter(
        (source) =>
          source &&
          isLyricsSubtitleFilename(source.filename) &&
          typeof source.language === 'string',
      ),
    };
  } catch {
    return { checked: false, needsScan: false, sources: [] };
  }
}

function listTrackLyricsSources(trackDir) {
  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  let filenames;
  try {
    filenames = fs
      .readdirSync(lyricsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isLyricsSubtitleFilename(entry.name))
      .map((entry) => entry.name)
      .filter(
        (filename) =>
          !isAutomaticLyricsLanguage(inferLyricsLanguage(filename)) &&
          !isTranslatedLyricsLanguage(inferLyricsLanguage(filename)),
      )
      .sort(compareFilenames);
  } catch {
    filenames = [];
  }

  const manifest = loadTrackLyricsManifest(trackDir);
  const manifestByFilename = new Map(
    manifest.sources.map((source) => [source.filename, source]),
  );
  const sources = filenames.map((filename) => {
    const manifestSource = manifestByFilename.get(filename);
    return {
      filename,
      language: manifestSource?.language || inferLyricsLanguage(filename),
      kind: manifestSource?.kind || 'youtube-cc',
      // Optional, display-only — omitted entirely (not null/'') when unset
      // so existing shape-equality checks elsewhere are unaffected.
      ...(typeof manifestSource?.label === 'string' &&
      manifestSource.label.length > 0
        ? { label: manifestSource.label }
        : {}),
    };
  });

  return {
    checked: manifest.checked || sources.length > 0,
    needsScan: manifest.needsScan,
    sources,
  };
}

// Short by design — appended into a <select> option next to language/kind
// (see LyricsWorkspace.vue's sourceLabel()), not a description field.
const MAX_LYRICS_SOURCE_LABEL_LENGTH = 32;

function normalizeLyricsSourceLabel(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= MAX_LYRICS_SOURCE_LABEL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_LYRICS_SOURCE_LABEL_LENGTH - 1)}…`;
}

function getTrackLyricsState(trackDir) {
  const { checked, needsScan, sources } = listTrackLyricsSources(trackDir);
  return {
    status:
      sources.length > 0 ? 'available' : checked ? 'missing' : 'unchecked',
    needsScan,
    sources,
  };
}

function saveTrackLyricsManifest(trackDir, sources) {
  const normalizedSources = (Array.isArray(sources) ? sources : [])
    .filter((source) => source && isLyricsSubtitleFilename(source.filename))
    .filter(
      (source) =>
        !isAutomaticLyricsLanguage(
          typeof source.language === 'string'
            ? source.language
            : inferLyricsLanguage(source.filename),
        ) &&
        !isTranslatedLyricsLanguage(
          typeof source.language === 'string'
            ? source.language
            : inferLyricsLanguage(source.filename),
        ),
    )
    .map((source) => ({
      filename: source.filename,
      language:
        typeof source.language === 'string' && source.language.length > 0
          ? source.language
          : inferLyricsLanguage(source.filename),
      kind:
        typeof source.kind === 'string' && source.kind.length > 0
          ? source.kind
          : 'youtube-cc',
      ...(normalizeLyricsSourceLabel(source.label)
        ? { label: normalizeLyricsSourceLabel(source.label) }
        : {}),
    }))
    .sort((a, b) => compareFilenames(a.filename, b.filename));

  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  fs.mkdirSync(lyricsDir, { recursive: true });
  atomicWriteJson(path.join(lyricsDir, LYRICS_MANIFEST_FILENAME), {
    version: LYRICS_MANIFEST_VERSION,
    checked: true,
    checkedAt: new Date().toISOString(),
    sources: normalizedSources,
  });
  return normalizedSources;
}

// Matches allocateLyricsFilename's own naming (`lrclib-<id>.lrc`,
// `lrclib-<id>-2.lrc` on a collision) — the collision suffix doesn't change
// which lrclib record the file came from.
const LRCLIB_FILENAME_ID_RE = /^lrclib-(\d+)(?:-\d+)?\.lrc$/i;

function lrclibCandidateIdFromFilename(filename) {
  const match = LRCLIB_FILENAME_ID_RE.exec(filename);
  return match ? Number(match[1]) : null;
}

// One-time backfill for lrclib sources saved before the label field
// existed. resolveLabel(candidateId) is injected so this stays testable
// without a real network call.
async function backfillLyricsSourceLabels(trackDir, resolveLabel) {
  const { sources } = listTrackLyricsSources(trackDir);
  const targets = sources.filter(
    (source) =>
      source.kind === 'lrclib' &&
      !source.label &&
      lrclibCandidateIdFromFilename(source.filename) !== null,
  );
  if (targets.length === 0) return sources;

  const labelByFilename = new Map();
  for (const source of targets) {
    const candidateId = lrclibCandidateIdFromFilename(source.filename);
    let label;
    try {
      label = await resolveLabel(candidateId);
    } catch {
      // Leave unlabeled — a failed lookup for one source shouldn't stop
      // the rest of the batch.
    }
    if (typeof label === 'string' && label.length > 0) {
      labelByFilename.set(source.filename, label);
    }
  }
  if (labelByFilename.size === 0) return sources;

  const nextSources = sources.map((source) =>
    labelByFilename.has(source.filename)
      ? { ...source, label: labelByFilename.get(source.filename) }
      : source,
  );
  return saveTrackLyricsManifest(trackDir, nextSources);
}

// A blank label clears it. Returns null when filename doesn't match a
// real source (same "not found" convention as updateTrackMetadata).
function setLyricsSourceLabel(trackDir, filename, label) {
  const { sources } = listTrackLyricsSources(trackDir);
  if (!sources.some((source) => source.filename === filename)) return null;

  const normalized = normalizeLyricsSourceLabel(label);
  const nextSources = sources.map((source) => {
    if (source.filename !== filename) return source;
    if (!normalized) {
      const withoutLabel = { ...source };
      delete withoutLabel.label;
      return withoutLabel;
    }
    return { ...source, label: normalized };
  });
  return saveTrackLyricsManifest(trackDir, nextSources);
}

// Removes the file plus its manifest entry. TODO: also clean up reading
// sidecars once the reading-aid feature adds tracks/<id>/lyrics/readings/.
function deleteLyricsSource(trackDir, filename) {
  if (!isLyricsSubtitleFilename(filename)) return false;

  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  try {
    fs.unlinkSync(path.join(lyricsDir, filename));
  } catch {
    return false;
  }

  const remaining = listTrackLyricsSources(trackDir).sources.filter(
    (source) => source.filename !== filename,
  );
  saveTrackLyricsManifest(trackDir, remaining);
  return true;
}

function saveTrackLyricsText(trackDir, source, text) {
  if (
    !source ||
    !isLyricsSubtitleFilename(source.filename) ||
    typeof text !== 'string' ||
    text.trim().length === 0
  ) {
    return false;
  }

  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  fs.mkdirSync(lyricsDir, { recursive: true });
  atomicWriteText(path.join(lyricsDir, source.filename), text);

  const existingSources = listTrackLyricsSources(trackDir).sources.filter(
    (candidate) => candidate.filename !== source.filename,
  );
  saveTrackLyricsManifest(trackDir, [...existingSources, source]);
  return true;
}

// Never returns a name that already exists, so a caller of
// saveTrackLyricsText() never silently overwrites an existing source.
// baseStem must already be filename-safe — callers pass fixed stems, never
// raw user text.
function allocateLyricsFilename(trackDir, baseStem, ext) {
  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const filename =
      suffix === 1 ? `${baseStem}${ext}` : `${baseStem}-${suffix}${ext}`;
    if (!isLyricsSubtitleFilename(filename)) return null;
    if (!fs.existsSync(path.join(lyricsDir, filename))) return filename;
  }
  return null;
}

function manualLyricsStorageExtension(filenameHint) {
  const ext = path.extname(String(filenameHint || '')).toLowerCase();
  if (ext === '.vtt') return '.vtt';
  if (ext === '.lrc' || ext === '.txt' || ext === '') return '.lrc';
  return null;
}

function manualLyricsLabelFromHint(filenameHint) {
  const basename = path.basename(
    String(filenameHint || ''),
    path.extname(String(filenameHint || '')),
  );
  return normalizeLyricsSourceLabel(basename);
}

function importManualLyricsText(trackDir, options = {}) {
  const text = typeof options.text === 'string' ? options.text : '';
  if (text.trim().length === 0) return null;

  const ext = manualLyricsStorageExtension(options.filenameHint);
  if (!ext) return null;

  const filename = allocateLyricsFilename(trackDir, 'manual', ext);
  if (!filename) return null;

  const label =
    normalizeLyricsSourceLabel(options.label) ||
    manualLyricsLabelFromHint(options.filenameHint);
  const source = {
    filename,
    language: 'und',
    kind: 'manual',
    ...(label ? { label } : {}),
  };
  if (!saveTrackLyricsText(trackDir, source, text)) return null;

  const sources = getTrackLyricsState(trackDir).sources;
  return {
    source:
      sources.find((candidate) => candidate.filename === filename) || source,
    sources,
  };
}

function importManualLyricsFile(trackDir, sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) return null;
  const ext = path.extname(sourcePath).toLowerCase();
  if (!MANUAL_LYRICS_SOURCE_EXTENSIONS.has(ext)) return null;

  let text;
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
  } catch {
    return null;
  }

  return importManualLyricsText(trackDir, {
    text,
    filenameHint: path.basename(sourcePath),
    label: manualLyricsLabelFromHint(sourcePath),
  });
}

function normalizeTrackLyricsSidecars(trackDir) {
  let entries;
  try {
    entries = fs.readdirSync(trackDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sidecars = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      filename: entry.name,
      language: extractYtDlpSubtitleLanguage(entry.name),
    }))
    .filter((entry) => entry.language)
    .sort((a, b) => compareFilenames(a.filename, b.filename));

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const stem = path.basename(entry.name, ext);
    if (
      LYRICS_EXTENSIONS.has(ext) &&
      stem.startsWith(`${STRUCTURED_AUDIO_BASENAME}.`)
    ) {
      const language = stem.slice(STRUCTURED_AUDIO_BASENAME.length + 1);
      if (
        isAutomaticLyricsLanguage(language) ||
        isTranslatedLyricsLanguage(language)
      ) {
        try {
          fs.rmSync(path.join(trackDir, entry.name), { force: true });
        } catch {
          // Leave the rejected sidecar if it is temporarily locked.
        }
      }
    }
  }

  if (sidecars.length > 0) {
    const lyricsDir = getLyricsDirFromTrackDir(trackDir);
    try {
      fs.mkdirSync(lyricsDir, { recursive: true });
    } catch {
      return listTrackLyricsSources(trackDir).sources;
    }

    for (const sidecar of sidecars) {
      const targetFilename = `${sidecar.language}${path
        .extname(sidecar.filename)
        .toLowerCase()}`;
      const targetPath = path.join(lyricsDir, targetFilename);
      try {
        fs.rmSync(targetPath, { force: true });
        fs.renameSync(path.join(trackDir, sidecar.filename), targetPath);
      } catch {
        // Leave the sidecar in place if the filesystem is temporarily locked.
      }
    }
  }

  return listTrackLyricsSources(trackDir).sources;
}

function normalizeStructuredTrackSidecars(trackDir) {
  let entries;
  try {
    entries = fs.readdirSync(trackDir, { withFileTypes: true });
  } catch {
    return;
  }

  const filenames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort(compareFilenames);

  if (
    filenames.includes('audio.info.json') &&
    !filenames.includes('info.json')
  ) {
    try {
      fs.renameSync(
        path.join(trackDir, 'audio.info.json'),
        path.join(trackDir, 'info.json'),
      );
    } catch {
      // Leave the sidecar in place if the filesystem is temporarily locked.
    }
  }

  normalizeTrackLyricsSidecars(trackDir);

  if (filenames.some(isArtworkFilename)) return;

  const artworkSidecar = filenames.find(isYtDlpArtworkSidecar);
  if (!artworkSidecar) return;

  try {
    fs.renameSync(
      path.join(trackDir, artworkSidecar),
      path.join(
        trackDir,
        `${ARTWORK_BASENAME}${path.extname(artworkSidecar).toLowerCase()}`,
      ),
    );
  } catch {
    // Leave the sidecar in place if the filesystem is temporarily locked.
  }
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
  fs.copyFileSync(sourcePath, path.join(coverDir, filename));
  return filename;
}

function deletePlaylistCoverDir(dir, playlistId) {
  const coverDir = resolvePlaylistCoverDir(dir, playlistId);
  if (!coverDir) return;
  fs.rmSync(coverDir, { recursive: true, force: true });
}

const EXTENSION_BY_IMAGE_MIME_TYPE = Object.fromEntries(
  Object.entries(IMAGE_MIME_TYPES).map(([ext, mimeType]) => [mimeType, ext]),
);

// Album covers are read-only, normalized from the source's own metadata
// (see main.js's playlists:upsert-album handler) — this is the automated
// counterpart to writePlaylistCoverFile's user-picker path. Best-effort:
// any failure (network, non-2xx, unrecognized content type) just returns
// null rather than throwing, so a flaky fetch never blocks the album import
// itself, which is the part the user actually asked for.
async function writePlaylistCoverFromUrl(dir, playlistId, imageUrl) {
  if (!isSafeTrackId(playlistId)) return null;
  if (typeof imageUrl !== 'string' || imageUrl.length === 0) return null;

  try {
    const parsedUrl = new URL(imageUrl);
    // imageUrl is renderer-supplied (playlists:upsert-album); restrict to
    // https so this can't be pointed at an internal/loopback address.
    if (parsedUrl.protocol !== 'https:') return null;

    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim();
    const urlExt = path.extname(parsedUrl.pathname).toLowerCase();
    const ext =
      EXTENSION_BY_IMAGE_MIME_TYPE[contentType] ||
      (IMAGE_EXTENSIONS.has(urlExt) ? urlExt : null);
    if (!ext) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

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
  } catch {
    return null;
  }
}

function resolveTrackLyricsPath(dir, trackId, lyricsFilename) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !isLyricsSubtitleFilename(lyricsFilename)) return null;
  const { sources } = listTrackLyricsSources(trackDir);
  if (!sources.some((source) => source.filename === lyricsFilename)) {
    return null;
  }
  return path.join(trackDir, LYRICS_DIRNAME, lyricsFilename);
}

function readTrackLyrics(dir, trackId, lyricsFilename = null) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir) return null;
  const { sources } = listTrackLyricsSources(trackDir);
  const source = lyricsFilename
    ? sources.find((candidate) => candidate.filename === lyricsFilename)
    : sources[0];
  if (!source) return null;

  const lyricsPath = resolveTrackLyricsPath(dir, trackId, source.filename);
  if (!lyricsPath) return null;
  return {
    source,
    text: fs.readFileSync(lyricsPath, 'utf8'),
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

function resolveSeparationsDir(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  return trackDir ? path.join(trackDir, SEPARATIONS_DIRNAME) : null;
}

// Missing or malformed manifest (never separated yet, or a hand-edited/
// corrupted file) just means "no results" — returns the empty default
// rather than throwing, same tolerant-read pattern as
// loadTrackLyricsManifest.
function loadSeparationManifest(separationsDir) {
  const empty = {
    version: SEPARATION_MANIFEST_VERSION,
    selectedPresetId: null,
    results: {},
  };
  try {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
        'utf8',
      ),
    );
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof raw.results !== 'object' ||
      raw.results === null
    ) {
      return empty;
    }
    const results = {};
    for (const [presetId, entry] of Object.entries(raw.results)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.modelId === 'string'
      ) {
        results[presetId] = {
          modelId: entry.modelId,
          separatedAt:
            typeof entry.separatedAt === 'string'
              ? entry.separatedAt
              : undefined,
        };
      }
    }
    return {
      version: SEPARATION_MANIFEST_VERSION,
      selectedPresetId:
        typeof raw.selectedPresetId === 'string' ? raw.selectedPresetId : null,
      results,
    };
  } catch {
    return empty;
  }
}

// Called by vocalSeparation.js right after a preset's <presetId>.wav
// rename succeeds — never before, so a crash mid-write can't leave the
// manifest claiming a result that doesn't exist on disk. Producing a
// result always selects it (it's what the caller just asked to run).
function recordSeparationResult(
  separationsDir,
  { presetId, modelId, separatedAt },
) {
  const manifest = loadSeparationManifest(separationsDir);
  manifest.results[presetId] = { modelId, separatedAt };
  manifest.selectedPresetId = presetId;
  atomicWriteJson(
    path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
    manifest,
  );
}

// Switches which result plays, without touching any audio file — a cheap
// metadata write, unlike generating a result. Refuses (returns false,
// manifest untouched) if presetId has no recorded result, so callers can't
// point playback at a file that was never produced (or was produced then
// deleted out-of-band).
function selectSeparationResult(separationsDir, presetId) {
  const manifest = loadSeparationManifest(separationsDir);
  if (!manifest.results[presetId]) return false;
  manifest.selectedPresetId = presetId;
  atomicWriteJson(
    path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
    manifest,
  );
  return true;
}

function hasSeparationResultFile(separationsDir, presetId) {
  return fs.existsSync(path.join(separationsDir, `${presetId}.wav`));
}

function hasSeparation(dir, trackId) {
  const separationsDir = resolveSeparationsDir(dir, trackId);
  if (!separationsDir) return false;
  const manifest = loadSeparationManifest(separationsDir);
  return Boolean(
    manifest.selectedPresetId &&
    hasSeparationResultFile(separationsDir, manifest.selectedPresetId),
  );
}

// For the protocol handler — presetFilename is checked against a strict
// charset allowlist (not an extension check alone) before it ever touches
// the filesystem, same pattern as resolveTrackAssetPath's other branches.
function resolveSeparationResultPath(dir, trackId, presetFilename) {
  if (
    typeof presetFilename !== 'string' ||
    !/^[a-z0-9-]+\.wav$/i.test(presetFilename)
  ) {
    return null;
  }
  const separationsDir = resolveSeparationsDir(dir, trackId);
  if (!separationsDir) return null;
  const filePath = path.join(separationsDir, presetFilename);
  return fs.existsSync(filePath) ? filePath : null;
}

// Migrates a track separated under the flat tracks/<id>/stems.wav +
// separation.json design (superseded — see SEPARATIONS_DIRNAME above) into
// the per-preset layout. Tolerant of partial failure, same idiom as
// migrateLegacySeparation: keeps the legacy file if migration can't
// complete rather than losing it.
function migrateLegacyFlatSeparation(trackDir) {
  const legacyStemsPath = path.join(trackDir, 'stems.wav');
  if (!fs.existsSync(legacyStemsPath)) return;

  let presetId = 'standard';
  let modelId = 'kara2';
  let separatedAt = new Date().toISOString();
  try {
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(trackDir, 'separation.json'), 'utf8'),
    );
    if (typeof sidecar.presetId === 'string') presetId = sidecar.presetId;
    if (typeof sidecar.modelId === 'string') modelId = sidecar.modelId;
    if (typeof sidecar.separatedAt === 'string') {
      separatedAt = sidecar.separatedAt;
    }
  } catch {
    // No sidecar (or unreadable) — fall back to the standard/kara2 guess,
    // the only preset that ever existed before per-preset provenance did.
  }

  const separationsDir = path.join(trackDir, SEPARATIONS_DIRNAME);
  const targetPath = path.join(separationsDir, `${presetId}.wav`);

  try {
    fs.mkdirSync(separationsDir, { recursive: true });
    if (!fs.existsSync(targetPath)) {
      fs.renameSync(legacyStemsPath, targetPath);
    }
    const manifest = loadSeparationManifest(separationsDir);
    if (!manifest.results[presetId]) {
      manifest.results[presetId] = { modelId, separatedAt };
    }
    if (!manifest.selectedPresetId) manifest.selectedPresetId = presetId;
    atomicWriteJson(
      path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
      manifest,
    );
    fs.rmSync(path.join(trackDir, 'separation.json'), { force: true });
  } catch {
    // Keep the legacy file if migration cannot complete.
  }
}

function uniquePathForDuplicate(baseDir, filename) {
  let candidate = path.join(baseDir, filename);
  const parsed = path.parse(filename);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseDir, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
}

function migrateLegacyAudioFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const seenIds = new Set();
  const audioEntries = entries
    .filter((entry) => entry.isFile() && isServableFilename(entry.name))
    .map((entry) => entry.name)
    .sort(compareFilenames);

  for (const filename of audioEntries) {
    const trackId = trackIdFromFilename(filename);
    if (!isSafeTrackId(trackId)) continue;

    const trackDir = resolveTrackDir(dir, trackId);
    if (!trackDir) continue;

    const sourcePath = path.join(dir, filename);
    const shouldBecomeRepresentative =
      !seenIds.has(trackId) && !findStructuredAudioFilename(trackDir);
    seenIds.add(trackId);

    try {
      if (shouldBecomeRepresentative) {
        fs.mkdirSync(trackDir, { recursive: true });
        fs.renameSync(
          sourcePath,
          path.join(
            trackDir,
            `${STRUCTURED_AUDIO_BASENAME}${path.extname(filename)}`,
          ),
        );
      } else {
        const duplicateDir = path.join(dir, DUPLICATES_DIRNAME, trackId);
        fs.mkdirSync(duplicateDir, { recursive: true });
        fs.renameSync(
          sourcePath,
          uniquePathForDuplicate(duplicateDir, filename),
        );
      }
    } catch {
      // Leave legacy audio where it is if migration cannot complete.
    }
  }
}

function migrateLegacySeparation(dir) {
  const legacyRoot = path.join(dir, LEGACY_SEPARATED_DIRNAME);
  let entries;
  try {
    entries = fs.readdirSync(legacyRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeTrackId(entry.name)) continue;
    const legacyTrackDir = path.join(legacyRoot, entry.name);
    const legacyStemsPath = path.join(legacyTrackDir, 'stems.wav');
    if (!fs.existsSync(legacyStemsPath)) continue;

    const trackDir = resolveTrackDir(dir, entry.name);
    if (!trackDir || !findStructuredAudioFilename(trackDir)) continue;
    const targetPath = path.join(trackDir, 'stems.wav');

    try {
      if (!fs.existsSync(targetPath)) {
        fs.renameSync(legacyStemsPath, targetPath);
      }
      fs.rmSync(legacyTrackDir, { recursive: true, force: true });
    } catch {
      // Keep legacy stems if migration cannot complete.
    }
  }

  try {
    if (fs.readdirSync(legacyRoot).length === 0) {
      fs.rmSync(legacyRoot, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup failures
  }
}

function migrateLibrary(dir) {
  migrateLegacyAudioFiles(dir);
  migrateLegacySeparation(dir);
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
        : { selectedPresetId: null, results: {} };
      const resultCount = Object.keys(separationManifest.results).length;
      const selectedResultExists = Boolean(
        separationManifest.selectedPresetId &&
        separationsDir &&
        hasSeparationResultFile(
          separationsDir,
          separationManifest.selectedPresetId,
        ),
      );
      const metadataNeedsBackfill =
        !indexed?.title ||
        indexed?.artist === undefined ||
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
          ? `utawakui-media://track/${encodeURIComponent(id)}/separations/${encodeURIComponent(separationManifest.selectedPresetId)}.wav`
          : undefined,
        separation:
          resultCount > 0
            ? {
                selectedPresetId: separationManifest.selectedPresetId,
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
  });

  return listTracks(dir).find((track) => track.id === trackId) || null;
}

function writeTrackArtworkFile(dir, trackId, sourcePath) {
  if (!findTrackRecord(dir, trackId)) return null;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return null;

  if (typeof sourcePath !== 'string' || sourcePath.length === 0) return null;
  const ext = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  fs.mkdirSync(trackDir, { recursive: true });
  const filename = `${ARTWORK_BASENAME}${ext}`;
  for (const entry of fs.readdirSync(trackDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      isArtworkFilename(entry.name) &&
      entry.name !== filename
    ) {
      fs.rmSync(path.join(trackDir, entry.name), { force: true });
    }
  }
  fs.copyFileSync(sourcePath, path.join(trackDir, filename));
  return filename;
}

function deleteTrackArtworkFile(dir, trackId) {
  if (!findTrackRecord(dir, trackId)) return false;
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir || !resolveTrackAudioPath(dir, trackId)) return false;
  return deleteTrackArtworkFiles(trackDir);
}

// Deletes the original audio file, its vocal-separation output (if any),
// and its library.json entry. Returns false without touching anything if
// trackId doesn't resolve to a real file — the filesystem enumeration is
// what listTracks() itself trusts (see the file-level comment above), so
// this is the same check used to decide whether there's anything to delete.
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

let backfillInProgress = false;
// Session-only failure memory (not persisted) — resets on restart, so a
// permanently dead video gets retried once per launch.
const backfillFailedIds = new Set();

// fetchMetadata is injected so this module stays yt-dlp-agnostic. Resolves
// to whether anything changed; only one pass runs at a time.
function notifyBackfillStatus(onStatus, payload) {
  if (typeof onStatus !== 'function') return;
  onStatus(payload);
}

async function runBackfillPass(dir, tracks, fetchMetadata, onStatus = null) {
  if (backfillInProgress) {
    notifyBackfillStatus(onStatus, {
      stage: 'running',
      isRunning: true,
    });
    return false;
  }

  const candidates = tracks.filter(
    (track) =>
      VIDEO_ID_RE.test(track.id) &&
      track.needsBackfill &&
      !backfillFailedIds.has(track.id),
  );
  if (candidates.length === 0) {
    notifyBackfillStatus(onStatus, {
      stage: 'idle',
      isRunning: false,
      total: 0,
      completed: 0,
    });
    return false;
  }

  backfillInProgress = true;
  let updated = false;
  let completed = 0;
  try {
    notifyBackfillStatus(onStatus, {
      stage: 'start',
      isRunning: true,
      total: candidates.length,
      completed,
    });
    for (const track of candidates) {
      const trackDir = resolveTrackDir(dir, track.id);
      notifyBackfillStatus(onStatus, {
        stage: 'track',
        isRunning: true,
        total: candidates.length,
        completed,
        trackId: track.id,
        title: track.title,
      });
      const result = await fetchMetadata(track.id, trackDir);
      completed += 1;
      if (!result || (!result.title && !result.assetsUpdated)) {
        backfillFailedIds.add(track.id);
        notifyBackfillStatus(onStatus, {
          stage: 'progress',
          isRunning: true,
          total: candidates.length,
          completed,
          trackId: track.id,
          title: track.title,
          updated: false,
        });
        continue;
      }
      const metadata = { ...result };
      delete metadata.assetsUpdated;
      try {
        if (metadata.title) {
          // Re-read fresh: a manual edit may have landed on this track
          // while the fetch above was in flight — don't clobber it.
          const currentEntry = loadIndex(dir).tracks[track.id];
          const toWrite = { ...metadata };
          if (currentEntry?.title) delete toWrite.title;
          if (currentEntry?.artist) delete toWrite.artist;
          if (Object.keys(toWrite).length > 0) {
            saveIndexEntry(dir, track.id, toWrite);
          }
        }
        updated = true;
      } catch {
        // Leave needsBackfill true (don't add to backfillFailedIds) so a
        // transient write failure gets retried on the next pass instead
        // of silently dropping this track's metadata for the session.
      }
      notifyBackfillStatus(onStatus, {
        stage: 'progress',
        isRunning: true,
        total: candidates.length,
        completed,
        trackId: track.id,
        title: metadata.title || track.title,
        updated: Boolean(result.title || result.assetsUpdated),
      });
    }
  } finally {
    backfillInProgress = false;
    notifyBackfillStatus(onStatus, {
      stage: 'done',
      isRunning: false,
      total: candidates.length,
      completed,
      updated,
    });
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
      if (match[1] === '') {
        const suffixLength = Number(match[2]);
        start = Math.max(stat.size - suffixLength, 0);
      } else {
        start = Number(match[1]);
        if (match[2] !== '') end = Math.min(Number(match[2]), stat.size - 1);
      }
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
  allocateLyricsFilename,
  backfillLyricsSourceLabels,
  buildRangeResponse,
  deleteLyricsSource,
  deleteTrack,
  deleteTrackArtworkFile,
  hasSeparation,
  hasSeparationResultFile,
  INDEX_FILENAME,
  isArtworkFilename,
  isAutomaticLyricsLanguage,
  isLyricsSubtitleFilename,
  isTranslatedLyricsLanguage,
  isServableFilename,
  isStructuredAudioFilename,
  importManualLyricsFile,
  importManualLyricsText,
  importLocalAudioFiles,
  LYRICS_MANIFEST_VERSION,
  getTrackLyricsState,
  listTracks,
  loadIndex,
  loadSeparationManifest,
  migrateTrackAlbumMetadata,
  normalizeTrackLyricsSidecars,
  readTrackLyrics,
  recordSeparationResult,
  deletePlaylistCoverDir,
  refreshTrackMetadataFromSidecars,
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  writeTrackArtworkFile,
  resolveTrackLyricsPath,
  resolveSeparationsDir,
  resolveSeparationResultPath,
  resolveTrackAssetPath,
  resolveTrackAudioPath,
  resolveTrackDir,
  resolveTrackPath,
  runBackfillPass,
  saveIndexEntry,
  saveTrackLyricsManifest,
  saveTrackLyricsText,
  selectSeparationResult,
  setLyricsSourceLabel,
  updateTrackMetadata,
};
