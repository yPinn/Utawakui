import { describe, expect, it, vi } from 'vitest';
import { registerLibraryMetadataHandlers } from './libraryMetadataHandlers.js';

function setup(options = {}) {
  const handlers = new Map();
  const service = {
    organizeSaved: vi.fn(async () => ({ updated: 1 })),
    refreshFromSources: vi.fn(async () => ({ status: 'complete', updated: 1 })),
    cancel: vi.fn(() => ({ cancelling: true })),
  };
  const createMaintenance = vi.fn(() => service);
  const recordDiagnostic = vi.fn();
  const requireProvider = vi.fn();
  const send = vi.fn();
  const api = registerLibraryMetadataHandlers({
    ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
    getDirectory: () => ({ dir: 'library', epoch: 1 }),
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { send } }),
    requireProvider,
    recordDiagnostic,
    createMaintenance,
    ...options,
  });
  return {
    handlers,
    service,
    api,
    createMaintenance,
    recordDiagnostic,
    requireProvider,
    send,
  };
}

describe('library metadata IPC', () => {
  it('confines catalog and batch operations to the Main frame and leaves local unlink ungated', async () => {
    const webContents = { mainFrame: {}, send: vi.fn() };
    const methods = Object.fromEntries(
      [
        'refresh',
        'search',
        'preview',
        'accept',
        'unlink',
        'linkLocal',
        'cancel',
      ].map((key) => [key, vi.fn(async () => ({ status: 'ok' }))]),
    );
    const catalogPage = vi.fn(async () => ({ status: 'ok' }));
    const current = setup({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      catalogService: methods,
      releaseRuntime: { catalogPage, catalogDownload: catalogPage },
    });
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    for (const operation of [
      'page',
      'download',
      'refresh',
      'search',
      'preview',
      'accept',
      'unlink',
      'link-local',
    ]) {
      const handler = current.handlers.get(
        `library:release-catalog-${operation}`,
      );
      expect(
        await handler({ sender: webContents, senderFrame: {} }, {}),
      ).toEqual({ status: 'invalid-intent' });
      expect(await handler(event, {})).toEqual({ status: 'ok' });
    }
    expect(
      await current.handlers.get('library:refresh-release-metadata')({}),
    ).toEqual({ status: 'invalid-intent' });
    expect(
      await current.handlers.get('library:cancel-release-metadata')({}),
    ).toEqual({ status: 'invalid-intent' });
    current.requireProvider.mockImplementation(() => {
      throw Error('disabled');
    });
    expect(
      await current.handlers.get('library:release-catalog-search')(event, {}),
    ).toEqual({ status: 'disabled' });
    expect(
      await current.handlers.get('library:release-catalog-unlink')(event, {}),
    ).toEqual({ status: 'ok' });
    expect(current.recordDiagnostic).not.toHaveBeenCalled();
    expect(
      await current.handlers.get('library:release-catalog-download')(event, {}),
    ).toEqual({ status: 'ok' });
    methods.accept.mockRejectedValueOnce(
      Object.assign(Error('private path'), { code: 'RELEASE_INFO_CONFLICT' }),
    );
    current.requireProvider.mockReset();
    expect(
      await current.handlers.get('library:release-catalog-accept')(event, {}),
    ).toEqual({ status: 'conflict' });
  });
  it('does not require an open renderer or functioning diagnostics for offline recovery', async () => {
    for (const window of [null, { isDestroyed: () => true }]) {
      const current = setup({
        getMainWindow: () => window,
        recordDiagnostic: () => {
          throw Error('diagnostics unavailable');
        },
      });
      expect(() =>
        current.createMaintenance.mock.calls[0][0].onProgress({
          status: 'running',
        }),
      ).not.toThrow();
      current.service.organizeSaved.mockRejectedValueOnce(
        new Error('temporary lock'),
      );
      expect(await current.api.organizeSaved()).toEqual({ updated: 0 });
      expect(await current.api.organizeSaved()).toEqual({ updated: 1 });
    }
  });
  it('accepts no renderer source, path, or observations and rechecks the provider gate', async () => {
    const current = setup();
    const refresh = current.handlers.get('library:refresh-release-metadata');
    const cancel = current.handlers.get('library:cancel-release-metadata');
    for (const payload of [
      { dir: 'C:/private' },
      { source: { id: 'forged' } },
      null,
      {},
    ]) {
      expect(await refresh({}, payload)).toEqual({ status: 'invalid-intent' });
      expect(await cancel({}, payload)).toEqual({ status: 'invalid-intent' });
    }
    expect(current.service.refreshFromSources).not.toHaveBeenCalled();
    current.requireProvider.mockImplementationOnce(() => {
      throw new Error('disabled');
    });
    expect(await refresh({})).toEqual({ status: 'disabled' });
    expect(current.recordDiagnostic).not.toHaveBeenCalled();
    expect(await refresh({})).toMatchObject({ status: 'complete' });
    expect(current.service.refreshFromSources).toHaveBeenCalledOnce();
    expect(cancel({})).toEqual({ cancelling: true });
  });
  it('projects progress to the main window and keeps offline listing available on failure', async () => {
    const current = setup();
    const dependencies = current.createMaintenance.mock.calls[0][0];
    const progress = {
      status: 'running',
      libraryEpoch: 1,
      total: 2,
      completed: 1,
      updated: 1,
      unresolved: 0,
    };
    dependencies.onProgress(progress);
    expect(current.send).toHaveBeenCalledWith(
      'library:release-metadata-progress',
      progress,
    );
    current.service.organizeSaved.mockRejectedValueOnce(
      new Error('private sidecar'),
    );
    expect(await current.api.organizeSaved()).toEqual({ updated: 0 });
    expect(current.recordDiagnostic).toHaveBeenCalledOnce();
  });
  it('returns bounded errors instead of paths, URLs, or provider errors', async () => {
    const current = setup();
    current.service.refreshFromSources.mockRejectedValueOnce(
      new Error('C:/private/token https://private.test'),
    );
    await expect(
      current.handlers.get('library:refresh-release-metadata')({}),
    ).rejects.toThrow('目前無法更新發行資訊');
    expect(current.recordDiagnostic).toHaveBeenCalledOnce();
  });
});
