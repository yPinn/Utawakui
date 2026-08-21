'use strict';

const fs = require('fs');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const { normalizeFeatureConfirmations } = require('./featureGates');
const { normalizeYtdlpStatusCache } = require('./ytdlpStatus');

const CURRENT_VERSION = 1;
const UI_THEMES = ['light', 'dark'];
// Keep in sync with --ui-playlist-sidebar-width-min/-max in
// src/styles/tokens.css — main process can't read CSS.
const SIDEBAR_WIDTH_MIN = 72; // 4.5rem
const SIDEBAR_WIDTH_MAX = 392; // 24.5rem
const DEFAULTS = {
  version: CURRENT_VERSION,
  downloadDir: null,
  featureConfirmations: {},
  uiTheme: 'dark',
  sidebarWidth: 256, // 16rem, matches --ui-playlist-sidebar-width
  ytdlpStatus: {},
  // Audio output device id for the capture (OBS-facing) mix — see
  // usePlayer.js's capture chain. null means the feature is off; the
  // device is looked up by id at runtime via enumerateDevices(), so an id
  // for a device that's since been unplugged just fails to apply (see
  // useAudioOutput.js), not a validation concern here.
  captureDeviceId: null,
};

// Tolerant load: missing file, corrupted JSON, and wrong-typed fields all
// degrade to defaults rather than throwing — this is machine-local settings
// that can be hand-edited or clobbered by a sync tool, not exceptional input.
function loadConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch {
    return { ...DEFAULTS };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupted(configPath);
    return { ...DEFAULTS };
  }

  if (typeof data !== 'object' || data === null) {
    backupCorrupted(configPath);
    return { ...DEFAULTS };
  }

  return {
    version: CURRENT_VERSION,
    downloadDir:
      typeof data.downloadDir === 'string'
        ? data.downloadDir
        : DEFAULTS.downloadDir,
    featureConfirmations: normalizeFeatureConfirmations(
      data.featureConfirmations,
    ),
    uiTheme: UI_THEMES.includes(data.uiTheme) ? data.uiTheme : DEFAULTS.uiTheme,
    sidebarWidth:
      Number.isFinite(data.sidebarWidth) &&
      data.sidebarWidth >= SIDEBAR_WIDTH_MIN &&
      data.sidebarWidth <= SIDEBAR_WIDTH_MAX
        ? data.sidebarWidth
        : DEFAULTS.sidebarWidth,
    ytdlpStatus: normalizeYtdlpStatusCache(data.ytdlpStatus),
    captureDeviceId:
      typeof data.captureDeviceId === 'string'
        ? data.captureDeviceId
        : DEFAULTS.captureDeviceId,
  };
}

function saveConfig(configPath, partial) {
  const merged = {
    ...loadConfig(configPath),
    ...partial,
    version: CURRENT_VERSION,
  };
  atomicWriteJson(configPath, merged);
  return merged;
}

module.exports = {
  loadConfig,
  saveConfig,
  DEFAULTS,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
};
