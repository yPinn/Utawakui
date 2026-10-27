'use strict';

const { isBoundedTrackId } = require('../lib/library/paths');
const {
  validPerformanceSettings,
  validPerformanceSlot,
} = require('../../shared/performanceSettings.mjs');
const STATUS = Object.freeze({
  PERFORMANCE_INVALID: 'invalid-intent',
  PERFORMANCE_INVALID_DATA: 'invalid',
  PERFORMANCE_UNSUPPORTED: 'unsupported',
  PERFORMANCE_STALE: 'stale',
  PERFORMANCE_CONFLICT: 'conflict',
  PERFORMANCE_SOURCE_STALE: 'source-stale',
  PERFORMANCE_NOT_FOUND: 'not-found',
  PERFORMANCE_TIMEOUT: 'timeout',
  RECONCILIATION_RECOVERY_REQUIRED: 'recovery-required',
});
const token = (value) =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
function valid(input, operation) {
  const fields =
    operation === 'cancel'
      ? ['token']
      : operation === 'get'
        ? ['trackId']
        : [
            'trackId',
            'token',
            'expectedRevision',
            'slot',
            ...(operation === 'save' ? ['values'] : []),
          ];
  return Boolean(
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).length === fields.length &&
    fields.every((key) => Object.hasOwn(input, key)) &&
    (operation === 'cancel'
      ? token(input.token)
      : isBoundedTrackId(input.trackId) &&
        (operation === 'get' ||
          (token(input.token) &&
            validPerformanceSlot(input.slot) &&
            (input.expectedRevision === null ||
              token(input.expectedRevision)) &&
            (operation !== 'save' || validPerformanceSettings(input.values))))),
  );
}
function registerPerformanceSettingsHandlers({
  ipcMain,
  getMainWindow,
  runtime,
  recordDiagnostic,
}) {
  for (const operation of ['get', 'save', 'remove', 'cancel', 'setDefault']) {
    ipcMain.handle(
      `library:performance-settings-${operation === 'setDefault' ? 'set-default' : operation}`,
      async (event, input) => {
        const window = getMainWindow();
        if (
          !window ||
          window.isDestroyed() ||
          event?.sender !== window.webContents ||
          event?.senderFrame !== window.webContents.mainFrame ||
          !valid(input, operation)
        )
          return { status: 'invalid-intent' };
        try {
          return await runtime[operation](input);
        } catch (error) {
          if (!STATUS[error.code]) {
            try {
              recordDiagnostic?.({
                process: 'main',
                level: 'warning',
                source: 'performance-settings',
                operation,
                code: 'PERFORMANCE_SETTINGS_FAILED',
                error,
              });
            } catch {
              /* Closed diagnostics cannot alter the persistence outcome. */
            }
          }
          return { status: STATUS[error.code] ?? 'unavailable' };
        }
      },
    );
  }
}
module.exports = { registerPerformanceSettingsHandlers };
