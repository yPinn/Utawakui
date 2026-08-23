'use strict';

const DEFAULT_COOLDOWN_MS = 60_000;

const EVENT_DEFINITIONS = new Map([
  [
    '[output] Automatic startup failed',
    {
      source: 'output',
      operation: 'automatic-start',
      code: 'OUTPUT_AUTOMATIC_START_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[startup] Deferred migration failed',
    {
      source: 'startup',
      operation: 'deferred-migration',
      code: 'STARTUP_DEFERRED_MIGRATION_FAILED',
      message: 'Deferred startup migration failed',
    },
  ],
  [
    '[output] Failed to stop output runtime',
    {
      source: 'output',
      operation: 'shutdown',
      code: 'OUTPUT_SHUTDOWN_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[output] Failed to restore previous output settings',
    {
      source: 'output',
      operation: 'settings-rollback',
      code: 'OUTPUT_SETTINGS_ROLLBACK_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[output] Failed to read artwork asset',
    {
      source: 'output',
      operation: 'artwork-read',
      code: 'OUTPUT_ARTWORK_READ_FAILED',
      message: 'Output asset read failed',
    },
  ],
  [
    '[output] Failed to read overlay asset',
    {
      source: 'output',
      operation: 'overlay-asset-read',
      code: 'OUTPUT_OVERLAY_ASSET_READ_FAILED',
      message: 'Output asset read failed',
    },
  ],
  [
    '[output] HTTP request failed',
    {
      source: 'output',
      operation: 'http-request',
      code: 'OUTPUT_HTTP_REQUEST_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[output] WebSocket server error',
    {
      source: 'output',
      operation: 'websocket-server',
      code: 'OUTPUT_WEBSOCKET_SERVER_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[output] WebSocket client error',
    {
      source: 'output',
      operation: 'websocket-client',
      code: 'OUTPUT_WEBSOCKET_CLIENT_FAILED',
      message: 'Output runtime operation failed',
    },
  ],
  [
    '[lyrics] LRCLIB search failed',
    {
      source: 'lyrics',
      operation: 'lrclib-search',
      code: 'LYRICS_LRCLIB_SEARCH_FAILED',
      message: 'LRCLIB search failed',
    },
  ],
  [
    '[lyrics] LRCLIB save failed',
    {
      source: 'lyrics',
      operation: 'lrclib-save',
      code: 'LYRICS_LRCLIB_SAVE_FAILED',
      message: 'LRCLIB save failed',
    },
  ],
  [
    '[lyrics] LRCLIB fetch failed',
    {
      source: 'lyrics',
      operation: 'lrclib-fetch',
      code: 'LYRICS_LRCLIB_FETCH_FAILED',
      message: 'LRCLIB fetch failed',
    },
  ],
  [
    '[lyrics] LRCLIB automatic acquisition failed',
    {
      source: 'lyrics',
      operation: 'lrclib-automatic-acquisition',
      code: 'LYRICS_LRCLIB_AUTOMATIC_ACQUISITION_FAILED',
      message: 'LRCLIB automatic acquisition failed',
    },
  ],
]);

const FALLBACK_DEFINITION = Object.freeze({
  source: 'runtime',
  operation: 'service',
  code: 'RUNTIME_OPERATION_FAILED',
  message: 'Runtime operation failed',
});

function normalizeError(value) {
  if (value instanceof Error) return value;
  if (value === undefined || value === null) return null;
  return new Error(String(value));
}

function normalizeRuntimeContext(value) {
  const context =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...(typeof context.reason === 'string' ? { reason: context.reason } : {}),
    ...(Number.isInteger(context.httpStatus)
      ? { httpStatus: context.httpStatus }
      : {}),
    retryable:
      typeof context.retryable === 'boolean' ? context.retryable : true,
  };
}

function createRuntimeDiagnosticsLogger({
  service,
  consoleTarget = console,
  now = Date.now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
} = {}) {
  const lastRecordedAt = new Map();

  function log(level, message, error, context) {
    consoleTarget?.[level]?.(message, error);
    if (typeof service?.record !== 'function') return;

    const definition = EVENT_DEFINITIONS.get(message) ?? FALLBACK_DEFINITION;
    const timestamp = Number(now());
    const key = `${definition.source}:${definition.operation}`;
    const previousTimestamp = lastRecordedAt.get(key);
    if (
      previousTimestamp !== undefined &&
      Number.isFinite(timestamp) &&
      timestamp - previousTimestamp < cooldownMs
    ) {
      return;
    }
    if (Number.isFinite(timestamp)) lastRecordedAt.set(key, timestamp);

    try {
      service.record({
        process: 'main',
        level: level === 'warn' ? 'warning' : 'error',
        source: definition.source,
        operation: definition.operation,
        code: definition.code,
        message: definition.message,
        error: normalizeError(error),
        context: normalizeRuntimeContext(context),
      });
    } catch {
      // Diagnostics must never become a second runtime failure.
    }
  }

  return {
    error: (message, error, context) => log('error', message, error, context),
    warn: (message, error, context) => log('warn', message, error, context),
  };
}

module.exports = {
  createRuntimeDiagnosticsLogger,
};
