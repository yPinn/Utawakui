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

function createRuntimeDiagnosticsLogger({
  service,
  consoleTarget = console,
  now = Date.now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
} = {}) {
  const lastRecordedAt = new Map();

  function log(level, message, error) {
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
        context: { retryable: true },
      });
    } catch {
      // Diagnostics must never become a second runtime failure.
    }
  }

  return {
    error: (message, error) => log('error', message, error),
    warn: (message, error) => log('warn', message, error),
  };
}

module.exports = {
  createRuntimeDiagnosticsLogger,
};
