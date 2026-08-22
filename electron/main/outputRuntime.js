'use strict';

const { createOutputServer } = require('../lib/outputServer');
const {
  host: OUTPUT_HOST,
  defaultPort: DEFAULT_OUTPUT_PORT,
  defaultDisplayDelayMs: DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
} = require('../../shared/outputRuntimeValues.json');

function createIdleStatus(port) {
  return {
    running: false,
    host: OUTPUT_HOST,
    port,
    revision: 0,
    httpUrl: null,
    wsUrl: null,
    clients: 0,
  };
}

function createOutputRuntime({
  serverFactory = createOutputServer,
  getConfig = () => ({
    outputRuntime: {
      autoStart: true,
      port: DEFAULT_OUTPUT_PORT,
      displayDelayMs: DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
    },
  }),
  requireFeatureGate = () => undefined,
  resolveArtworkAsset = () => null,
  featureId = 'public-output-flow',
} = {}) {
  let server = null;
  let serverPort = null;
  let lastError = null;
  let overlaySlots = {};

  function serializeError(error) {
    if (!error) return null;
    return {
      code: typeof error.code === 'string' ? error.code : 'OUTPUT_START_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  function getSettings() {
    const settings = getConfig()?.outputRuntime;
    return {
      autoStart: settings?.autoStart !== false,
      port: Number.isSafeInteger(settings?.port)
        ? settings.port
        : DEFAULT_OUTPUT_PORT,
      displayDelayMs: Number.isSafeInteger(settings?.displayDelayMs)
        ? settings.displayDelayMs
        : DEFAULT_OUTPUT_DISPLAY_DELAY_MS,
    };
  }

  function ensureServer() {
    const { port } = getSettings();
    if (server && serverPort === port) return server;
    if (server?.getStatus().running) {
      throw new Error('output runtime must stop before changing port');
    }
    server = serverFactory({ port, overlaySlots, resolveArtworkAsset });
    serverPort = port;
    return server;
  }

  function getStatus() {
    return {
      ...(server?.getStatus() ?? createIdleStatus(getSettings().port)),
      error: lastError,
    };
  }

  async function startServer() {
    try {
      const status = await ensureServer().start();
      lastError = null;
      return { ...status, error: null };
    } catch (error) {
      lastError = serializeError(error);
      throw error;
    }
  }

  async function start() {
    requireFeatureGate(featureId);
    return startServer();
  }

  async function startConfigured() {
    if (!getSettings().autoStart) return getStatus();
    try {
      requireFeatureGate(featureId);
    } catch {
      return getStatus();
    }
    return startServer();
  }

  async function stop() {
    if (!server) return;
    await server.stop();
  }

  function publish(snapshot) {
    if (!server?.getStatus().running) return false;
    return server.publish(snapshot);
  }

  function setOverlaySlots(slots) {
    overlaySlots = { ...(slots ?? {}) };
    server?.setOverlaySlots?.(overlaySlots);
  }

  async function reconfigure() {
    const wasRunning = Boolean(server?.getStatus().running);
    if (server) await server.stop();
    server = null;
    serverPort = null;
    if (wasRunning) return start();
    return getStatus();
  }

  return {
    getSettings,
    getStatus,
    publish,
    reconfigure,
    setOverlaySlots,
    start,
    startConfigured,
    stop,
  };
}

function registerOutputRuntimeLifecycle({ app, server, logger = console }) {
  let allowQuit = false;
  let cleanupPromise = null;

  function handleBeforeQuit(event) {
    if (allowQuit) return;
    event.preventDefault();
    if (cleanupPromise) return;

    let stopResult;
    try {
      stopResult = server.stop();
    } catch (error) {
      stopResult = Promise.reject(error);
    }

    cleanupPromise = Promise.resolve(stopResult)
      .catch((error) => {
        logger.error?.('[output] Failed to stop output runtime', error);
      })
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  }

  app.on('before-quit', handleBeforeQuit);
  return () => app.removeListener('before-quit', handleBeforeQuit);
}

module.exports = {
  createOutputRuntime,
  registerOutputRuntimeLifecycle,
};
