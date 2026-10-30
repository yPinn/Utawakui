'use strict';

const childProcess = require('node:child_process');
const {
  SPOUT_CONTRACT_VERSION,
  SPOUT_DEFAULT_FRAME_RATE_PROFILE,
  SPOUT_HELPER_ARGUMENT,
  SPOUT_LYRICS_SURFACE,
  createSpoutConfigureMessage,
  getSpoutLyricsSurface,
  isSpoutFrameRateProfile,
  normalizeSpoutHelperEvent,
} = require('../../shared/spoutOutputContract');
const { t } = require('../lib/i18n');

const DEFAULT_START_TIMEOUT_MS = 10_000;
const DEFAULT_STOP_TIMEOUT_MS = 2_000;

const PUBLIC_ERROR_CODES = new Set([
  'SPOUT_NATIVE_MODULE_UNAVAILABLE',
  'SPOUT_RENDERER_LOAD_FAILED',
  'SPOUT_RENDERER_FAILED',
  'SPOUT_SENDER_NAME_IN_USE',
  'SPOUT_SHARED_TEXTURE_UNAVAILABLE',
  'SPOUT_SURFACE_INVALID',
  'SPOUT_TEXTURE_SEND_FAILED',
  'SPOUT_HELPER_INTERNAL',
]);

function createSpoutHelperLaunch({ execPath, appPath, packaged }) {
  return {
    command: execPath,
    args: packaged ? [SPOUT_HELPER_ARGUMENT] : [appPath, SPOUT_HELPER_ARGUMENT],
  };
}

function createDefaultHelperProcess({ command, args }) {
  return childProcess.spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
}

function createInitialStatus({ supported }) {
  return {
    supported,
    desired: {
      running: false,
      frameRateProfile: SPOUT_DEFAULT_FRAME_RATE_PROFILE,
      surface: SPOUT_LYRICS_SURFACE,
    },
    observed: {
      lifecycle: 'stopped',
      processId: null,
      firstFrameAt: null,
    },
    effective: { surface: null },
    error: null,
  };
}

function cloneStatus(status) {
  return {
    supported: status.supported,
    desired: {
      running: status.desired.running,
      frameRateProfile: status.desired.frameRateProfile,
      surface: { ...status.desired.surface },
    },
    observed: { ...status.observed },
    effective: {
      surface: status.effective.surface
        ? { ...status.effective.surface }
        : null,
    },
    error: status.error ? { ...status.error } : null,
  };
}

function toPublicError(code) {
  const known = PUBLIC_ERROR_CODES.has(code) ? code : 'SPOUT_HELPER_INTERNAL';
  return { code, message: t(`output.spout.errors.${known}`) };
}

