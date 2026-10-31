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
    '[spout-output] Helper failure',
    {
      source: 'spout-output',
      operation: 'helper',
      code: 'SPOUT_OUTPUT_HELPER_FAILED',
      message: 'Spout output helper failed',
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
    '[lyrics] automatic acquisition failed',
    {
      source: 'lyrics',
      operation: 'lrclib-automatic-acquisition',
      code: 'LYRICS_LRCLIB_AUTOMATIC_ACQUISITION_FAILED',
      message: 'LRCLIB automatic acquisition failed',
    },
  ],
  [
    'Automatic music analysis failed',
    {
      source: 'audio-processing',
      operation: 'automatic-music-analysis',
      code: 'AUTOMATIC_MUSIC_ANALYSIS_FAILED',
      message: 'Automatic music analysis failed',
    },
  ],
]);

const FALLBACK_DEFINITION = Object.freeze({
  source: 'runtime',
  operation: 'service',
  code: 'RUNTIME_OPERATION_FAILED',
  message: 'Runtime operation failed',
});
const LABEL_RE = /^\[([a-z][a-z0-9-]*)\]\s+([A-Za-z][^\n]*)$/;

// Uncurated `[source] description` labels still get their own code and
// cooldown key; the labels are static strings, never user data.
function definitionFor(message) {
  const curated = EVENT_DEFINITIONS.get(message);
  if (curated) return curated;
  const match = typeof message === 'string' ? LABEL_RE.exec(message) : null;
  if (!match) return FALLBACK_DEFINITION;
  const description = match[2].replace(/:$/, '');
  const operation = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!operation) return FALLBACK_DEFINITION;
  return {
    source: match[1],
    operation,
    code: `${match[1]}_${operation}`
      .toUpperCase()
      .replace(/-/g, '_')
      .slice(0, 80)
      .replace(/_+$/, ''),
    message: description,
  };
}

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
    ...(['network', 'cooldown'].includes(context.stage)
      ? { stage: context.stage }
      : {}),
    ...(['background', 'interactive'].includes(context.status)
      ? { status: context.status }
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

    const definition = definitionFor(message);
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
    debug(message, metric) {
      if (
        [
          '[lyrics] background acquisition timing',
          '[lyrics] query timing',
        ].includes(message) &&
        Number.isSafeInteger(metric?.httpAttempts) &&
        metric.httpAttempts >= 0 &&
        metric.httpAttempts <= 12
      ) {
        const background = message === '[lyrics] background acquisition timing';
        try {
          service?.record?.({
            process: 'main',
            level: 'debug',
            source: 'lyrics',
            operation: background
              ? 'background-acquisition-summary'
              : 'query-summary',
            code: background
              ? 'LYRICS_BACKGROUND_ACQUISITION_SUMMARY'
              : 'LYRICS_QUERY_SUMMARY',
            message: 'Lyrics request budget summary',
            context: {
              count: metric.httpAttempts,
              durationMs: Number.isFinite(metric.durationMs)
                ? Math.max(0, Math.min(60000, Math.round(metric.durationMs)))
                : 0,
              status: background ? 'background' : 'interactive',
            },
          });
        } catch {
          /* Metrics cannot affect requests. */
        }
        return;
      }
      // A clean provider miss is operational evidence, not a warning. Only
      // this fixed summary is accepted; never serialize caller metadata.
      if (
        message !== '[lyrics] provider search timing' ||
        !['lrclib', 'netease', 'betterlyrics', 'kugou'].includes(
          metric?.provider,
        ) ||
        !['ok', 'error', 'unavailable'].includes(metric.status)
      )
        return;
      const context = {
        durationMs: Number.isFinite(metric.durationMs)
          ? Math.max(0, Math.min(60000, Math.round(metric.durationMs)))
          : 0,
        candidateCount: Number.isSafeInteger(metric.candidateCount)
          ? Math.max(0, Math.min(20, metric.candidateCount))
          : 0,
        status: metric.status,
        stage: metric.cacheHit === true ? 'cache' : 'discovery',
      };
      try {
        service?.record?.({
          process: 'main',
          level: 'debug',
          source: 'lyrics',
          operation: `${metric.provider}-search-summary`,
          code: `LYRICS_${metric.provider.toUpperCase()}_SEARCH_SUMMARY`,
          message: 'Lyrics provider search completed',
          context,
        });
      } catch {
        // Diagnostics must never affect acquisition.
      }
    },
    error: (message, error, context) => log('error', message, error, context),
    warn: (message, error, context) => log('warn', message, error, context),
  };
}

module.exports = {
  EVENT_DEFINITIONS,
  createRuntimeDiagnosticsLogger,
};
