'use strict';

// Owns config.json's in-memory cache — split out of electron/main.js's
// app.whenReady() closure, which every one of the ~35 read sites and 6
// reassignment sites used to close over directly. loadInitialConfig() must
// run once, early in whenReady, before anything else here is called.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { loadConfig, saveConfig } = require('../lib/config');
const { isFeatureGateEnabled } = require('../lib/featureGates');

let configPath = null;
let cachedConfig = null;
let lastWrittenLibraryPath = null;

// Sidecar for the NSIS uninstaller (build/installer.nsh), which can't parse
// JSON — UTF-16LE with no BOM/trailing newline is what NSIS's
// FileReadUTF16LE reads directly, and survives CJK paths regardless of the
// installer machine's ANSI codepage. Same machine-local, never-in-a-preset
// status as config.json itself (see CLAUDE.md).
function writeLibraryPathSidecar(config) {
  const libraryDir = resolveDownloadDir(config);
  if (libraryDir === lastWrittenLibraryPath) return;
  try {
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'library-path.txt'),
      libraryDir,
      'utf16le',
    );
    lastWrittenLibraryPath = libraryDir;
  } catch {
    // Best-effort hint file only — a failed write just costs the
    // uninstaller one checkbox, not a reason to fail app startup.
  }
}

function loadInitialConfig() {
  // Machine-local settings only, never exported/shared — see CLAUDE.md's
  // config.json convention.
  configPath = path.join(app.getPath('userData'), 'config.json');
  cachedConfig = loadConfig(configPath);
  writeLibraryPathSidecar(cachedConfig);
  return cachedConfig;
}

// Cached, not re-read per call — electron/main/mediaProtocol.js runs this on
// every byte-range request while a track streams/seeks. Kept in sync by
// updateConfig() below. Gap: a hand-edited config.json won't be picked up
// until next launch.
function getConfig() {
  return cachedConfig;
}

function updateConfig(patch) {
  cachedConfig = saveConfig(configPath, patch);
  writeLibraryPathSidecar(cachedConfig);
  return cachedConfig;
}

function requireFeatureGate(featureId) {
  if (isFeatureGateEnabled(cachedConfig, featureId)) return;
  throw new Error(`feature gate required: ${featureId}`);
}

function resolveDownloadDir(config) {
  // OS Music folder, not userData — userData is Chromium's internal engine
  // state; downloads are user content the user may want to browse directly.
  return config.downloadDir || path.join(app.getPath('music'), 'Utawakui');
}

module.exports = {
  loadInitialConfig,
  getConfig,
  updateConfig,
  requireFeatureGate,
  resolveDownloadDir,
};