function createSpoutOutputRuntime({
  outputRuntime,
  requireFeatureGate = () => {},
  featureId = 'public-output-flow',
  spawnHelper = createDefaultHelperProcess,
  resolveLaunch = () =>
    createSpoutHelperLaunch({
      execPath: process.execPath,
      appPath: process.cwd(),
      packaged: false,
    }),
  platform = process.platform,
  arch = process.arch,
  now = () => new Date(),
  logger = console,
  onStatusChange = () => {},
  startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
}) {
  if (!outputRuntime) throw new Error('outputRuntime is required');

  const status = createInitialStatus({
    supported: platform === 'win32' && arch === 'x64',
  });
  let child = null;
  let startPromise = null;
  let stopPromise = null;

  function getStatus() {
    return cloneStatus(status);
  }

  function publishStatus() {
    try {
      onStatusChange(getStatus());
    } catch (error) {
      logger.error?.('[spout-output] Failed to publish status', error);
    }
  }

  function resetStopped() {
    child = null;
    status.desired.running = false;
    status.observed.lifecycle = 'stopped';
    status.observed.processId = null;
    status.observed.firstFrameAt = null;
    status.effective.surface = null;
  }

  function failHelper(code, privateContext) {
    logger.error?.('[spout-output] Helper failure', privateContext ?? code);
    status.desired.running = false;
    status.observed.lifecycle = 'error';
    status.observed.processId = child?.pid ?? null;
    status.effective.surface = null;
    status.error = toPublicError(code);
    publishStatus();
  }

  async function ensureOutputServer() {
    let outputStatus = await outputRuntime.getStatus();
    if (outputStatus?.running !== true) {
      outputStatus = await outputRuntime.start();
    }
    return outputStatus;
  }

  async function start() {
    if (stopPromise) await stopPromise;
    if (startPromise) return startPromise;
    if (status.observed.lifecycle === 'sending' && child) return getStatus();
    if (status.observed.lifecycle === 'error' && child) await stop();

    startPromise = (async () => {
      requireFeatureGate(featureId);
      if (!status.supported) {
        throw new Error('Spout output is available only on Windows');
      }

      status.desired.running = true;
      status.observed.lifecycle = 'starting';
      status.observed.firstFrameAt = null;
      status.effective.surface = null;
      status.error = null;
      publishStatus();

      let outputStatus;
      let configuration;
      let launchedChild;
      try {
        outputStatus = await ensureOutputServer();
        configuration = createSpoutConfigureMessage(
          outputStatus,
          status.desired.frameRateProfile,
        );
        launchedChild = spawnHelper(resolveLaunch());
      } catch (error) {
        failHelper('SPOUT_HELPER_INTERNAL', error);
        throw new Error('Spout helper failed to start', { cause: error });
      }
      child = launchedChild;
      status.observed.processId = launchedChild.pid ?? null;
      publishStatus();

      if (launchedChild.stderr?.on) {
        launchedChild.stderr.on('data', (chunk) => {
          logger.error?.('[spout-output] Helper stderr', String(chunk));
        });
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback(value);
        };
        const rejectStart = (code, privateContext) => {
          failHelper(code, privateContext);
          launchedChild.kill?.();
          finish(reject, new Error('Spout helper failed to start'));
        };

        const timeout = setTimeout(() => {
          rejectStart('SPOUT_HELPER_INTERNAL', 'start timeout');
        }, startTimeoutMs);

        launchedChild.on('message', (rawEvent) => {
          if (child !== launchedChild) return;
          const event = normalizeSpoutHelperEvent(rawEvent);
          if (!event) return;
          if (event.type === 'error') {
            rejectStart(event.code, rawEvent);
            return;
          }
          if (settled) return;
          status.observed.lifecycle = 'sending';
          status.observed.firstFrameAt = now().toISOString();
          status.effective.surface = event.surface;
          status.error = null;
          publishStatus();
          finish(resolve, getStatus());
        });
        launchedChild.once('error', (error) => {
          if (child !== launchedChild) return;
          rejectStart('SPOUT_HELPER_INTERNAL', error);
        });
        launchedChild.once('exit', (code, signal) => {
          if (child !== launchedChild) return;
          child = null;
          status.observed.processId = null;
          if (!settled) {
            if (status.desired.running) {
              rejectStart('SPOUT_HELPER_INTERNAL', { code, signal });
            } else {
              resetStopped();
              finish(reject, new Error('Spout helper start cancelled'));
            }
            return;
          }
          if (status.observed.lifecycle === 'error') {
            publishStatus();
            return;
          }
          if (status.desired.running) {
            failHelper('SPOUT_HELPER_INTERNAL', { code, signal });
          } else {
            resetStopped();
            publishStatus();
          }
        });

        try {
          launchedChild.send(configuration);
        } catch (error) {
          rejectStart('SPOUT_HELPER_INTERNAL', error);
        }
      });
    })();

    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  }

  async function stop() {
    if (stopPromise) return stopPromise;
    if (!child) {
      resetStopped();
      status.error = null;
      publishStatus();
      return getStatus();
    }

    stopPromise = (async () => {
      const activeChild = child;
      status.desired.running = false;
      status.observed.lifecycle = 'stopping';
      publishStatus();

      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };
        const timeout = setTimeout(() => {
          activeChild.kill?.();
          finish();
        }, stopTimeoutMs);
        activeChild.once('exit', finish);
        if (activeChild.connected !== false) {
          try {
            activeChild.send({
              contractVersion: SPOUT_CONTRACT_VERSION,
              type: 'stop',
            });
          } catch (error) {
            logger.error?.(
              '[spout-output] Failed to request helper stop',
              error,
            );
            activeChild.kill?.();
            finish();
          }
        } else {
          activeChild.kill?.();
          finish();
        }
      });

      if (child === activeChild) child = null;
      resetStopped();
      status.error = null;
      publishStatus();
      return getStatus();
    })();

    try {
      return await stopPromise;
    } finally {
      stopPromise = null;
    }
  }

  async function setFrameRateProfile(frameRateProfile) {
    requireFeatureGate(featureId);
    if (!status.supported) {
      throw new Error('Spout output is available only on Windows');
    }
    if (!isSpoutFrameRateProfile(frameRateProfile)) {
      throw new Error('Spout frame-rate profile unavailable');
    }
    if (status.observed.lifecycle === 'error' && child) await stop();
    if (
      child ||
      startPromise ||
      stopPromise ||
      ['starting', 'sending', 'stopping'].includes(status.observed.lifecycle)
    ) {
      throw new Error('Spout output must be stopped');
    }

    status.desired.frameRateProfile = frameRateProfile;
    status.desired.surface = getSpoutLyricsSurface(frameRateProfile);
    publishStatus();
    return getStatus();
  }

  return { getStatus, setFrameRateProfile, start, stop };
}

module.exports = {
  PUBLIC_ERROR_CODES,
  createSpoutHelperLaunch,
  createSpoutOutputRuntime,
};
