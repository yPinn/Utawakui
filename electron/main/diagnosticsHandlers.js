'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson } = require('../lib/atomicWrite');
const { buildDiagnosticsSupportBundle } = require('../lib/diagnosticsExport');

const DEFAULT_RECENT_LIMIT = 100;
const MAX_RECENT_LIMIT = 500;
const DEFAULT_RENDERER_EVENTS_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_RENDERER_STACK_LENGTH = 4000;
// Matches the diagnostics log rotation size; larger files are not exports.
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

async function readBoundedText(filePath) {
  const { size } = await fs.promises.stat(filePath);
  if (size > MAX_BUNDLE_BYTES) throw new Error('bundle too large');
  return fs.promises.readFile(filePath, 'utf8');
}

function boundedRecentLimit(value) {
  if (!Number.isInteger(value)) return DEFAULT_RECENT_LIMIT;
  return Math.min(Math.max(value, 1), MAX_RECENT_LIMIT);
}

function rebuildRendererEvent(payload) {
  const event =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};
  return {
    process: 'renderer',
    level: event.level,
    source: event.source,
    operation: event.operation,
    code: event.code,
    message: event.message,
    correlationId: event.correlationId,
    context: event.context,
    // Only the stack string crosses; the service redacts it and rewrites
    // bundle frames to app:<path> for local triage and report fingerprints.
    ...(typeof event.stack === 'string' && event.stack
      ? { error: { stack: event.stack.slice(0, MAX_RENDERER_STACK_LENGTH) } }
      : {}),
  };
}

function toPublicDiagnosticEvent(event) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    level: event.level,
    process: event.process,
    source: event.source,
    operation: event.operation,
    code: event.code,
    message: event.message,
    correlationId: event.correlationId,
    context: { ...event.context },
  };
}

function registerDiagnosticsHandlers({
  ipcMain,
  service,
  openLogsDirectory,
  now = Date.now,
  maxRendererEventsPerMinute = DEFAULT_RENDERER_EVENTS_PER_MINUTE,
  dialog,
  getMainWindow = () => null,
  appVersion = '',
  electronVersion = '',
  writeExportFile = (filePath, data) => atomicWriteJson(filePath, data),
  readBundleFile = readBoundedText,
}) {
  const rendererEventLimit =
    Number.isSafeInteger(maxRendererEventsPerMinute) &&
    maxRendererEventsPerMinute > 0
      ? maxRendererEventsPerMinute
      : DEFAULT_RENDERER_EVENTS_PER_MINUTE;
  let rendererWindowStartedAt = now();
  let rendererEventCount = 0;

  ipcMain.handle('diagnostics:record-renderer', async (event, payload) => {
    const currentTime = now();
    if (currentTime - rendererWindowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      rendererWindowStartedAt = currentTime;
      rendererEventCount = 0;
    }
    if (rendererEventCount >= rendererEventLimit) {
      return { ok: false, errorCode: 'DIAGNOSTICS_RATE_LIMITED' };
    }
    rendererEventCount += 1;
    const result = service.record(rebuildRendererEvent(payload));
    return result.ok
      ? { ok: true }
      : { ok: false, errorCode: result.errorCode };
  });

  ipcMain.handle('diagnostics:list-recent', async (event, limit) =>
    service.listRecent(boundedRecentLimit(limit)).map(toPublicDiagnosticEvent),
  );

  ipcMain.handle('diagnostics:clear', async () => service.clear());

  ipcMain.handle('diagnostics:open-folder', async () => {
    try {
      const errorMessage = await openLogsDirectory();
      return errorMessage
        ? { ok: false, errorCode: 'OPEN_LOGS_DIRECTORY_FAILED' }
        : { ok: true };
    } catch {
      return { ok: false, errorCode: 'OPEN_LOGS_DIRECTORY_FAILED' };
    }
  });

  // Renderer never supplies a path: the destination comes only from this
  // main-owned native save dialog. A cancelled dialog is expected control
  // flow, not a failure — it is neither recorded nor reported as one.
  ipcMain.handle('diagnostics:export', async () => {
    try {
      const ownerWindow = getMainWindow();
      const dialogOptions = {
        title: '匯出錯誤紀錄',
        defaultPath: `utawakui-diagnostics-${new Date(now())
          .toISOString()
          .replace(/[:.]/g, '-')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }

      const bundle = buildDiagnosticsSupportBundle({
        events: service.listRecent(MAX_RECENT_LIMIT),
        appVersion,
        electronVersion,
        exportedAt: new Date(now()).toISOString(),
      });
      writeExportFile(result.filePath, bundle);
      return { ok: true, cancelled: false };
    } catch {
      return { ok: false, errorCode: 'DIAGNOSTICS_EXPORT_FAILED' };
    }
  });

  // Dev-only triage reads an export chosen in a main-owned open dialog; the
  // renderer gets the file name and bounded text, never the path.
  ipcMain.handle('diagnostics:open-bundle', async () => {
    try {
      const ownerWindow = getMainWindow();
      const dialogOptions = {
        title: '載入錯誤紀錄匯出檔',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      const [filePath] = result.filePaths ?? [];
      if (result.canceled || !filePath) return { ok: true, cancelled: true };
      return {
        ok: true,
        cancelled: false,
        name: path.basename(filePath),
        text: await readBundleFile(filePath),
      };
    } catch {
      return { ok: false, errorCode: 'DIAGNOSTICS_BUNDLE_READ_FAILED' };
    }
  });
}

module.exports = {
  registerDiagnosticsHandlers,
  toPublicDiagnosticEvent,
};
