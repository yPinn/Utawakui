'use strict';

// Owns config.json's in-memory cache — split out of electron/main.js's
// app.whenReady() closure, which every one of the ~35 read sites and 6
// reassignment sites used to close over directly. loadInitialConfig() must
// run once, early in whenReady, before anything else here is called.

const path = require('path');
const { app } = require('electron');
const { loadConfig, saveConfig } = require('../lib/config');
const { isFeatureGateEnabled } = require('../lib/featureGates');

let configPath = null;
let cachedConfig = null;

function loadInitialConfig() {
  // Machine-local settings only, never exported/shared — see CLAUDE.md's
  // config.json convention.
  configPath = path.join(app.getPath('userData'), 'config.json');
  cachedConfig = loadConfig(configPath);
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
