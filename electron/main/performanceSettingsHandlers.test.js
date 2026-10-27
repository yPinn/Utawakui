import { describe, expect, it, vi } from 'vitest';
import { registerPerformanceSettingsHandlers } from './performanceSettingsHandlers.js';

function fixture() {
  const handlers = {};
  const webContents = { mainFrame: {} };
  const runtime = {
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
    setDefault: vi.fn(),
    verifySource: vi.fn(),
  };
  const recordDiagnostic = vi.fn();
  registerPerformanceSettingsHandlers({
    ipcMain: {
      handle: (name, handler) => {
        handlers[name] = handler;
      },
    },
    getMainWindow: () => ({ webContents, isDestroyed: () => false }),
    runtime,
    recordDiagnostic,
  });
  return {
    handlers,
    runtime,
    recordDiagnostic,
    event: { sender: webContents, senderFrame: webContents.mainFrame },
  };
}
describe('performance settings IPC', () => {
  it('only accepts track id and an opaque token for the read-only source proof', async () => {
    const f = fixture(),
      token = '12345678-1234-1234-1234-123456789abc';
    f.runtime.verifySource.mockResolvedValue({ status: 'equivalent' });
    const verify = f.handlers['library:performance-settings-verify-source'];
    expect(
      await verify(f.event, { trackId: 'one', token, path: 'private' }),
    ).toEqual({ status: 'invalid-intent' });
    expect(await verify(f.event, { trackId: 'one', token })).toEqual({
      status: 'equivalent',
    });
    expect(f.runtime.verifySource).toHaveBeenCalledOnce();
  });
  it('uses fixed channels and rejects foreign frames before invoking service', async () => {
    const f = fixture();
    expect(Object.keys(f.handlers)).toHaveLength(6);
    for (const handler of Object.values(f.handlers)) {
      expect(await handler({ ...f.event, senderFrame: {} }, {})).toEqual({
        status: 'invalid-intent',
      });
    }
    expect(f.runtime.get).not.toHaveBeenCalled();
  });
  it('maps operational failures to bounded statuses with private diagnostics', async () => {
    const f = fixture();
    f.runtime.get.mockRejectedValue(new Error('E:/private/audio.wav'));
    expect(
      await f.handlers['library:performance-settings-get'](f.event, {
        trackId: 'one',
      }),
    ).toEqual({ status: 'unavailable' });
    expect(f.recordDiagnostic).toHaveBeenCalledOnce();
    f.runtime.get.mockRejectedValue({ code: 'PERFORMANCE_CONFLICT' });
    expect(
      await f.handlers['library:performance-settings-get'](f.event, {
        trackId: 'one',
      }),
    ).toEqual({ status: 'conflict' });
  });
  it('rejects oversized or extra fields before service work', async () => {
    const f = fixture();
    const get = f.handlers['library:performance-settings-get'];
    expect(await get(f.event, { trackId: 'one', path: 'C:/private' })).toEqual({
      status: 'invalid-intent',
    });
    expect(f.runtime.get).not.toHaveBeenCalled();
    f.runtime.get.mockResolvedValue({ status: 'absent', values: null });
    expect(await get(f.event, { trackId: 'one' })).toEqual({
      status: 'absent',
      values: null,
    });
  });
});
