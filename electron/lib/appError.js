'use strict';

const APP_ERROR_PREFIX = 'UTAWAKUI_APP_ERROR:';

function serializeAppErrorPayload(payload) {
  return `${APP_ERROR_PREFIX}${JSON.stringify(payload)}`;
}

function createAppError({
  code,
  message,
  severity = 'error',
  title,
  actionLabel,
  context,
}) {
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
