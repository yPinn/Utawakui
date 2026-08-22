'use strict';

const { loadOutputSlots, upsertOutputSlot } = require('../lib/outputSlots');
const { isValidOutputRuntime } = require('../lib/config');
const {
  findAvailableOutputPorts,
  isOutputPortAvailable,
} = require('../lib/outputPorts');
const {
  suggestedPorts: OUTPUT_PORT_CANDIDATES,
} = require('../../shared/outputRuntimeValues.json');

function registerOutputHandlers({
  ipcMain,
  server,
  requireFeatureGate,
  featureIds,
  getConfig,
  updateConfig,
  resolveDownloadDir,
  isPortAvailable = isOutputPortAvailable,
  findAvailablePorts = findAvailableOutputPorts,
  logger = console,
}) {
  function outputDir() {
    return resolveDownloadDir(getConfig());
  }

  function syncOutputSlots(document = loadOutputSlots(outputDir())) {
    server.setOverlaySlots?.(document.slots);
    return document;
  }

  syncOutputSlots();

  ipcMain.handle('output:get-status', async () => server.getStatus());

  ipcMain.handle('output:connect-source', async (event) =>
    server.connectSource(event.sender),
  );

  ipcMain.handle('output:get-settings', async () => ({
    ...getConfig().outputRuntime,
  }));

  ipcMain.handle('output:suggest-ports', async () => {
    const currentPort = getConfig().outputRuntime.port;
    return findAvailablePorts(
      OUTPUT_PORT_CANDIDATES.filter((port) => port !== currentPort),
    );
  });

  ipcMain.handle('output:update-settings', async (event, value) => {
    if (!isValidOutputRuntime(value)) {
      throw new Error('invalid output runtime settings');
    }

    const previous = { ...getConfig().outputRuntime };
    const next = {
      autoStart: value.autoStart,
      port: value.port,
      displayDelayMs: value.displayDelayMs,
    };
    const portChanged = next.port !== previous.port;
    if (portChanged && !(await isPortAvailable(next.port))) {
      throw new Error(`output port is already in use: ${next.port}`);
    }

    updateConfig({ outputRuntime: next });
    try {
      const status = await server.reconcileConfigured({
        forceRestart: portChanged,
      });
      return { settings: next, status };
    } catch (error) {
      updateConfig({ outputRuntime: previous });
      try {
        await server.reconcileConfigured({ forceRestart: portChanged });
      } catch (rollbackError) {
        logger.error?.(
          '[output] Failed to restore previous output settings',
          rollbackError,
        );
      }
      throw error;
    }
  });

  ipcMain.handle('output:start', async () => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    return server.start();
  });

  ipcMain.handle('output:stop', async () => {
    await server.stop();
    return server.getStatus();
  });

  ipcMain.handle('output:publish', async (event, snapshot) => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    return server.publish(snapshot, event.sender);
  });

  ipcMain.handle('output-slots:list', async () => {
    return syncOutputSlots();
  });

  ipcMain.handle('output-slots:upsert', async (event, kind, slot) => {
    return syncOutputSlots(upsertOutputSlot(outputDir(), kind, slot));
  });
}

module.exports = { registerOutputHandlers };
