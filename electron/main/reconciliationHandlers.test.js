import { expect, it, vi } from 'vitest';
import { registerReconciliationHandlers } from './reconciliationHandlers.js';
function setup() {
  const handlers = new Map(),
    webContents = { mainFrame: {}, send: vi.fn() };
  const service = Object.fromEntries(
    [
      'scan',
      'page',
      'preview',
      'commit',
      'decide',
      'undo',
      'cancel',
      'recover',
    ].map((k) => [k, vi.fn(async () => ({ status: 'ready' }))]),
  );
  const recordDiagnostic = vi.fn();
  registerReconciliationHandlers({
    ipcMain: { handle: (c, fn) => handlers.set(c, fn) },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }),
    service,
    recordDiagnostic,
  });
  return {
    handlers,
    service,
    recordDiagnostic,
    event: { sender: webContents, senderFrame: webContents.mainFrame },
  };
}
it('limits every operation to the main frame and uses fixed channels', async () => {
  const { handlers, service, event } = setup();
  for (const operation of [
    'scan',
    'page',
    'preview',
    'commit',
    'decide',
    'undo',
    'cancel',
    'recover',
  ]) {
    const handle = handlers.get(`library:reconciliation-${operation}`);
    expect(await handle({ sender: event.sender, senderFrame: {} }, {})).toEqual(
      { status: 'invalid-intent' },
    );
    expect(service[operation]).not.toHaveBeenCalled();
    expect(await handle(event, undefined)).toEqual({ status: 'ready' });
  }
});
it('returns bounded conflict/recovery statuses and logs private operational context once', async () => {
  const { handlers, service, event, recordDiagnostic } = setup();
  const handle = handlers.get('library:reconciliation-commit');
  service.commit.mockRejectedValueOnce(
    Object.assign(Error('C:/private/path'), {
      code: 'RECONCILIATION_CONFLICT',
    }),
  );
  expect(await handle(event, {})).toEqual({ status: 'conflict' });
  expect(recordDiagnostic).not.toHaveBeenCalled();
  service.commit.mockRejectedValueOnce(
    Object.assign(Error('private provider body'), { code: 'EPERM' }),
  );
  const response = await handle(event, {});
  expect(response).toEqual({ status: 'unavailable' });
  expect(recordDiagnostic).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(response)).not.toContain('private');
  service.commit.mockRejectedValueOnce(
    Object.assign(Error('journal'), {
      code: 'RECONCILIATION_RECOVERY_REQUIRED',
    }),
  );
  expect(await handle(event, {})).toEqual({ status: 'recovery-required' });
});
