'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const {
  SEPARATIONS_DIRNAME,
  SEPARATION_MANIFEST_FILENAME,
  SEPARATION_MANIFEST_VERSION,
} = require('./constants');
const { resolveTrackDir } = require('./paths');

const OUTPUT_LAYOUT = 'accompaniment-guide-4ch';
const BACKING_VOCAL_POLICIES = new Set(['mixed-into-accompaniment']);
const SAFE_RECIPE_ID_RE = /^[a-z0-9-]+$/i;
const SAFE_PROFILE_ID_RE = /^[a-z0-9-]+$/i;
const SAFE_ARTIFACT_FILENAME_RE = /^[a-z0-9-]+\.wav$/i;
const recipeCatalog = require('../../../shared/audioProcessingRecipes.json');
const RESULT_RECIPE_ALIASES = Object.freeze({
  ...(recipeCatalog.resultAliases || {}),
});

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
    selectedRecipeId: null,
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
    const isV2 = raw.version === SEPARATION_MANIFEST_VERSION;
    const results = isV2
      ? normalizeV2Results(raw.results)
      : normalizeLegacyResults(raw.results);
    const rawSelectedId = canonicalizeResultRecipeId(
      isV2 ? raw.selectedRecipeId : raw.selectedPresetId,
    );
    const selectedRecipeId =
      typeof rawSelectedId === 'string' && results[rawSelectedId]
        ? rawSelectedId
        : null;
    return {
      version: SEPARATION_MANIFEST_VERSION,
      selectedRecipeId,
      results,
    };
  } catch {
    return empty;
  }
}

function canonicalizeResultRecipeId(recipeId) {
  return typeof recipeId === 'string'
    ? RESULT_RECIPE_ALIASES[recipeId] || recipeId
    : recipeId;
}

function inferKnownProfileId(recipeId, modelIds) {
  if (recipeId === 'quick' && modelIds.includes('kara2')) {
    return 'mdx-kara2-v1';
  }
  if (recipeId === 'general' && modelIds.includes('inst-hq3')) {
    return 'mdx-inst-hq3-v1';
  }
  if (recipeId === 'high-quality' && modelIds.includes('kara2')) {
    return 'mdx-kara2-denoise-v1';
  }
  return null;
}

function normalizeV2Results(rawResults) {
  const results = {};
  for (const [rawRecipeId, entry] of Object.entries(rawResults)) {
    const recipeId = canonicalizeResultRecipeId(rawRecipeId);
    const normalized = normalizeV2Entry(recipeId, entry);
    if (!normalized) continue;
    // If a transitional manifest contains both an alias and its canonical id,
    // the canonical entry wins regardless of object key order.
    if (results[recipeId] && rawRecipeId !== recipeId) continue;
    results[recipeId] = normalized;
  }
  return results;
}

function normalizeV2Entry(recipeId, entry) {
  if (
    !SAFE_RECIPE_ID_RE.test(recipeId) ||
    !entry ||
    typeof entry !== 'object' ||
    !Number.isInteger(entry.recipeVersion) ||
    entry.recipeVersion < 1 ||
    typeof entry.engineId !== 'string' ||
    !Array.isArray(entry.modelIds) ||
    entry.modelIds.length === 0 ||
    !entry.modelIds.every((modelId) => typeof modelId === 'string') ||
    !SAFE_ARTIFACT_FILENAME_RE.test(entry.artifactFilename) ||
    typeof entry.completedAt !== 'string' ||
    entry.outputLayout !== OUTPUT_LAYOUT
  ) {
    return null;
  }

  const profileId =
    typeof entry.profileId === 'string' &&
    SAFE_PROFILE_ID_RE.test(entry.profileId)
      ? entry.profileId
      : inferKnownProfileId(recipeId, entry.modelIds);

  return {
    recipeVersion: entry.recipeVersion,
    engineId: entry.engineId,
    ...(profileId ? { profileId } : {}),
    modelIds: [...entry.modelIds],
    artifactFilename: entry.artifactFilename,
    completedAt: entry.completedAt,
    outputLayout: entry.outputLayout,
    ...(BACKING_VOCAL_POLICIES.has(entry.backingVocalPolicy)
      ? { backingVocalPolicy: entry.backingVocalPolicy }
      : {}),
    ...(entry.legacy === true ? { legacy: true } : {}),
  };
}

function normalizeLegacyResults(rawResults) {
  const results = {};
  for (const [presetId, entry] of Object.entries(rawResults)) {
    if (
      !SAFE_RECIPE_ID_RE.test(presetId) ||
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.modelId !== 'string'
    ) {
      continue;
    }

    const recipeId = canonicalizeResultRecipeId(presetId);
    const profileId = inferKnownProfileId(recipeId, [entry.modelId]);
    results[recipeId] = {
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      ...(profileId ? { profileId } : {}),
      modelIds: [entry.modelId],
      artifactFilename: `${presetId}.wav`,
      completedAt:
        typeof entry.separatedAt === 'string' ? entry.separatedAt : '',
      outputLayout: OUTPUT_LAYOUT,
      ...(presetId !== 'standard' && presetId !== 'inst-hq3'
        ? { legacy: true }
        : {}),
    };
  }
  return results;
}

