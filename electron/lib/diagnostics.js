'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIAGNOSTIC_SCHEMA_VERSION = 1;
const DEFAULT_FILE_NAME = 'diagnostics.jsonl';
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_ROTATIONS = 5;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_CONTEXT_STRING_LENGTH = 200;
const MAX_IDENTIFIER_LENGTH = 80;
const MAX_ID_LENGTH = 120;

const LEVELS = new Set(['debug', 'info', 'warning', 'error']);
const PROCESSES = new Set(['main', 'renderer', 'worker', 'overlay']);
const CONTEXT_KEYS = Object.freeze([
  'appVersion',
  'channel',
  'count',
  'dependencyId',
  'durationMs',
  'electronVersion',
  'errorCode',
  'errno',
  'errorName',
  'exitCode',
  'fatal',
  'failureCount',
  'featureId',
  'httpStatus',
  'inputCount',
  'presetId',
  'processType',
  'candidateCount',
  'reason',
  'retryable',
  'signal',
  'stage',
  'status',
  'successCount',
  'vueInfo',
]);

const SAFE_IDENTIFIER_RE = /^[a-z][a-z0-9-]*$/;
const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl$/;

function boundedString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function redactText(value, maxLength = MAX_MESSAGE_LENGTH) {
  let text = boundedString(value, maxLength * 2);
  if (!text) return '';

  // URLs are removed before path matching so `https://...` is not mistaken
  // for a POSIX path. The whole URL is private: query strings and fragments
  // routinely carry provider ids, search text, or credentials.
  text = text.replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g, '[url]');
  // Filesystem errors commonly quote paths, which lets us safely redact the
  // complete value even when directory or filenames contain spaces.
  text = text.replace(
    /(["'])(?:(?:[A-Za-z]:\\|\\\\)[^"'\r\n]*|\/(?:Users|home|var|tmp|opt|etc|mnt|media|Volumes)\/[^"'\r\n]*)\1/g,
    '[path]',
  );
  // UNC paths first, then ordinary drive-letter paths. These intentionally
  // stop at whitespace: logging call sites must provide categorical messages,
  // and this remains a final defense rather than a path parser.
  text = text.replace(/\\\\[^\\\s]+\\[^\s"'<>]+/g, '[path]');
  text = text.replace(/[A-Za-z]:\\[^\s"'<>]+/g, '[path]');
  // Common absolute POSIX roots. Preserve the leading delimiter so stack
  // formatting and prose remain readable.
  text = text.replace(
    /(^|[\s(])\/(?:Users|home|var|tmp|opt|etc|mnt|media|Volumes)\/[^\s"'<>)]*/g,
    '$1[path]',
  );
  return text.slice(0, maxLength);
}

function safeIdentifier(value, fallback) {
  const text = boundedString(value, MAX_IDENTIFIER_LENGTH);
  return SAFE_IDENTIFIER_RE.test(text) ? text : fallback;
}

function safeCode(value) {
  const text = boundedString(value, MAX_IDENTIFIER_LENGTH);
  return SAFE_CODE_RE.test(text) ? text : 'UNKNOWN_ERROR';
}

function safeId(value, fallback) {
  const text = boundedString(value, MAX_ID_LENGTH);
  return SAFE_ID_RE.test(text) ? text : fallback;
}

function safeContextValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const text = redactText(value, MAX_CONTEXT_STRING_LENGTH);
  return text || undefined;
}

function normalizeContext(context, error) {
  const source =
    context && typeof context === 'object' && !Array.isArray(context)
      ? context
      : {};
  const withErrorName =
    error && typeof error === 'object' && typeof error.name === 'string'
      ? { ...source, errorName: error.name }
      : source;
  const normalized = {};
  for (const key of CONTEXT_KEYS) {
    const value = safeContextValue(withErrorName[key]);
    if (value !== undefined) normalized[key] = value;
  }
  return normalized;
}

function authoritativeContext(defaults) {
  return {
    ...(typeof defaults.appVersion === 'string'
      ? { appVersion: defaults.appVersion }
      : {}),
    ...(typeof defaults.electronVersion === 'string'
      ? { electronVersion: defaults.electronVersion }
      : {}),
  };
}

function normalizeTimestamp(now) {
  const value = typeof now === 'function' ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function defaultIdGenerator() {
  return crypto.randomUUID();
}

function normalizeDiagnosticEvent(input = {}, defaults = {}) {
  const event = input && typeof input === 'object' ? input : {};
  const timestamp = normalizeTimestamp(defaults.now);
  const generatedId =
    typeof defaults.idGenerator === 'function'
      ? defaults.idGenerator()
      : defaultIdGenerator();
  const id = safeId(generatedId, `event-${Date.parse(timestamp)}`);
  const defaultProcess = PROCESSES.has(defaults.process)
    ? defaults.process
    : 'main';
  const processName = PROCESSES.has(event.process)
    ? event.process
    : defaultProcess;
  const error =
    event.error && typeof event.error === 'object' ? event.error : null;
  const rawMessage =
    typeof event.message === 'string'
      ? event.message
      : typeof error?.message === 'string'
        ? error.message
        : 'Diagnostic event';
  const sessionId = safeId(defaults.sessionId, 'local-session');
  const correlationId = safeId(event.correlationId, id);
  const normalized = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    id,
    timestamp,
    level: LEVELS.has(event.level) ? event.level : 'error',
    process: processName,
    source: safeIdentifier(event.source, 'app'),
    operation: safeIdentifier(event.operation, 'unknown'),
    code: safeCode(event.code),
    message: redactText(rawMessage) || 'Diagnostic event',
    sessionId,
    correlationId,
    context: normalizeContext(
      { ...(event.context || {}), ...authoritativeContext(defaults) },
      error,
    ),
  };

  if (typeof error?.stack === 'string') {
    const stack = redactText(error.stack, MAX_STACK_LENGTH);
    if (stack) normalized.stack = stack;
  }
  return normalized;
}

function serializeDiagnosticEvent(event) {
  return `${JSON.stringify(event)}\n`;
}

function isStoredDiagnosticEvent(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION &&
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    LEVELS.has(value.level) &&
    PROCESSES.has(value.process) &&
    typeof value.source === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.correlationId === 'string' &&
    value.context &&
    typeof value.context === 'object' &&
    !Array.isArray(value.context),
  );
}

function sanitizeStoredDiagnosticEvent(value) {
  if (!isStoredDiagnosticEvent(value)) return null;
  const timestamp = new Date(value.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  const event = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    id: safeId(value.id, 'stored-event'),
    timestamp: timestamp.toISOString(),
    level: value.level,
    process: value.process,
    source: safeIdentifier(value.source, 'app'),
    operation: safeIdentifier(value.operation, 'unknown'),
    code: safeCode(value.code),
    message: redactText(value.message) || 'Diagnostic event',
    sessionId: safeId(value.sessionId, 'local-session'),
    correlationId: safeId(value.correlationId, 'stored-event'),
    context: normalizeContext(value.context),
  };
  if (typeof value.stack === 'string') {
    const stack = redactText(value.stack, MAX_STACK_LENGTH);
    if (stack) event.stack = stack;
  }
  return event;
}

function parseDiagnosticJsonLines(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = sanitizeStoredDiagnosticEvent(JSON.parse(line));
      if (event) events.push(event);
    } catch {
      // A crash may leave the final append partial. Diagnostics must remain
      // readable without recursively trying to log their own parse warning.
    }
  }
  return events;
}

function errorCode(error, fallback = 'DIAGNOSTICS_IO_FAILED') {
  return typeof error?.code === 'string' ? error.code : fallback;
}

function validateServiceOptions(options, pathApi) {
  if (typeof options.logsDir !== 'string' || options.logsDir.length === 0) {
    throw new TypeError('diagnostics logsDir is required');
  }
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;
  if (
    pathApi.basename(fileName) !== fileName ||
    !SAFE_FILE_NAME_RE.test(fileName)
  ) {
    throw new TypeError('diagnostics fileName must be a safe JSONL basename');
  }
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) {
    throw new TypeError('diagnostics maxFileBytes must be a positive integer');
  }
  const maxRotations = options.maxRotations ?? DEFAULT_MAX_ROTATIONS;
  if (!Number.isSafeInteger(maxRotations) || maxRotations < 0) {
    throw new TypeError(
      'diagnostics maxRotations must be a non-negative integer',
    );
  }
  return { fileName, maxFileBytes, maxRotations };
}

