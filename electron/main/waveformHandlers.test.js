import { expect, it, vi } from 'vitest';
import { registerWaveformHandlers } from './waveformHandlers.js';
function setup() {
  const handlers = new Map();
  const webContents = { mainFrame: {} };
  const runtime = {
    read: vi.fn(async () => ({ status: 'ready' })),
    cancel: vi.fn(),
    clear: vi.fn(),
  };
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerWaveformHandlers({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }),
    runtime,
    recordDiagnostic,
  });
  return {
    read: handlers.get('waveform:read'),
    cancel: handlers.get('waveform:cancel'),
    event: { sender: webContents, senderFrame: webContents.mainFrame },
    runtime,
    recordDiagnostic,
  };
}
const input = () => ({
  trackId: 'track',
  requestId: '12345678-1234-1234-1234-123456789abc',
  kind: 'overview',
  tileIndex: 0,
});
it('only accepts fixed bounded intents from the current main frame', async () => {
  const f = setup();
  expect(await f.read(null, input())).toEqual({ status: 'invalid-intent' });
  expect(await f.read({ ...f.event, senderFrame: {} }, input())).toEqual({
    status: 'invalid-intent',
  });
  for (const change of [
    { path: 'private' },
    { kind: 'other' },
    { tileIndex: 180 },
    { trackId: '../track' },
    { requestId: 'huge' },
  ])
    expect(await f.read(f.event, { ...input(), ...change })).toEqual({
      status: 'invalid-intent',
    });
  expect(f.runtime.read).not.toHaveBeenCalled();
  expect(await f.read(f.event, input())).toEqual({ status: 'ready' });
});
it('bounds public errors, records private failures once, and permits cancellation independently', async () => {
  const f = setup();
  f.runtime.read.mockRejectedValue(
    Object.assign(Error('private/path secret stderr'), {
      code: 'FEATURE_GATE_REQUIRED',
    }),
  );
  expect(await f.read(f.event, input())).toEqual({ status: 'gate-disabled' });
  expect(f.recordDiagnostic).not.toHaveBeenCalled();
  f.runtime.read.mockRejectedValue(
    Error('feature gate required: audio-processing-flow'),
  );
  expect(await f.read(f.event, input())).toEqual({ status: 'gate-disabled' });
  expect(f.recordDiagnostic).not.toHaveBeenCalled();
  f.runtime.read.mockRejectedValue(Error('private/path secret stderr'));
  expect(await f.read(f.event, input())).toEqual({
    status: 'unavailable',
    diagnosticRecorded: true,
  });
  expect(f.recordDiagnostic).toHaveBeenCalledOnce();
  expect(await f.cancel(f.event, { requestId: input().requestId })).toEqual({
    status: 'done',
  });
});