// Called by an engine adapter right after a recipe artifact's atomic publish
// rename succeeds — never before, so a crash mid-write can't leave the
// manifest claiming a result that doesn't exist on disk. Producing a
// result always selects it (it's what the caller just asked to run).
function recordSeparationResult(separationsDir, result) {
  const recipeId = canonicalizeResultRecipeId(result.recipeId);
  const normalized = normalizeV2Entry(recipeId, result);
  if (!normalized) throw new Error('invalid separation result metadata');
  if (!normalized.profileId) {
    throw new Error('separation result must identify a processing profile');
  }
  const manifest = loadSeparationManifest(separationsDir);
  manifest.results[recipeId] = normalized;
  manifest.selectedRecipeId = recipeId;
  atomicWriteJson(
    path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
    manifest,
  );
}

// Switches which result plays, without touching any audio file — a cheap
// metadata write, unlike generating a result. Refuses (returns false,
// manifest untouched) if recipeId has no recorded result, so callers can't
// point playback at a file that was never produced (or was produced then
// deleted out-of-band).
function selectSeparationResult(separationsDir, recipeId) {
  const manifest = loadSeparationManifest(separationsDir);
  const canonicalRecipeId = canonicalizeResultRecipeId(recipeId);
  if (!manifest.results[canonicalRecipeId]) return false;
  manifest.selectedRecipeId = canonicalRecipeId;
  atomicWriteJson(
    path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
    manifest,
  );
  return true;
}

function removeSeparationResult(separationsDir, recipeId) {
  const manifest = loadSeparationManifest(separationsDir);
  const canonicalRecipeId = canonicalizeResultRecipeId(recipeId);
  const result = manifest.results[canonicalRecipeId];
  if (!result) return null;

  const artifactPath = path.join(separationsDir, result.artifactFilename);
  fs.rmSync(artifactPath, { force: true });
  delete manifest.results[canonicalRecipeId];

  if (manifest.selectedRecipeId === canonicalRecipeId) {
    manifest.selectedRecipeId =
      Object.entries(manifest.results)
        .filter(([, entry]) =>
          hasSeparationResultFile(separationsDir, entry.artifactFilename),
        )
        .sort(([, left], [, right]) =>
          String(right.completedAt).localeCompare(String(left.completedAt)),
        )[0]?.[0] ?? null;
  }

  atomicWriteJson(
    path.join(separationsDir, SEPARATION_MANIFEST_FILENAME),
    manifest,
  );
  return {
    recipeId: canonicalRecipeId,
    artifactFilename: result.artifactFilename,
    selectedRecipeId: manifest.selectedRecipeId,
  };
}

function hasSeparationResultFile(separationsDir, artifactFilename) {
  return (
    SAFE_ARTIFACT_FILENAME_RE.test(artifactFilename) &&
    fs.existsSync(path.join(separationsDir, artifactFilename))
  );
}

// Shared by hasSeparation() and listTracks() below — listTracks() already
// has separationsDir/manifest in hand (loaded once per track for the
// `separation.results` field too), so it calls this directly instead of
// going through hasSeparation() and re-reading the manifest file.
function manifestHasSelectedResult(separationsDir, manifest) {
  return Boolean(
    manifest.selectedRecipeId &&
    separationsDir &&
    hasSeparationResultFile(
      separationsDir,
      manifest.results[manifest.selectedRecipeId]?.artifactFilename,
    ),
  );
}

function hasSeparation(dir, trackId) {
  const separationsDir = resolveSeparationsDir(dir, trackId);
  if (!separationsDir) return false;
  const manifest = loadSeparationManifest(separationsDir);
  return manifestHasSelectedResult(separationsDir, manifest);
}

// For the protocol handler — presetFilename is checked against a strict
// charset allowlist (not an extension check alone) before it ever touches
// the filesystem, same pattern as resolveTrackAssetPath's other branches.
function resolveSeparationResultPath(dir, trackId, presetFilename) {
  if (!SAFE_ARTIFACT_FILENAME_RE.test(presetFilename)) {
    return null;
  }
  const separationsDir = resolveSeparationsDir(dir, trackId);
  if (!separationsDir) return null;
  const filePath = path.join(separationsDir, presetFilename);
  return fs.existsSync(filePath) ? filePath : null;
}

module.exports = {
  canonicalizeResultRecipeId,
  resolveSeparationsDir,
  loadSeparationManifest,
  recordSeparationResult,
  removeSeparationResult,
  selectSeparationResult,
  hasSeparationResultFile,
  manifestHasSelectedResult,
  hasSeparation,
  resolveSeparationResultPath,
  SAFE_RECIPE_ID_RE,
};
