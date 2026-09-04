'use strict';

const fs = require('fs');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const { normalizeFeatureConfirmations } = require('./featureGates');
const {
  defaultPort: DEFAULT_OUTPUT_PORT,
  minPort: OUTPUT_PORT_MIN,
  maxPort: OUTPUT_PORT_MAX,
  defaultDisplayDelayMs: DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
  minDisplayDelayMs: OUTPUT_DISPLAY_DELAY_MIN,
  maxDisplayDelayMs: OUTPUT_DISPLAY_DELAY_MAX,
} = require('../../shared/outputRuntimeValues.json');

const CURRENT_VERSION = 2;
const UI_THEMES = ['light', 'dark'];
// Keep in sync with --ui-playlist-sidebar-width-min/-max in
// src/styles/tokens.css — main process can't read CSS.
const SIDEBAR_WIDTH_MIN = 72; // 4.5rem
const SIDEBAR_WIDTH_MAX = 392; // 24.5rem
const CAPTURE_DEVICE_ID_MAX_LENGTH = 512;
const DEFAULTS = {
  version: CURRENT_VERSION,
  downloadDir: null,
  featureConfirmations: {},
  uiTheme: 'dark',
  sidebarWidth: 256, // 16rem, matches --ui-playlist-sidebar-width
  // Audio output device id for the capture (OBS-facing) mix — see
  // usePlayer.js's capture chain. null means the feature is off; the
  // device is looked up by id at runtime via enumerateDevices(), so an id
  // for a device that's since been unplugged just fails to apply (see
  // useAudioOutput.js), not a validation concern here.
  captureDeviceId: null,
  // Product intent only. The main-owned import completion path still rechecks
  // the audio-processing gate and capability readiness before scheduling work.
  autoAnalyzeMusicStructure: true,
  // When true, the packaged Windows build runs the delayed startup update check
  // and the background recheck. Turning it off leaves the manual Settings
  // "check" action working; it only stops the app from contacting the release
  // feed on its own.
  autoCheckAppUpdates: true,
  // Absolute path to a system-installed FFmpeg the user opted into via
  // Settings (see electron/lib/systemFfmpeg.js's detectSystemFfmpeg()).
  // null means the app-managed Gyan download is used (the default). Only
  // ever written by main after it has itself re-detected and smoke-tested
  // the path — the renderer never supplies a path directly, same
  // untrusted-input posture as captureDeviceId's id-not-path role above.
  systemFfmpegPath: null,
  outputRuntime: Object.freeze({
    autoStart: true,
    port: DEFAULT_OUTPUT_PORT,
    displayDelayMs: DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
  }),
};

function isValidOutputRuntime(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.autoStart === 'boolean' &&
    Number.isSafeInteger(value.port) &&
    value.port >= OUTPUT_PORT_MIN &&
    value.port <= OUTPUT_PORT_MAX &&
    Number.isSafeInteger(value.displayDelayMs) &&
    value.displayDelayMs >= OUTPUT_DISPLAY_DELAY_MIN &&
    value.displayDelayMs <= OUTPUT_DISPLAY_DELAY_MAX,
  );
}

function normalizeOutputRuntime(value) {
  const isLegacyRuntime = Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.autoStart === 'boolean' &&
    Number.isSafeInteger(value.port) &&
    value.port >= OUTPUT_PORT_MIN &&
    value.port <= OUTPUT_PORT_MAX &&
    value.displayDelayMs === undefined,
  );
  if (isLegacyRuntime) {
    return {
      autoStart: value.autoStart,
      port: value.port,
      displayDelayMs: DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
    };
  }
  if (!isValidOutputRuntime(value)) {
    return { ...DEFAULTS.outputRuntime };
  }
  return {
    autoStart: value.autoStart,
    port: value.port,
    displayDelayMs: value.displayDelayMs,
  };
}

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
    captureDeviceId:
      typeof data.captureDeviceId === 'string' &&
      data.captureDeviceId.length > 0 &&
      data.captureDeviceId.length <= CAPTURE_DEVICE_ID_MAX_LENGTH
        ? data.captureDeviceId
        : DEFAULTS.captureDeviceId,
    autoAnalyzeMusicStructure:
      typeof data.autoAnalyzeMusicStructure === 'boolean'
        ? data.autoAnalyzeMusicStructure
        : DEFAULTS.autoAnalyzeMusicStructure,
    autoCheckAppUpdates:
      typeof data.autoCheckAppUpdates === 'boolean'
        ? data.autoCheckAppUpdates
        : DEFAULTS.autoCheckAppUpdates,
    systemFfmpegPath:
      typeof data.systemFfmpegPath === 'string'
        ? data.systemFfmpegPath
        : DEFAULTS.systemFfmpegPath,
    outputRuntime: normalizeOutputRuntime(data.outputRuntime),
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
  CAPTURE_DEVICE_ID_MAX_LENGTH,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  OUTPUT_PORT_MIN,
  OUTPUT_PORT_MAX,
  isValidOutputRuntime,
  normalizeOutputRuntime,
};
