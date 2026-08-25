export const APP_ERROR_PREFIX = 'UTAWAKUI_APP_ERROR:';

export const APP_ERROR_SEVERITIES = Object.freeze([
  'info',
  'success',
  'warning',
  'error',
]);

const DEFAULT_TITLES = Object.freeze({
  info: '需要注意',
  success: '已完成',
  warning: '需要確認',
  error: '發生錯誤',
});

const DEFAULT_PUBLIC_MESSAGE = '操作未完成，請稍後再試。';
const PUBLIC_CONTEXT_KEYS = new Set([
  'count',
  'diagnosticRecorded',
  'dependencyId',
  'featureId',
  'httpStatus',
  'presetId',
  'retryable',
  'stage',
  'status',
]);
const PUBLIC_TEXT_LIMITS = Object.freeze({
  title: 32,
  message: 120,
  actionLabel: 16,
});

function normalizeSeverity(severity, fallback = 'error') {
  return APP_ERROR_SEVERITIES.includes(severity) ? severity : fallback;
}

function parseStructuredMessage(message) {
  if (typeof message !== 'string') return null;
  const index = message.indexOf(APP_ERROR_PREFIX);
  if (index < 0) return null;

  const rawPayload = message.slice(index + APP_ERROR_PREFIX.length);
  try {
    const payload = JSON.parse(rawPayload);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function rawMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  return String(error);
}

function boundedPublicText(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function safePublicContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key, value]) =>
        PUBLIC_CONTEXT_KEYS.has(key) &&
        (typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' && value.length <= 80)),
    ),
  );
}

function createRecordId(source = 'app') {
  const suffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${source}-${suffix}`;
}

export function normalizeAppError(error, options = {}) {
  const parsed = parseStructuredMessage(rawMessage(error));
  const source = options.source || parsed?.source || 'app';
  const severity = normalizeSeverity(
    options.severity || parsed?.severity || error?.severity,
  );
  const code = options.code || parsed?.code || error?.code || 'UNKNOWN_ERROR';
  const message = boundedPublicText(
    options.message || parsed?.message,
    PUBLIC_TEXT_LIMITS.message,
    DEFAULT_PUBLIC_MESSAGE,
  );
  const title = boundedPublicText(
    options.title || parsed?.title,
    PUBLIC_TEXT_LIMITS.title,
    DEFAULT_TITLES[severity] || '發生錯誤',
  );

  return {
    id: options.id || createRecordId(source),
    code,
    severity,
    title,
    message,
    actionLabel: boundedPublicText(
      options.actionLabel || parsed?.actionLabel,
      PUBLIC_TEXT_LIMITS.actionLabel,
    ),
    source,
    operation: options.operation || parsed?.operation || '',
    context: safePublicContext({
      ...(parsed?.context || {}),
      ...(options.context || {}),
    }),
    createdAt: options.createdAt || new Date().toISOString(),
  };
}

export function appErrorTone(error) {
  if (!error) return 'muted';
  if (error.severity === 'error') return 'danger';
  return error.severity;
}

export function appErrorMessage(error) {
  return normalizeAppError(error).message;
}
