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
const {
  defaultSkipThresholdMs: DEFAULT_OBS_SKIP_THRESHOLD_MS,
  minSkipThresholdMs: OBS_SKIP_THRESHOLD_MIN,
  maxSkipThresholdMs: OBS_SKIP_THRESHOLD_MAX,
} = require('../../shared/obsSessionValues.json');
const {
  defaultHost: DEFAULT_OBS_HOST,
  defaultPort: DEFAULT_OBS_PORT,
  minPort: OBS_PORT_MIN,
  maxPort: OBS_PORT_MAX,
  maxHostLength: OBS_HOST_MAX_LENGTH,
} = require('../../shared/obsConnectionValues.json');
const {
  isValidObsHost: isValidBoundedObsHost,
} = require('../../shared/obsConnectionContract.mjs');
const {
  isWindowCloseBehavior,
} = require('../../shared/windowCloseBehaviorContract.mjs');

const CURRENT_VERSION = 2;
const UI_THEMES = ['light', 'dark'];
// Keep in sync with --ui-playlist-sidebar-width-min/-max in
// src/styles/tokens.css — main process can't read CSS.
const SIDEBAR_WIDTH_MIN = 64; // 4rem
const LEGACY_SIDEBAR_WIDTH_MINS = new Set([68, 72]);
const SIDEBAR_WIDTH_MAX = 280; // 17.5rem
const CAPTURE_DEVICE_ID_MAX_LENGTH = 512;
const ANNOUNCEMENT_VERSION_MAX_LENGTH = 32;
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
  // Whether quick/general separation tries the DirectML execution provider
  // before CPU. See ADR 0017 — this is a boolean product intent, not a
  // renderer-chosen execution-provider name; main still owns the actual
  // DirectML-then-CPU-fallback logic in vocalSeparation.js regardless of
  // this value.
  separationGpuAcceleration: true,
  // When true, the packaged Windows build runs the delayed startup update check
  // and the background recheck. Turning it off leaves the manual Settings
  // "check" action working; it only stops the app from contacting the release
  // feed on its own.
  autoCheckAppUpdates: true,
  // Main-owned X-button behavior. Fresh installs ask; a remembered answer or
  // Settings choice can always run in the tray or quit without prompting.
  windowCloseBehavior: 'ask',
  // The last shared/releaseAnnouncement.json version the user has dismissed
  // the "what's new" modal for. null on a fresh config means "show it once".
  // Never fetched or written from anywhere but that bundled file's version
  // and this preference — no network request is involved.
  lastSeenAnnouncementVersion: null,
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
  // Connection-only intent — the WebSocket password never lives here (see
  // electron/main/obsCredentialStore.js's platform-backed secure storage,
  // per ADR 0013). enabled false means the adapter never opens a socket.
  obsIntegration: Object.freeze({
    enabled: false,
    host: DEFAULT_OBS_HOST,
    port: DEFAULT_OBS_PORT,
    // "略過門檻" (spec.md's Phase 4 decision) — a track played shorter than
    // this before the next one starts is dropped from session history as a
    // likely misclick, not a real performance. 0 disables the feature
    // entirely (every track kept regardless of duration). See
    // sessionHistoryService.js's maybeRetractShortTrack().
    skipThresholdMs: DEFAULT_OBS_SKIP_THRESHOLD_MS,
  }),
};

function normalizeSidebarWidth(value) {
  if (LEGACY_SIDEBAR_WIDTH_MINS.has(value)) return SIDEBAR_WIDTH_MIN;
  return Number.isFinite(value) &&
    value >= SIDEBAR_WIDTH_MIN &&
    value <= SIDEBAR_WIDTH_MAX
    ? value
    : DEFAULTS.sidebarWidth;
}

function isValidObsHost(value) {
  return isValidBoundedObsHost(value, OBS_HOST_MAX_LENGTH);
}

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

function isValidObsIntegration(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.enabled === 'boolean' &&
    isValidObsHost(value.host) &&
    Number.isSafeInteger(value.port) &&
    value.port >= OBS_PORT_MIN &&
    value.port <= OBS_PORT_MAX &&
    Number.isSafeInteger(value.skipThresholdMs) &&
    value.skipThresholdMs >= OBS_SKIP_THRESHOLD_MIN &&
    value.skipThresholdMs <= OBS_SKIP_THRESHOLD_MAX,
  );
}

function normalizeObsIntegration(value) {
  if (!isValidObsIntegration(value)) return { ...DEFAULTS.obsIntegration };
  return {
    enabled: value.enabled,
    host: value.host,
    port: value.port,
    skipThresholdMs: value.skipThresholdMs,
  };
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

function normalizeWindowCloseBehavior(data) {
  if (isWindowCloseBehavior(data.windowCloseBehavior)) {
    return data.windowCloseBehavior;
  }
  // Compatibility for development configs written before the three-state
  // close contract replaced the unreleased closeToTray boolean.
  if (data.closeToTray === true) return 'tray';
  return DEFAULTS.windowCloseBehavior;
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
    sidebarWidth: normalizeSidebarWidth(data.sidebarWidth),
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
    separationGpuAcceleration:
      typeof data.separationGpuAcceleration === 'boolean'
        ? data.separationGpuAcceleration
        : DEFAULTS.separationGpuAcceleration,
    autoCheckAppUpdates:
      typeof data.autoCheckAppUpdates === 'boolean'
        ? data.autoCheckAppUpdates
        : DEFAULTS.autoCheckAppUpdates,
    windowCloseBehavior: normalizeWindowCloseBehavior(data),
    lastSeenAnnouncementVersion:
      typeof data.lastSeenAnnouncementVersion === 'string' &&
      data.lastSeenAnnouncementVersion.length > 0 &&
      data.lastSeenAnnouncementVersion.length <= ANNOUNCEMENT_VERSION_MAX_LENGTH
        ? data.lastSeenAnnouncementVersion
        : DEFAULTS.lastSeenAnnouncementVersion,
    systemFfmpegPath:
      typeof data.systemFfmpegPath === 'string'
        ? data.systemFfmpegPath
        : DEFAULTS.systemFfmpegPath,
    outputRuntime: normalizeOutputRuntime(data.outputRuntime),
    obsIntegration: normalizeObsIntegration(data.obsIntegration),
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
  ANNOUNCEMENT_VERSION_MAX_LENGTH,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  OUTPUT_PORT_MIN,
  OUTPUT_PORT_MAX,
  OBS_PORT_MIN,
  OBS_PORT_MAX,
  OBS_HOST_MAX_LENGTH,
  OBS_SKIP_THRESHOLD_MIN,
  OBS_SKIP_THRESHOLD_MAX,
  isValidObsHost,
  isValidOutputRuntime,
  normalizeOutputRuntime,
  isValidObsIntegration,
  normalizeObsIntegration,
};
