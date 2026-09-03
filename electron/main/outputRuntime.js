'use strict';

const crypto = require('node:crypto');
const { createOutputServer } = require('../lib/outputServer');
const { createOutputProjectionHub } = require('../lib/outputProjection');
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

function rendererId(value) {
  const id = value?.id;
  if (typeof id !== 'string' && !Number.isSafeInteger(id)) return null;
  return String(id);
}

function createOutputRuntime({
  bootId = crypto.randomUUID(),
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
  onMilestone = () => undefined,
  recordOverlayMilestone = null,
  logger = console,
} = {}) {
  let server = null;
  let serverPort = null;
  let lastError = null;
  let overlaySlots = {};
  let serviceLifecycle = 'stopped';
  let lifecycleQueue = Promise.resolve();
  let rendererWebContents = null;
  let detachRendererListeners = null;
  const projectionHub = createOutputProjectionHub({
    bootId,
    onChange: (projection) => {
      server?.setProjectionState?.(projection);
      if (projection.sourceSynchronization === 'ready') {
        onMilestone('source-synchronized');
      }
    },
  });

  // Bounded per-code messages, not the raw OS error text: renderer's
  // isOutputPortConflict() only needs the literal code substring to offer
  // alternate ports, never the full "listen EADDRINUSE: address already in
  // use <host>:<port>" string this crosses IPC as.
  const KNOWN_OUTPUT_START_ERROR_CODES = new Set([
    'EADDRINUSE',
    'EACCES',
    'EADDRNOTAVAIL',
  ]);

  function serializeError(error) {
    if (!error) return null;
    logger.error?.('[output] Failed to start output runtime', error);
    const code =
      typeof error.code === 'string' &&
      KNOWN_OUTPUT_START_ERROR_CODES.has(error.code)
        ? error.code
        : 'OUTPUT_START_FAILED';
    return {
      code,
      message:
        code === 'OUTPUT_START_FAILED'
          ? 'output server failed to start'
          : `listen ${code}`,
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
    server = serverFactory({
      port,
      overlaySlots,
      resolveArtworkAsset,
      initialProjection: projectionHub.getProjection(),
      recordStartupMilestone: recordOverlayMilestone,
      logger,
    });
    serverPort = port;
    server.setProjectionState?.(projectionHub.getProjection());
    return server;
  }

  function getStatus() {
    const settings = getSettings();
    const base = server?.getStatus() ?? createIdleStatus(settings.port);
    const projection = projectionHub.getStatus();
    return {
      ...base,
      revision: projection.revision,
      error: lastError,
      bootId,
      sourceEpoch: projection.sourceEpoch,
      desired: {
        running: settings.autoStart,
        port: settings.port,
        displayDelayMs: settings.displayDelayMs,
      },
      observed: {
        serviceLifecycle,
        sourceSynchronization: projection.sourceSynchronization,
        unavailableReason: projection.unavailableReason,
        clients: base.clients ?? 0,
      },
      effective: {
        host: base.running ? base.host : null,
        port: base.running ? base.port : null,
        sourceEpoch:
          projection.sourceSynchronization === 'ready'
            ? projection.sourceEpoch
            : null,
      },
    };
  }

  function enqueueLifecycle(operation) {
    const task = lifecycleQueue.then(operation, operation);
    lifecycleQueue = task.catch(() => undefined);
    return task;
  }

  async function startServer() {
    serviceLifecycle = 'starting';
    try {
      await ensureServer().start();
      serviceLifecycle = 'listening';
      onMilestone('output-listening');
      lastError = null;
      return getStatus();
    } catch (error) {
      serviceLifecycle = 'error';
      lastError = serializeError(error);
      throw error;
    }
  }

  async function stopServer() {
    if (!server) {
      serviceLifecycle = 'stopped';
      return getStatus();
    }
    serviceLifecycle = 'stopping';
    await server.stop();
    serviceLifecycle = 'stopped';
    return getStatus();
  }

  function start() {
    requireFeatureGate(featureId);
    return enqueueLifecycle(startServer);
  }

  function startConfigured() {
    if (!getSettings().autoStart) return Promise.resolve(getStatus());
    try {
      requireFeatureGate(featureId);
    } catch {
      return Promise.resolve(getStatus());
    }
    return enqueueLifecycle(() => reconcileConfiguredState());
  }

  function stop() {
    return enqueueLifecycle(stopServer);
  }

  async function reconcileConfiguredState({ forceRestart = false } = {}) {
    const settings = getSettings();
    const running = Boolean(server?.getStatus().running);
    const portChanged = server !== null && serverPort !== settings.port;

    if (!settings.autoStart) {
      if (running) await stopServer();
      if (portChanged) {
        server = null;
        serverPort = null;
      }
      return getStatus();
    }

    requireFeatureGate(featureId);
    if (running && !forceRestart && !portChanged) return getStatus();
    if (running) await stopServer();
    if (forceRestart || portChanged) {
      server = null;
      serverPort = null;
    }
    return startServer();
  }

  function reconcileConfigured(options) {
    return enqueueLifecycle(() => reconcileConfiguredState(options));
  }

  function reconfigure() {
    return reconcileConfigured({ forceRestart: true });
  }

  function connectSource(source) {
    const sourceId = rendererId(source);
    if (!sourceId) return getStatus();
    if (rendererWebContents && sourceId !== rendererId(rendererWebContents)) {
      return getStatus();
    }
    if (!rendererWebContents) rendererWebContents = source;
    projectionHub.connectSource(sourceId);
    return getStatus();
  }

  function publish(envelope, source) {
    const sourceId = rendererId(source);
    if (
      !sourceId ||
      !rendererWebContents ||
      sourceId !== rendererId(rendererWebContents)
    ) {
      return false;
    }
    projectionHub.connectSource(sourceId);
    return projectionHub.publish(envelope, sourceId);
  }

  function attachRenderer(webContents) {
    detachRendererListeners?.();
    rendererWebContents = webContents;
    const listeners = [
      ['did-navigate', () => projectionHub.markUnavailable('renderer_loading')],
      [
        'render-process-gone',
        () => projectionHub.markUnavailable('renderer_crashed'),
      ],
      ['destroyed', () => projectionHub.markUnavailable('renderer_destroyed')],
    ];
    for (const [event, listener] of listeners) webContents.on(event, listener);
    detachRendererListeners = () => {
      for (const [event, listener] of listeners) {
        webContents.removeListener(event, listener);
      }
    };
    return detachRendererListeners;
  }

  function setOverlaySlots(slots) {
    overlaySlots = { ...(slots ?? {}) };
    server?.setOverlaySlots?.(overlaySlots);
  }

  return {
    attachRenderer,
    connectSource,
    getSettings,
    getStatus,
    publish,
    reconcileConfigured,
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
