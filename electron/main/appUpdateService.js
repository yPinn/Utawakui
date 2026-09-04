'use strict';

const UPDATE_PHASES = new Set([
  'disabled',
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
]);

// Phases from which an unprompted background recheck is allowed to run. Once a
// user has an update in hand (available / downloading / downloaded) the timer
// stays quiet so it can never reset visible progress or a ready-to-install
// state under them.
const RECHECKABLE_PHASES = new Set(['idle', 'not-available', 'error']);

// A pathological bytesPerSecond (e.g. a stall then a burst) can make the naive
// remaining-time estimate enormous; clamp it so the renderer never shows a
// multi-day countdown.
const MAX_ETA_SECONDS = 24 * 60 * 60;

function boundedString(value, maxLength = 80) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeReleaseDate(value) {
  const text = boundedString(value, 64);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizePercent(value) {
  const percent = Number(value?.percent);
  if (!Number.isFinite(percent)) return null;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}

function normalizeBytesPerSecond(value) {
  const rate = Number(value?.bytesPerSecond);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(rate);
}

function normalizeEtaSeconds(value) {
  const total = Number(value?.total);
  const transferred = Number(value?.transferred);
  const rate = Number(value?.bytesPerSecond);
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(transferred) ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    total <= transferred
  ) {
    return null;
  }
  return Math.min(MAX_ETA_SECONDS, Math.round((total - transferred) / rate));
}

function projectDownloadProgress(info) {
  return {
    progress: normalizePercent(info),
    downloadBytesPerSecond: normalizeBytesPerSecond(info),
    downloadEtaSeconds: normalizeEtaSeconds(info),
  };
}

function createAppUpdateService({
  currentVersion,
  isPackaged,
  isWindows = process.platform === 'win32',
  runtimeEnabled = false,
  autoCheckEnabled = true,
  updaterFactory = () => require('electron-updater').autoUpdater,
  publishStatus = () => undefined,
  schedule = setTimeout,
  scheduleInterval = setInterval,
  logger = console,
} = {}) {
  const enabled = Boolean(isPackaged && isWindows && runtimeEnabled);
  let autoChecksAllowed = Boolean(autoCheckEnabled);
  let updater = null;
  let initialized = false;
  let startupCheckScheduled = false;
  let recheckScheduled = false;
  let status = {
    enabled,
    phase: enabled ? 'idle' : 'disabled',
    currentVersion: boundedString(currentVersion) || '0.0.0',
    availableVersion: null,
    progress: null,
    downloadBytesPerSecond: null,
    downloadEtaSeconds: null,
    releaseDate: null,
    error: null,
  };

  function getStatus() {
    return { ...status };
  }

  function setStatus(patch) {
    const nextPhase = UPDATE_PHASES.has(patch.phase)
      ? patch.phase
      : status.phase;
    status = { ...status, ...patch, phase: nextPhase };
    publishStatus(getStatus());
    return getStatus();
  }

  function fail(operation, error) {
    logger.error?.(`[update] ${operation} failed`, error);
    return setStatus({
      phase: 'error',
      progress: null,
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
      error: '無法完成更新操作，請稍後再試。',
    });
  }

  function initialize() {
    if (!enabled || initialized) return getStatus();

    try {
      updater = updaterFactory();
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;

      updater.on('checking-for-update', () => {
        setStatus({ phase: 'checking', progress: null, error: null });
      });
      updater.on('update-available', (info) => {
        setStatus({
          phase: 'available',
          availableVersion: boundedString(info?.version),
          releaseDate: normalizeReleaseDate(info?.releaseDate),
          progress: null,
          downloadBytesPerSecond: null,
          downloadEtaSeconds: null,
          error: null,
        });
      });
      updater.on('update-not-available', () => {
        setStatus({
          phase: 'not-available',
          availableVersion: null,
          releaseDate: null,
          progress: null,
          downloadBytesPerSecond: null,
          downloadEtaSeconds: null,
          error: null,
        });
      });
      updater.on('download-progress', (progress) => {
        setStatus({
          phase: 'downloading',
          ...projectDownloadProgress(progress),
          error: null,
        });
      });
      updater.on('update-downloaded', (info) => {
        setStatus({
          phase: 'downloaded',
          availableVersion:
            boundedString(info?.version) || status.availableVersion,
          releaseDate:
            normalizeReleaseDate(info?.releaseDate) || status.releaseDate,
          progress: 100,
          downloadBytesPerSecond: null,
          downloadEtaSeconds: null,
          error: null,
        });
      });
      updater.on('error', (error) => fail('Updater', error));
      initialized = true;
    } catch (error) {
      updater = null;
      return fail('Initialize', error);
    }
    return getStatus();
  }

  async function check() {
    if (!enabled || ['checking', 'downloading'].includes(status.phase)) {
      return getStatus();
    }
    initialize();
    if (!updater) return getStatus();
    setStatus({
      phase: 'checking',
      availableVersion: null,
      releaseDate: null,
      progress: null,
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
      error: null,
    });
    try {
      await updater.checkForUpdates();
    } catch (error) {
      return fail('Check', error);
    }
    return getStatus();
  }

  async function download() {
    const canDownload =
      status.phase === 'available' ||
      (status.phase === 'error' && Boolean(status.availableVersion));
    if (!enabled || !canDownload) return getStatus();

    initialize();
    setStatus({
      phase: 'downloading',
      progress: 0,
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
      error: null,
    });
    try {
      await updater.downloadUpdate();
    } catch (error) {
      return fail('Download', error);
    }
    return getStatus();
  }

  function install() {
    if (!enabled || status.phase !== 'downloaded') return getStatus();
    try {
      updater.quitAndInstall(false, true);
    } catch (error) {
      return fail('Install', error);
    }
    return getStatus();
  }

  function setAutoCheckEnabled(next) {
    // Only gates the automatic paths. An already-armed timer is left in place;
    // its callback re-reads this flag, so toggling the preference back on
    // resumes background checks without a relaunch.
    autoChecksAllowed = Boolean(next);
    return autoChecksAllowed;
  }

  function scheduleStartupCheck(delayMs) {
    if (!enabled || !autoChecksAllowed || startupCheckScheduled) return false;
    initialize();
    if (!updater) return false;
    startupCheckScheduled = true;
    const timer = schedule(() => {
      void check();
    }, delayMs);
    timer?.unref?.();
    return true;
  }

  function scheduleRecheck(intervalMs) {
    if (!enabled || recheckScheduled) return false;
    initialize();
    if (!updater) return false;
    recheckScheduled = true;
    const timer = scheduleInterval(() => {
      if (autoChecksAllowed && RECHECKABLE_PHASES.has(status.phase)) {
        void check();
      }
    }, intervalMs);
    timer?.unref?.();
    return true;
  }

  return {
    check,
    download,
    getStatus,
    initialize,
    install,
    scheduleStartupCheck,
    scheduleRecheck,
    setAutoCheckEnabled,
  };
}

module.exports = { createAppUpdateService };
