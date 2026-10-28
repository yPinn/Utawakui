'use strict';
const { isBoundedTrackId } = require('../lib/library/paths');
const ID = /^[a-f0-9-]{36}$/;
function valid(input, operation) {
  const keys =
    operation === 'read'
      ? ['trackId', 'requestId', 'kind', 'tileIndex']
      : [operation === 'clear' ? 'trackId' : 'requestId'];
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(input, key))
  )
    return false;
  if (operation === 'cancel')
    return typeof input.requestId === 'string' && ID.test(input.requestId);
  if (!isBoundedTrackId(input.trackId)) return false;
  if (operation === 'clear') return true;
  return (
    typeof input.requestId === 'string' &&
    ID.test(input.requestId) &&
    ['overview', 'detail'].includes(input.kind) &&
    Number.isInteger(input.tileIndex) &&
    input.tileIndex >= 0 &&
    input.tileIndex < 180 &&
    (input.kind !== 'overview' || input.tileIndex === 0)
  );
}
function publicStatus(error) {
  const code = error.code ?? error.message;
  if (/^(FEATURE_GATE_|feature gate required:)/.test(code))
    return 'gate-disabled';
  if (/^(FEATURE_DEPENDENCY_|DECODER_UNAVAILABLE)/.test(code))
    return 'decoder-unavailable';
  if (
    /^(PERFORMANCE_(NOT_FOUND|SOURCE_STALE)|WORKS_STALE|SOURCE_STALE|ENOENT)$/.test(
      code,
    )
  )
    return 'source-stale';
  return (
    {
      CANCELLED: 'cancelled',
      BUSY: 'busy',
      INVALID_INTENT: 'invalid-intent',
      METADATA_BUDGET: 'unsupported',
      DEADLINE: 'timeout',
    }[code] ?? null
  );
}
function registerWaveformHandlers({
  ipcMain,
  getMainWindow,
  runtime,
  recordDiagnostic,
}) {
  const attached = new WeakSet();
  for (const operation of ['read', 'cancel', 'clear'])
    ipcMain.handle(`waveform:${operation}`, async (event, input) => {
      const window = getMainWindow();
      if (
        !window ||
        window.isDestroyed() ||
        event?.sender !== window.webContents ||
        event?.senderFrame !== window.webContents.mainFrame ||
        !valid(input, operation)
      )
        return { status: 'invalid-intent' };
      if (!attached.has(event.sender)) {
        attached.add(event.sender);
        const invalidate = () => {
          void runtime.invalidate?.().catch(() => {});
        };
        event.sender.once?.('destroyed', invalidate);
        event.sender.on?.('render-process-gone', invalidate);
      }
      try {
        if (operation === 'read') return await runtime.read(input);
        await runtime[operation](
          input[operation === 'clear' ? 'trackId' : 'requestId'],
        );
        return { status: 'done' };
      } catch (error) {
        const status = publicStatus(error);
        if (status) return { status };
        let diagnosticRecorded = false;
        try {
          const recorded = recordDiagnostic?.({
            process: 'main',
            level: 'warning',
            source: 'waveform',
            operation,
            code: 'WAVEFORM_FAILED',
            error: error.privateDiagnostic
              ? new Error(error.privateDiagnostic, { cause: error })
              : error,
          });
          diagnosticRecorded = recorded?.ok === true;
        } catch {
          /* Closing diagnostics does not change cleanup. */
        }
        return { status: 'unavailable', diagnosticRecorded };
      }
    });
}
module.exports = { registerWaveformHandlers };
