'use strict';

const {
  createReleaseMetadataMaintenance,
} = require('../lib/releases/maintenance');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerLibraryMetadataHandlers({
  ipcMain,
  getDirectory,
  getMainWindow,
  requireProvider,
  notifyChanged,
  recordDiagnostic,
  createMaintenance = createReleaseMetadataMaintenance,
  catalogService = null,
  releaseRuntime = null,
}) {
  const recordFailure = (error) =>
    recordDiagnostic?.({
      process: 'main',
      level: 'warning',
      source: 'library-metadata',
      operation: 'refresh-releases',
      code: 'RELEASE_METADATA_REFRESH_FAILED',
      error,
    });
  const service = createMaintenance({
    getDirectory,
    requireProvider,
    notifyChanged,
    recordFailure,
    onProgress: (snapshot) => {
      const window = getMainWindow();
      if (window && !window.isDestroyed())
        window.webContents.send('library:release-metadata-progress', snapshot);
    },
  });
  const allowedSender = (event) => {
    const window = getMainWindow();
    return (
      window &&
      !window.isDestroyed() &&
      event?.sender === window.webContents &&
      event?.senderFrame === window.webContents.mainFrame
    );
  };
  ipcMain.handle('library:refresh-release-metadata', async (_event, intent) => {
    if (catalogService && !allowedSender(_event))
      return { status: 'invalid-intent' };
    if (intent !== undefined) return { status: 'invalid-intent' };
    try {
      requireProvider();
    } catch {
      return { status: 'disabled' };
    }
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library-metadata',
          operation: 'refresh-releases',
          code: 'RELEASE_METADATA_REFRESH_FAILED',
        },
        publicError: {
          code: 'RELEASE_METADATA_REFRESH_FAILED',
          title: '發行資訊未更新',
          message: '目前無法更新發行資訊，請稍後再試。',
          context: { retryable: true },
        },
      },
      () =>
        catalogService
          ? catalogService.refresh()
          : service.refreshFromSources(),
    );
  });
  ipcMain.handle('library:cancel-release-metadata', (_event, intent) =>
    intent === undefined && (!catalogService || allowedSender(_event))
      ? catalogService
        ? catalogService.cancel()
        : service.cancel()
      : { status: 'invalid-intent' },
  );
  if (catalogService && releaseRuntime) {
    const operations = {
      page: (value) => releaseRuntime.catalogPage(value),
      download: (value) => releaseRuntime.catalogDownload(value),
      refresh: (value) => catalogService.refresh(value),
      search: (value) => catalogService.search(value),
      preview: (value) => catalogService.preview(value),
      accept: (value) => catalogService.accept(value),
      unlink: (value) => catalogService.unlink(value),
      'link-local': (value) => catalogService.linkLocal(value),
    };
    for (const [operation, work] of Object.entries(operations)) {
      ipcMain.handle(
        `library:release-catalog-${operation}`,
        async (event, value) => {
          if (!allowedSender(event)) return { status: 'invalid-intent' };
          if (
            !['page', 'unlink', 'download', 'link-local'].includes(operation)
          ) {
            try {
              requireProvider();
            } catch {
              return { status: 'disabled' };
            }
          }
          try {
            return await work(value);
          } catch (error) {
            if (
              ![
                'RELEASE_INFO_CONFLICT',
                'RELEASE_SCOPE_STALE',
                'RELEASE_NOT_FOUND',
                'RELEASE_CATALOG_INVALID',
                'RELEASE_CANDIDATE_EXPIRED',
                'RELEASE_BINDING_MISMATCH',
                'RELEASE_PROVIDER_DISABLED',
              ].includes(error.code)
            )
              recordFailure(error);
            return {
              status:
                error.code === 'RELEASE_PROVIDER_DISABLED'
                  ? 'disabled'
                  : error.code === 'RELEASE_INFO_CONFLICT'
                    ? 'conflict'
                    : error.code === 'RELEASE_SCOPE_STALE'
                      ? 'stale'
                      : 'unavailable',
            };
          }
        },
      );
    }
  }
  return {
    async organizeSaved() {
      try {
        return await service.organizeSaved();
      } catch (error) {
        try {
          recordFailure(error);
        } catch {
          /* Offline maintenance must not block listing. */
        }
        return { updated: 0 };
      }
    },
  };
}

module.exports = { registerLibraryMetadataHandlers };
