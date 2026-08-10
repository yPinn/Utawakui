'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { atomicWriteJson } = require('./atomicWrite');
const { VIDEO_ID_RE } = require('./youtube');

// Single source of truth for "what's a servable audio file" — also the
// Content-Type used when serving it (see buildRangeResponse). Derived as
// a Set below rather than duplicating the extension list separately.
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

// Vocal-separation output lives in its own subdirectory — listTracks()'s
// isFile() filter already skips it, no enumeration change needed. A single
// 4-channel stems.wav, not separate files: vocalSeparation.js writes
// channels in a FIXED order (0/1 instrumental L/R, 2/3 vocals L/R) that
// usePlayer.js's ChannelSplitter routing depends on — changing one side
// without the other silently swaps instrumental and vocals.
const TRACKS_DIRNAME = 'tracks';
const DUPLICATES_DIRNAME = '.duplicates';
const LEGACY_SEPARATED_DIRNAME = '.separated';
const STRUCTURED_AUDIO_BASENAME = 'audio';
const ARTWORK_BASENAME = 'thumbnail';
const LYRICS_DIRNAME = 'lyrics';
const LYRICS_MANIFEST_FILENAME = 'lyrics.json';
const LYRICS_MANIFEST_VERSION = 6;
const SEPARATED_VARIANTS = new Set(['stems.wav']);
const LYRICS_EXTENSIONS = new Set(['.vtt']);
const TRANSLATED_SUBTITLE_TARGET_SUBTAGS = new Set(['en', 'ja', 'ko', 'zh']);

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
    };
  });

  return {
    checked: manifest.checked || sources.length > 0,
    needsScan: manifest.needsScan,
    sources,
  };
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

  if (SEPARATED_VARIANTS.has(assetFilename)) {
    return path.join(trackDir, assetFilename);
  }

  return null;
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

// Backward-compatible name for callers that still think in "separation
// output dir" terms. In the structured layout, stems.wav lives directly in
// the track directory alongside audio/artwork/source metadata.
function resolveSeparatedDir(dir, trackId) {
  return resolveTrackDir(dir, trackId);
}

// For the protocol handler — variantFilename is checked against the fixed
// SEPARATED_VARIANTS allowlist (not an extension check) before it ever
// touches the filesystem.
function resolveSeparatedFilePath(dir, trackId, variantFilename) {
  if (!SEPARATED_VARIANTS.has(variantFilename)) return null;
  return resolveTrackAssetPath(dir, trackId, variantFilename);
}

function hasSeparation(dir, trackId) {
  const separatedDir = resolveSeparatedDir(dir, trackId);
  if (!separatedDir) return false;
  return [...SEPARATED_VARIANTS].every((variant) =>
    fs.existsSync(path.join(separatedDir, variant)),
  );
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
      const separated = hasSeparation(dir, id);
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
        needsBackfill: metadataNeedsBackfill || assetNeedsBackfill,
        hasSeparation: separated,
        stemsUrl: separated
          ? `utawakui-media://track/${encodeURIComponent(id)}/stems.wav`
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
          saveIndexEntry(dir, track.id, metadata);
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
  isArtworkFilename,
  isAutomaticLyricsLanguage,
  isLyricsSubtitleFilename,
  isTranslatedLyricsLanguage,
  isServableFilename,
  isStructuredAudioFilename,
  LYRICS_MANIFEST_VERSION,
  listTracks,
  loadIndex,
  normalizeTrackLyricsSidecars,
  readTrackLyrics,
  resolveTrackLyricsPath,
  resolveSeparatedDir,
  resolveSeparatedFilePath,
  resolveTrackAssetPath,
  resolveTrackAudioPath,
  resolveTrackDir,
  resolveTrackPath,
  runBackfillPass,
  saveIndexEntry,
  saveTrackLyricsManifest,
};
