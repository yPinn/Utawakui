import failureKindValues from '../../shared/failureKindValues.json';
import featureGateRegistry from '../../shared/featureGates.json';
import { t } from './i18n.js';
export const APP_ERROR_PREFIX = 'UTAWAKUI_APP_ERROR:';

export const APP_ERROR_SEVERITIES = Object.freeze([
  'info',
  'success',
  'warning',
  'error',
]);

const PUBLIC_CONTEXT_KEYS = new Set([
  'count',
  'correlationId',
  'diagnosticRecorded',
  'dependencyId',
  'failureKind',
  'featureId',
  'httpStatus',
  'presetId',
  'reason',
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

const FAILURE_KINDS = new Set(failureKindValues.kinds);

// Guidance for a cause main recognized; the title still names the operation.
function failureKindMessage(kind) {
  if (!FAILURE_KINDS.has(kind)) return '';
  return t(
    `common.appError.failureKind.${kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
  );
}

const FEATURE_GATE_IDS = new Set(
  featureGateRegistry.features.map((feature) => feature.id),
);

function gateFromPayload(parsed, error) {
  const featureId = parsed?.context?.featureId ?? error?.context?.featureId;
  return (parsed?.code ?? error?.code) === 'FEATURE_GATE_REQUIRED' &&
    FEATURE_GATE_IDS.has(featureId)
    ? featureId
    : null;
}

// The feature id when main refused the operation because its gate is off.
export function requiredFeatureGate(error) {
  return gateFromPayload(parseStructuredMessage(rawMessage(error)), error);
}

function safePublicContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key, value]) =>
        PUBLIC_CONTEXT_KEYS.has(key) &&
        (key !== 'failureKind' || FAILURE_KINDS.has(value)) &&
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
  const context = safePublicContext({
    ...(parsed?.context || {}),
    ...(options.context || {}),
  });
  const message = boundedPublicText(
    (gateFromPayload(parsed, error) &&
      t('featureGates.access.defaultReason')) ||
      failureKindMessage(context.failureKind) ||
      options.message ||
      parsed?.message,
    PUBLIC_TEXT_LIMITS.message,
    t('common.appError.message'),
  );
  const title = boundedPublicText(
    options.title || parsed?.title,
    PUBLIC_TEXT_LIMITS.title,
    t(
      `common.appError.${APP_ERROR_SEVERITIES.includes(severity) ? severity : 'error'}`,
    ),
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
    context,
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
