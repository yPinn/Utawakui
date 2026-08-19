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

// Shared by hasSeparation() and listTracks() below — listTracks() already
// has separationsDir/manifest in hand (loaded once per track for the
// `separation.results` field too), so it calls this directly instead of
// going through hasSeparation() and re-reading the manifest file.
function manifestHasSelectedResult(separationsDir, manifest) {
  return Boolean(
    manifest.selectedPresetId &&
    separationsDir &&
    hasSeparationResultFile(separationsDir, manifest.selectedPresetId),
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

module.exports = {
  resolveSeparationsDir,
  loadSeparationManifest,
  recordSeparationResult,
  selectSeparationResult,
  hasSeparationResultFile,
  manifestHasSelectedResult,
  hasSeparation,
  resolveSeparationResultPath,
};
