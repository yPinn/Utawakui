'use strict';

const DEFAULT_RECENT_LIMIT = 100;
const MAX_RECENT_LIMIT = 500;
const DEFAULT_RENDERER_EVENTS_PER_MINUTE = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

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
}

module.exports = {
  registerDiagnosticsHandlers,
  toPublicDiagnosticEvent,
};
