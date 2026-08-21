'use strict';

const {
  loadOutputProfiles,
  selectOutputProfile,
  upsertOutputProfile,
} = require('../lib/outputProfiles');
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

  ipcMain.handle('output:get-status', async () => server.getStatus());

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
    const next = { autoStart: value.autoStart, port: value.port };
    const portChanged = next.port !== previous.port;
    const wasRunning = server.getStatus().running === true;
    if (portChanged && !(await isPortAvailable(next.port))) {
      throw new Error(`output port is already in use: ${next.port}`);
    }

    updateConfig({ outputRuntime: next });
    try {
      let status = portChanged
        ? await server.reconfigure()
        : server.getStatus();
      if (next.autoStart && !previous.autoStart && !status.running) {
        requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
        status = await server.start();
      }
      return { settings: next, status };
    } catch (error) {
      updateConfig({ outputRuntime: previous });
      if (portChanged) {
        try {
          await server.reconfigure();
          if (wasRunning) await server.start();
        } catch (rollbackError) {
          logger.error?.(
            '[output] Failed to restore output runtime after port change',
            rollbackError,
          );
        }
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
    if (!server.getStatus().running) return false;
    return server.publish(snapshot);
  });

  ipcMain.handle('output-profiles:list', async () => {
    return loadOutputProfiles(outputDir());
  });

  ipcMain.handle('output-profiles:upsert', async (event, profile) => {
    return upsertOutputProfile(outputDir(), profile);
  });

  ipcMain.handle('output-profiles:select', async (event, profileId) => {
    return selectOutputProfile(outputDir(), profileId);
  });
}

module.exports = { registerOutputHandlers };
