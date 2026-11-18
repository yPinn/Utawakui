'use strict';

const {
  loadOutputSlots,
  setOutputRecentColors,
  setOutputSavedColors,
  upsertOutputSlot,
} = require('../lib/outputSlots');
const { isValidOutputRuntime } = require('../lib/config');
const { randomUUID } = require('node:crypto');
const {
  readOutputPortrait,
  writeOutputPortrait,
} = require('../lib/outputPortraits');
const { t } = require('../lib/i18n');
const { maskEdge } = require('../../shared/outputPortraitImage.json');
const {
  findAvailableOutputPorts,
  isOutputPortAvailable,
} = require('../lib/outputPorts');
const {
  suggestedPorts: OUTPUT_PORT_CANDIDATES,
} = require('../../shared/outputRuntimeValues.json');
const {
  slots: OUTPUT_SLOT_DEFINITIONS,
} = require('../../shared/outputTemplateValues.json');

const OUTPUT_PATH_BY_KIND = new Map(
  OUTPUT_SLOT_DEFINITIONS.map((slot) => [slot.id, slot.path]),
);

function buildOutputUrl(status, kind) {
  const routePath = OUTPUT_PATH_BY_KIND.get(kind);
  if (!routePath) throw new Error('invalid output slot kind');

  const baseUrl =
    status?.httpUrl ??
    (status?.host && Number.isSafeInteger(status.port)
      ? `http://${status.host}:${status.port}`
      : null);
  if (!baseUrl) throw new Error('output URL unavailable');
  return new URL(routePath, baseUrl).toString();
}

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
  writeClipboardText = null,
  dialog,
  getMainWindow,
  readPortrait = readOutputPortrait,
  writePortrait = writeOutputPortrait,
  segmentPortrait,
  logger = console,
}) {
  const portraitDrafts = new WeakMap();

  function outputDir() {
    return resolveDownloadDir(getConfig());
  }

  function syncOutputSlots(document = loadOutputSlots(outputDir())) {
    server.setOverlaySlots?.(document.slots);
    return document;
  }

  try {
    syncOutputSlots();
  } catch (error) {
    // Output slots are optional library-owned state. An offline custom
    // library must not prevent handler registration or the main window from
    // being created; the explicit list/upsert calls still surface the
    // bounded library-location error so the UI can offer recovery.
    logger.warn?.('[output] Initial slot synchronization skipped', error);
  }

  ipcMain.handle('output:get-status', async () => server.getStatus());

  ipcMain.handle('output:fisheye-effects', async (_event, action) => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    return server.controlFisheyeEffects(action);
  });

  ipcMain.handle('output:copy-url', async (event, kind) => {
    const url = buildOutputUrl(server.getStatus(), kind);
    if (typeof writeClipboardText !== 'function') {
      throw new Error('clipboard unavailable');
    }
    writeClipboardText(url);
    return url;
  });

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

  ipcMain.handle('output-slots:choose-portrait', async ({ sender }) => {
    requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
    const previous = portraitDrafts.get(sender);
    if (previous && (!previous.photo || previous.saving))
      return { status: 'error' };
    previous?.processing?.abort();
    const draft = { id: randomUUID() };
    portraitDrafts.set(sender, draft);
    try {
      const directory = outputDir();
      const result = await dialog.showOpenDialog(getMainWindow(), {
        properties: ['openFile'],
        filters: [
          {
            name: t('outputPanel.portrait.fileTypes'),
            extensions: ['png', 'webp', 'jpg', 'jpeg'],
          },
        ],
      });
      if (result.canceled || !result.filePaths[0])
        return { status: 'cancelled' };
      const photo = await readPortrait(result.filePaths[0]);
      if (directory !== outputDir()) return { status: 'error' };
      if (!photo) return { status: 'invalid-image' };
      Object.assign(draft, { photo, directory });
      return {
        status: 'ok',
        id: draft.id,
        bytes: photo.bytes,
        mimeType: photo.mimeType,
      };
    } catch (error) {
      logger.error?.('[output] Could not import portrait', error);
      return { status: 'error' };
    } finally {
      if (!draft.photo) portraitDrafts.delete(sender);
    }
  });

  ipcMain.handle('output-slots:discard-portrait', ({ sender }, id) => {
    const draft = portraitDrafts.get(sender);
    if (!draft || draft.id !== id || draft.saving) return;
    draft.processing?.abort();
    portraitDrafts.delete(sender);
  });

  ipcMain.handle(
    'output-slots:segment-portrait',
    async ({ sender }, id, rgba) => {
      requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
      const draft = portraitDrafts.get(sender);
      if (
        !draft?.photo ||
        draft.id !== id ||
        draft.saving ||
        draft.processing ||
        !(rgba instanceof Uint8Array) ||
        rgba.length !== maskEdge ** 2 * 4
      ) {
        return { status: 'error' };
      }
      const processing = new AbortController();
      draft.processing = processing;
      try {
        if (draft.directory !== outputDir()) return { status: 'error' };
        const result = await segmentPortrait(rgba, processing.signal);
        if (processing.signal.aborted) return { status: 'cancelled' };
        requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
        return draft.directory === outputDir() ? result : { status: 'error' };
      } catch (error) {
        if (processing.signal.aborted) return { status: 'cancelled' };
        if (error.code === 'FEATURE_GATE_REQUIRED') throw error;
        logger.error?.(
          '[output] Could not separate the portrait subject',
          error,
        );
        return { status: 'error' };
      } finally {
        draft.processing = null;
      }
    },
  );

  ipcMain.handle(
    'output-slots:save-portrait',
    async ({ sender }, draftId, png = null) => {
      requireFeatureGate(featureIds.PUBLIC_OUTPUT_FLOW);
      const draft = portraitDrafts.get(sender);
      if (
        !draft?.photo ||
        draft.id !== draftId ||
        draft.saving ||
        draft.processing
      )
        return { status: 'error' };
      draft.saving = true;
      try {
        if (draft.directory !== outputDir()) return { status: 'error' };
        const id = await writePortrait(
          draft.directory,
          png ?? draft.photo.bytes,
          {
            edited: png !== null,
          },
        );
        if (!id) return { status: 'invalid-image' };
        portraitDrafts.delete(sender);
        return { status: 'ok', id };
      } catch (error) {
        logger.error?.('[output] Could not save portrait', error);
        return { status: 'error' };
      } finally {
        draft.saving = false;
      }
    },
  );

  ipcMain.handle('output-slots:set-recent-colors', async (event, colors) => {
    return setOutputRecentColors(outputDir(), colors);
  });

  ipcMain.handle('output-slots:set-saved-colors', async (event, colors) => {
    return setOutputSavedColors(outputDir(), colors);
  });
}

module.exports = { buildOutputUrl, registerOutputHandlers };
