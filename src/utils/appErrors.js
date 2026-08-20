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

function cleanMessage(message) {
  const parsed = parseStructuredMessage(message);
  if (parsed?.message) return parsed.message;
  return message || '請稍後再試一次。';
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
  const message = options.message || cleanMessage(rawMessage(error));
  const title =
    options.title || parsed?.title || DEFAULT_TITLES[severity] || '發生錯誤';

  return {
    id: options.id || createRecordId(source),
    code,
    severity,
    title,
    message,
    actionLabel: options.actionLabel || parsed?.actionLabel || '',
    source,
    operation: options.operation || parsed?.operation || '',
    context: {
      ...(parsed?.context || {}),
      ...(options.context || {}),
    },
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
