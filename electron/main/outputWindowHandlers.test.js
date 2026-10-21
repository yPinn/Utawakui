import { describe, expect, it, vi } from 'vitest';
import handlersModule from './outputWindowHandlers.js';
import policyModule from './ipcSenderPolicy.js';

const { registerOutputWindowHandlers } = handlersModule;
const { createTrustedIpcMain } = policyModule;

function setup() {
  const handlers = new Map();
  const main = { mainFrame: {}, isDestroyed: () => false };
  const performer = { mainFrame: {}, isDestroyed: () => false };
  const ipcMain = createTrustedIpcMain({
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      on: vi.fn(),
      removeHandler: vi.fn(),
    },
    getMainWebContents: () => main,
    getPerformerWebContents: () => performer,
  });
  const manager = { open: vi.fn(async () => ({ kind: 'lyrics' })) };
  const requireFeatureGate = vi.fn();
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerOutputWindowHandlers({
    ipcMain,
    manager,
    requireFeatureGate,
    featureId: 'public-output-flow',
    recordDiagnostic,
  });
  return {
    invoke: (sender = main, frame = sender.mainFrame, kind = 'lyrics') =>
      handlers.get('output-window:open')({ sender, senderFrame: frame }, kind),
    main,
    performer,
    manager,
    requireFeatureGate,
    recordDiagnostic,
  };
}
describe('output window IPC', () => {
  it('allows only the current main frame and keeps gate checks in main', async () => {
    const s = setup();
    await expect(s.invoke()).resolves.toEqual({ kind: 'lyrics' });
    expect(s.requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    await expect(s.invoke(s.performer)).rejects.toThrow('IPC_SENDER_UNTRUSTED');
    await expect(s.invoke(s.main, {})).rejects.toThrow('IPC_SENDER_UNTRUSTED');
    await expect(s.invoke({ mainFrame: {} })).rejects.toThrow(
      'IPC_SENDER_UNTRUSTED',
    );
    expect(s.manager.open).toHaveBeenCalledTimes(1);
  });
  it('does not log expected gate-disabled requests', async () => {
    const s = setup();
    s.requireFeatureGate.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(s.invoke()).rejects.toThrow('disabled');
    expect(s.manager.open).not.toHaveBeenCalled();
    expect(s.recordDiagnostic).not.toHaveBeenCalled();
  });
  it('records private causes and returns a bounded retryable error without URLs', async () => {
    const s = setup();
    const cause = new Error('failed http://127.0.0.1/private C:/private');
    s.manager.open.mockRejectedValue(cause);
    try {
      await s.invoke();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error.code).toBe('OUTPUT_WINDOW_OPEN_FAILED');
      expect(error.message).not.toContain('private');
      expect(error.context).toMatchObject({
        retryable: true,
        diagnosticRecorded: true,
      });
    }
    expect(s.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ error: cause }),
    );
  });
});
