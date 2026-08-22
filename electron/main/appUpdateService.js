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

function normalizeProgress(value) {
  const percent = Number(value?.percent);
  if (!Number.isFinite(percent)) return null;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}

function createAppUpdateService({
  currentVersion,
  isPackaged,
  isWindows = process.platform === 'win32',
  runtimeEnabled = false,
  updaterFactory = () => require('electron-updater').autoUpdater,
  publishStatus = () => undefined,
  schedule = setTimeout,
  logger = console,
} = {}) {
  const enabled = Boolean(isPackaged && isWindows && runtimeEnabled);
  let updater = null;
  let initialized = false;
  let startupCheckScheduled = false;
  let status = {
    enabled,
    phase: enabled ? 'idle' : 'disabled',
    currentVersion: boundedString(currentVersion) || '0.0.0',
    availableVersion: null,
    progress: null,
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
          error: null,
        });
      });
      updater.on('update-not-available', () => {
        setStatus({
          phase: 'not-available',
          availableVersion: null,
          releaseDate: null,
          progress: null,
          error: null,
        });
      });
      updater.on('download-progress', (progress) => {
        setStatus({
          phase: 'downloading',
          progress: normalizeProgress(progress),
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
    setStatus({ phase: 'downloading', progress: 0, error: null });
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

  function scheduleStartupCheck(delayMs) {
    if (!enabled || startupCheckScheduled) return false;
    initialize();
    if (!updater) return false;
    startupCheckScheduled = true;
    const timer = schedule(() => {
      void check();
    }, delayMs);
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
  };
}

module.exports = { createAppUpdateService };
