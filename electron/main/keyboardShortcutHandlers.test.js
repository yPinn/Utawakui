import { describe, expect, it, vi } from 'vitest';
import { registerKeyboardShortcutHandlers } from './keyboardShortcutHandlers.js';

function fixture(options = {}) {
  const handlers = {};
  const webContents = { mainFrame: {} };
  const store = {
    get: vi.fn().mockReturnValue({ status: 'ready' }),
    set: vi.fn().mockReturnValue({ status: 'conflict' }),
  };
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  let window = { webContents, isDestroyed: () => false };
  registerKeyboardShortcutHandlers({
    ipcMain: { handle: (name, handler) => (handlers[name] = handler) },
    getMainWindow: () => window,
    store,
    recordDiagnostic,
    ...options,
  });
  return {
    handlers,
    store,
    recordDiagnostic,
    event: { sender: webContents, senderFrame: webContents.mainFrame },
    close: () => (window = null),
  };
}
describe('machine shortcut IPC', () => {
  it('keeps operational receiver failures private and records them through the existing IPC boundary', async () => {
    const f = fixture({
      receiver: {
        connect: () => {
          throw Error('E:/private/context');
        },
      },
    });
    const error = await f.handlers['keyboard-shortcuts:receiver-connect'](
      f.event,
    ).catch((value) => value);
    expect(error.message).not.toContain('private');
    expect(f.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'receiver-connect',
        error: expect.any(Error),
      }),
    );
  });
  it('restricts receiver registration, confirmation and one-time admission to the Main frame', async () => {
    const receiver = Object.fromEntries(
      ['connect', 'confirm', 'admit', 'release'].map((name) => [
        name,
        vi.fn(() => ({ status: 'ready' })),
      ]),
    );
    const f = fixture({ receiver });
    for (const name of Object.keys(receiver)) {
      const handler = f.handlers[`keyboard-shortcuts:receiver-${name}`];
      expect(await handler({ ...f.event, senderFrame: {} }, {})).toEqual({
        status: 'invalid-intent',
      });
      expect(receiver[name]).not.toHaveBeenCalled();
    }
    expect(
      await f.handlers['keyboard-shortcuts:receiver-connect'](f.event, {
        command: 'player.next',
      }),
    ).toEqual({ status: 'invalid-intent' });
    expect(
      await f.handlers['keyboard-shortcuts:receiver-connect'](f.event),
    ).toEqual({ status: 'ready' });
    expect(f.handlers['keyboard-shortcuts:execute']).toBeUndefined();
  });
  it('exposes only a payload-free Main-frame runtime snapshot and never accepts execution intents', async () => {
    const getRuntime = vi.fn(() => ({
      state: 'disabled',
      eligibleCommands: [],
    }));
    const f = fixture({ getRuntime });
    const handler = f.handlers['keyboard-shortcuts:runtime'];
    expect(await handler({ ...f.event, senderFrame: {} })).toEqual({
      status: 'invalid-intent',
    });
    expect(await handler(f.event, { globalEnabled: true })).toEqual({
      status: 'invalid-intent',
    });
    expect(getRuntime).not.toHaveBeenCalled();
    expect(await handler(f.event)).toEqual({
      state: 'disabled',
      eligibleCommands: [],
    });
    expect(f.handlers['keyboard-shortcuts:execute']).toBeUndefined();
  });
  it('accepts only the fixed Main frame, with no payload on read', async () => {
    const f = fixture();
    expect(Object.keys(f.handlers)).toEqual([
      'keyboard-shortcuts:get',
      'keyboard-shortcuts:set',
    ]);
    for (const handler of Object.values(f.handlers)) {
      expect(await handler({ ...f.event, senderFrame: {} }, {})).toEqual({
        status: 'invalid-intent',
      });
      expect(await handler({ ...f.event, sender: {} }, {})).toEqual({
        status: 'invalid-intent',
      });
    }
    expect(
      await f.handlers['keyboard-shortcuts:get'](f.event, { path: 'private' }),
    ).toEqual({ status: 'invalid-intent' });
    expect(f.store.get).not.toHaveBeenCalled();
    f.close();
    expect(await f.handlers['keyboard-shortcuts:get'](f.event)).toEqual({
      status: 'invalid-intent',
    });
  });
  it('delegates bounded persistence and retains private errors only in diagnostics', async () => {
    const f = fixture();
    expect(await f.handlers['keyboard-shortcuts:get'](f.event)).toEqual({
      status: 'ready',
    });
    expect(
      await f.handlers['keyboard-shortcuts:set'](f.event, {
        expectedRevision: null,
        configuration: {},
      }),
    ).toEqual({ status: 'conflict' });
    f.store.get.mockImplementation(() => {
      throw Error('E:/private/profile');
    });
    await expect(
      f.handlers['keyboard-shortcuts:get'](f.event),
    ).rejects.toThrow();
    const error = await f.handlers['keyboard-shortcuts:get'](f.event).catch(
      (e) => e,
    );
    expect(error.message).not.toContain('E:/private');
    expect(f.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'keyboard-shortcuts',
        error: expect.any(Error),
      }),
    );
  });
});
