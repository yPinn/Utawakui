import { it, expect, vi } from 'vitest';
import { registerTagWritebackHandlers } from './tagWritebackHandlers.js';
it('allows only the main frame, fixed bounded intents and private diagnostics', async () => {
  const handlers = new Map(),
    webContents = { mainFrame: {} },
    diagnostic = vi.fn();
  const service = Object.fromEntries(
    [
      'options',
      'preview',
      'commit',
      'restore',
      'recover',
      'activity',
      'cancel',
    ].map((key) => [key, vi.fn(async () => ({ status: 'ready' }))]),
  );
  registerTagWritebackHandlers({
    ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }),
    service,
    recordDiagnostic: diagnostic,
  });
  for (const [key, fn] of handlers) {
    expect(await fn({ sender: webContents, senderFrame: {} }, {})).toEqual({
      status: 'invalid-intent',
    });
    expect(
      await fn(
        { sender: webContents, senderFrame: webContents.mainFrame },
        undefined,
      ),
    ).toEqual({ status: 'ready' });
    expect(key).toMatch(/^library:tags-/);
  }
  service.commit.mockRejectedValueOnce(
    Object.assign(Error('private path'), { code: 'TAGS_BUSY' }),
  );
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  expect(await handlers.get('library:tags-commit')(event, {})).toEqual({
    status: 'busy',
  });
  expect(diagnostic).not.toHaveBeenCalled();
  service.commit.mockRejectedValueOnce(Error('private file details'));
  expect(await handlers.get('library:tags-commit')(event, {})).toEqual({
    status: 'unavailable',
  });
  expect(diagnostic).toHaveBeenCalledTimes(1);
});