function createDiagnosticsService(options = {}) {
  const fsApi = options.fs ?? fs;
  const pathApi = options.path ?? path;
  const { fileName, maxFileBytes, maxRotations } = validateServiceOptions(
    options,
    pathApi,
  );
  const logsDir = pathApi.resolve(options.logsDir);
  const activePath = pathApi.join(logsDir, fileName);
  const parsed = pathApi.parse(fileName);

  function rotationPath(index) {
    return pathApi.join(logsDir, `${parsed.name}.${index}${parsed.ext}`);
  }

  function managedPaths() {
    return [
      activePath,
      ...Array.from({ length: maxRotations }, (_, index) =>
        rotationPath(index + 1),
      ),
    ];
  }

  function rotateIfNeeded(nextBytes) {
    if (!fsApi.existsSync(activePath)) return;
    const currentBytes = fsApi.statSync(activePath).size;
    if (currentBytes === 0 || currentBytes + nextBytes <= maxFileBytes) return;

    if (maxRotations === 0) {
      fsApi.unlinkSync(activePath);
      return;
    }
    const oldestPath = rotationPath(maxRotations);
    if (fsApi.existsSync(oldestPath)) fsApi.unlinkSync(oldestPath);
    for (let index = maxRotations - 1; index >= 1; index -= 1) {
      const from = rotationPath(index);
      if (fsApi.existsSync(from))
        fsApi.renameSync(from, rotationPath(index + 1));
    }
    fsApi.renameSync(activePath, rotationPath(1));
  }

  function record(input) {
    let event;
    try {
      event = normalizeDiagnosticEvent(input, options);
    } catch (error) {
      return {
        ok: false,
        errorCode: errorCode(error, 'DIAGNOSTICS_NORMALIZE_FAILED'),
      };
    }
    const line = serializeDiagnosticEvent(event);
    try {
      fsApi.mkdirSync(logsDir, { recursive: true });
      rotateIfNeeded(Buffer.byteLength(line));
      fsApi.appendFileSync(activePath, line, 'utf8');
      return { ok: true, event };
    } catch (error) {
      return { ok: false, event, errorCode: errorCode(error) };
    }
  }

  function listRecent(limit = 100) {
    const safeLimit = Number.isSafeInteger(limit)
      ? Math.min(1000, Math.max(0, limit))
      : 100;
    if (safeLimit === 0) return [];
    const pathsInChronologicalOrder = [
      ...Array.from({ length: maxRotations }, (_, index) =>
        rotationPath(maxRotations - index),
      ),
      activePath,
    ];
    const events = [];
    for (const filePath of pathsInChronologicalOrder) {
      try {
        if (!fsApi.existsSync(filePath)) continue;
        events.push(
          ...parseDiagnosticJsonLines(fsApi.readFileSync(filePath, 'utf8')),
        );
      } catch {
        // One unreadable rotation must not hide the other usable records.
      }
    }
    return events.slice(-safeLimit).reverse();
  }

  function clear() {
    let removed = 0;
    let firstErrorCode = null;
    for (const filePath of managedPaths()) {
      try {
        if (!fsApi.existsSync(filePath)) continue;
        fsApi.unlinkSync(filePath);
        removed += 1;
      } catch (error) {
        firstErrorCode ??= errorCode(error);
      }
    }
    return firstErrorCode
      ? { ok: false, removed, errorCode: firstErrorCode }
      : { ok: true, removed };
  }

  return {
    clear,
    getActivePath: () => activePath,
    listRecent,
    record,
  };
}

module.exports = {
  DIAGNOSTIC_SCHEMA_VERSION,
  createDiagnosticsService,
  normalizeDiagnosticEvent,
  parseDiagnosticJsonLines,
  redactText,
  serializeDiagnosticEvent,
};
