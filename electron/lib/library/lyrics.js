'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, atomicWriteText } = require('../atomicWrite');
const {
  LYRICS_DIRNAME,
  LYRICS_MANIFEST_FILENAME,
  LYRICS_MANIFEST_VERSION,
  LYRICS_EXTENSIONS,
  MANUAL_LYRICS_SOURCE_EXTENSIONS,
  TRANSLATED_SUBTITLE_TARGET_SUBTAGS,
  STRUCTURED_AUDIO_BASENAME,
} = require('./constants');
const {
  isLyricsSubtitleFilename,
  compareFilenames,
  resolveTrackDir,
} = require('./paths');
const { deleteTrackReading } = require('./lyricsReadings');
const {
  deleteTrackLyricsTiming,
  loadTrackLyricsTiming,
} = require('./lyricsTiming');

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
// (see LyricsWorkspace.vue's formatLyricsSourceLabel()), not a description
// field.
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
    .filter((source) => {
      const language =
        typeof source.language === 'string'
          ? source.language
          : inferLyricsLanguage(source.filename);
      return (
        !isAutomaticLyricsLanguage(language) &&
        !isTranslatedLyricsLanguage(language)
      );
    })
    .map((source) => {
      const label = normalizeLyricsSourceLabel(source.label);
      return {
        filename: source.filename,
        language:
          typeof source.language === 'string' && source.language.length > 0
            ? source.language
            : inferLyricsLanguage(source.filename),
        kind:
          typeof source.kind === 'string' && source.kind.length > 0
            ? source.kind
            : 'youtube-cc',
        ...(label ? { label } : {}),
      };
    })
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

// Removes the file, its manifest entry, and source-derived sidecars.
function deleteLyricsSource(trackDir, filename) {
  if (!isLyricsSubtitleFilename(filename)) return false;

  const lyricsDir = getLyricsDirFromTrackDir(trackDir);
  try {
    fs.unlinkSync(path.join(lyricsDir, filename));
  } catch {
    return false;
  }

  deleteTrackReading(trackDir, filename);
  deleteTrackLyricsTiming(trackDir, filename);

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
        // Same as above: leave it in place if locked.
      }
    }
  }

  return listTrackLyricsSources(trackDir).sources;
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
    timing: loadTrackLyricsTiming(trackDir, source.filename),
  };
}

module.exports = {
  isTranslatedLyricsLanguage,
  isAutomaticLyricsLanguage,
  extractYtDlpSubtitleLanguage,
  getTrackLyricsState,
  listTrackLyricsSources,
  saveTrackLyricsManifest,
  backfillLyricsSourceLabels,
  setLyricsSourceLabel,
  deleteLyricsSource,
  allocateLyricsFilename,
  saveTrackLyricsText,
  importManualLyricsText,
  importManualLyricsFile,
  normalizeTrackLyricsSidecars,
  resolveTrackLyricsPath,
  readTrackLyrics,
};
