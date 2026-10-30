'use strict';

const APP_ERROR_PREFIX = 'UTAWAKUI_APP_ERROR:';

function serializeAppErrorPayload(payload) {
  return `${APP_ERROR_PREFIX}${JSON.stringify(payload)}`;
}

// Public errors with neither title nor message read errors.<CODE> from the UI
// catalog; callers passing either keep their explicit copy.
// Tests fail on a missing entry; packaged builds fall back to generic copy.
function catalogCopy(code, field) {
  const { hasMessage, t } = require('./i18n');
  const key = `errors.${code}.${field}`;
  if (hasMessage(key)) return t(key);
  if (process.env.VITEST) throw new Error(`Missing UI catalog entry: ${key}`);
  return t(`errors.UNKNOWN.${field}`);
}

function createAppError({
  code,
  message,
  severity = 'error',
  title,
  actionLabel,
  context,
}) {
  if (title === undefined && message === undefined) {
    title = catalogCopy(code, 'title');
    message = catalogCopy(code, 'message');
  }
  const payload = {
    code,
    severity,
    title,
    message,
    actionLabel,
    context,
  };
  const err = new Error(serializeAppErrorPayload(payload));
  err.code = code;
  err.severity = severity;
  err.title = title;
  err.publicMessage = message;
  err.actionLabel = actionLabel;
  err.context = context;
  return err;
}

module.exports = {
  APP_ERROR_PREFIX,
  createAppError,
  serializeAppErrorPayload,
};
