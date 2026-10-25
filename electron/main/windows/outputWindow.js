'use strict';

const { slots } = require('../../../shared/outputTemplateValues.json');
const capture = require('../../../shared/outputCaptureValues.json');
const { host } = require('../../../shared/outputRuntimeValues.json');
const { sanitizeOutputSlot } = require('../../lib/outputSlots');
const { hardenWebContentsNavigation } = require('../webContentsSecurity');
const { getWindowIdentity } = require('./windowIdentity');

const definitions = new Map(slots.map((slot) => [slot.id, slot]));
const sizes = new Map(
  [...capture.widgetSizes, capture.lyricsSize].map((size) => [size.id, size]),
);

function publicSurface({ kind, title, width, height }) {
  return { kind, title, width, height };
}

function resolveOutputWindowSurface(kind, status, slot) {
  const definition = definitions.get(kind);
  if (!definition) throw new Error('OUTPUT_WINDOW_KIND_INVALID');
  if (
    !status?.running ||
    status.host !== host ||
    !Number.isSafeInteger(status.port) ||
    status.port < 1 ||
    status.port > 65535
  ) {
    throw new Error('OUTPUT_WINDOW_SERVER_UNAVAILABLE');
  }
  const normalized =
    sanitizeOutputSlot(kind, slot) ??
    sanitizeOutputSlot(kind, {
      templateId: definition.defaultTemplateId,
      settings: {},
    });
  const size = sizes.get(normalized.settings.captureSize);
  return {
    kind,
    title: `${getWindowIdentity('output').title}｜${definition.label}`,
    width: size.width,
    height: size.height,
    url: `http://${host}:${status.port}${definition.path}`,
  };
}

function createOutputWindowManager({
  BrowserWindow,
  getOutputStatus,
  getSlot = () => null,
  requireFeatureGate = () => {},
  featureId = 'public-output-flow',
  onFailure = () => {},
}) {
  const windows = new Map();
  const securedSessions = new WeakSet();

  function closeEntry(kind, entry) {
    if (windows.get(kind) === entry) windows.delete(kind);
    if (!entry.window.isDestroyed()) entry.window.destroy();
  }

  function closeAll() {
    for (const [kind, entry] of windows) closeEntry(kind, entry);
  }

  function reportFailure(kind, entry, error) {
    closeEntry(kind, entry);
    try {
      onFailure(error, kind);
    } catch {
      /* Diagnostics cannot retain a failed window. */
    }
  }

  async function open(kind) {
    requireFeatureGate(featureId);
    if (!definitions.has(kind)) throw new Error('OUTPUT_WINDOW_KIND_INVALID');
    const surface = resolveOutputWindowSurface(
      kind,
      getOutputStatus(),
      getSlot(kind),
    );
    const existing = windows.get(kind);
    if (existing && !existing.window.isDestroyed()) {
      await existing.loading;
      if (existing.window.isDestroyed()) return false;
      if (existing.window.isMinimized()) existing.window.restore();
      existing.window.show();
      existing.window.focus();
      return publicSurface(existing.surface);
    }
    const window = new BrowserWindow({
      width: surface.width,
      height: surface.height,
      useContentSize: true,
      resizable: true,
      maximizable: true,
      fullscreenable: false,
      title: surface.title,
      icon: getWindowIdentity('output').icon,
      autoHideMenuBar: true,
      show: false,
      transparent: false,
      backgroundColor: '#000000',
      webPreferences: {
        partition: 'output-capture',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        navigateOnDragDrop: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: false,
      },
    });
    const entry = { window, surface, loading: null };
    windows.set(kind, entry);
    entry.loading = (async () => {
      try {
        // Windows can clamp the constructor's framed size to the work area.
        // Reapply the canonical client size so an FHD surface stays FHD.
        window.setContentSize(surface.width, surface.height, false);
        window.setMenu(null);
        const contents = window.webContents;
        const targetSession = contents.session;
        if (!securedSessions.has(targetSession)) {
          securedSessions.add(targetSession);
          targetSession.setPermissionCheckHandler(() => false);
          targetSession.setPermissionRequestHandler(
            (_sender, _permission, callback) => callback(false),
          );
          targetSession.on('will-download', (event) => event.preventDefault());
        }
        contents.setAudioMuted(true);
        contents.setZoomFactor(1);
        hardenWebContentsNavigation(contents, {
          isAllowedNavigation: (url) => url === surface.url,
        });
        window.on('page-title-updated', (event) => event.preventDefault());
        window.once('ready-to-show', () => {
          if (!window.isDestroyed() && windows.get(kind) === entry)
            window.show();
        });
        window.once('closed', () => {
          if (windows.get(kind) === entry) windows.delete(kind);
        });
        contents.once('render-process-gone', (_event, details) =>
          reportFailure(kind, entry, details),
        );
        contents.once('unresponsive', () =>
          reportFailure(kind, entry, new Error('OUTPUT_WINDOW_UNRESPONSIVE')),
        );
        await window.loadURL(surface.url);
        if (window.isDestroyed()) return false;
        return publicSurface(entry.surface);
      } catch (error) {
        closeEntry(kind, entry);
        throw error;
      }
    })();
    return entry.loading;
  }

  function syncSlots() {
    for (const [kind, entry] of windows) {
      try {
        requireFeatureGate(featureId);
        const next = resolveOutputWindowSurface(
          kind,
          getOutputStatus(),
          getSlot(kind),
        );
        if (next.url !== entry.surface.url) {
          closeEntry(kind, entry);
          continue;
        }
        if (
          next.width !== entry.surface.width ||
          next.height !== entry.surface.height
        ) {
          entry.window.setContentSize(next.width, next.height, false);
        }
        entry.surface = next;
      } catch (error) {
        reportFailure(kind, entry, error);
      }
    }
  }

  return {
    open,
    closeAll,
    syncSlots,
    attachMainWindow: (mainWindow) => mainWindow.once('closed', closeAll),
  };
}

module.exports = { createOutputWindowManager, resolveOutputWindowSurface };
