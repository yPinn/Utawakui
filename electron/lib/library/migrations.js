'use strict';

// No dedicated test file: this module's migration behavior is asserted
// through listTracks()'s output in tracks.test.js (integration tests),
// not through these functions directly.

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const {
  IMAGE_EXTENSIONS,
  DUPLICATES_DIRNAME,
  LEGACY_SEPARATED_DIRNAME,
  STRUCTURED_AUDIO_BASENAME,
  ARTWORK_BASENAME,
  SEPARATIONS_DIRNAME,
  SEPARATION_MANIFEST_FILENAME,
} = require('./constants');
const {
  isServableFilename,
  isArtworkFilename,
  compareFilenames,
  trackIdFromFilename,
  isSafeTrackId,
  resolveTrackDir,
  findStructuredAudioFilename,
} = require('./paths');
const { normalizeTrackLyricsSidecars } = require('./lyrics');
const { loadSeparationManifest } = require('./separationManifest');

function isYtDlpArtworkSidecar(filename) {
  if (typeof filename !== 'string' || filename.length === 0) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (
    path.basename(filename, path.extname(filename)) !==
    STRUCTURED_AUDIO_BASENAME
  ) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
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
    // Same as above: leave it in place if locked.
  }
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
    const recipeId =
      presetId === 'standard'
        ? 'quick'
        : presetId === 'inst-hq3' || presetId === 'clean'
          ? 'general'
          : presetId === 'recording-enhanced'
            ? 'refined'
            : presetId;
    if (!manifest.results[recipeId]) {
      const profileId =
        recipeId === 'quick' && modelId === 'kara2'
          ? 'mdx-kara2-v1'
          : recipeId === 'general' && modelId === 'inst-hq3'
            ? 'mdx-inst-hq3-v1'
            : recipeId === 'high-quality' && modelId === 'kara2'
              ? 'mdx-kara2-denoise-v1'
              : null;
      manifest.results[recipeId] = {
        recipeVersion: 1,
        engineId: 'onnx-mdx',
        ...(profileId ? { profileId } : {}),
        modelIds: [modelId],
        artifactFilename: `${presetId}.wav`,
        completedAt: separatedAt,
        outputLayout: 'accompaniment-guide-4ch',
        ...(presetId !== 'standard' && presetId !== 'inst-hq3'
          ? { legacy: true }
          : {}),
      };
    }
    if (!manifest.selectedRecipeId) manifest.selectedRecipeId = recipeId;
    atomicWriteJson(
      path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
      manifest,
    );
    fs.rmSync(path.join(trackDir, 'separation.json'), { force: true });
  } catch {
    // Partial-failure idiom documented above.
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
      // Partial-failure idiom documented above.
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

module.exports = {
  normalizeStructuredTrackSidecars,
  migrateLegacyFlatSeparation,
  migrateLibrary,
};
