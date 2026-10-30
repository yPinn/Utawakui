'use strict';

const { createAppError } = require('../lib/appError');
const { isValidLibraryStoragePolicy } = require('../lib/config');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function validationError() {
  return createAppError({
    code: 'LIBRARY_STORAGE_POLICY_INVALID',
    severity: 'warning',
  });
}

function publicCleanup(result) {
  return {
    freedBytes: result.freedBytes,
    removedCount: result.removed.length,
    remainingBytesToFree: result.remainingBytesToFree,
  };
}

function response(policy, result, includeCleanup) {
  return {
    policy,
    storage: result.storage,
    cleanup: includeCleanup ? publicCleanup(result) : null,
  };
}

function runStorageOperation({ recordDiagnostic, operation, code }, handler) {
  return runDiagnosticIpcOperation(
    {
      recordDiagnostic,
      diagnostic: { source: 'library-storage', operation, code },
      publicError: { code },
    },
    handler,
  );
}

async function enforceLibraryStoragePolicySafely({
  enforceLibraryStoragePolicy,
  options,
  recordDiagnostic,
}) {
  try {
    await enforceLibraryStoragePolicy(options);
    return true;
  } catch (error) {
    try {
      recordDiagnostic?.({
        level: 'error',
        source: 'library-storage',
        operation: 'auto-cleanup',
        code: 'LIBRARY_STORAGE_AUTO_CLEANUP_FAILED',
        message: 'Automatic separation storage cleanup failed',
        error,
      });
    } catch {
      // Diagnostics are fail-open and cannot roll back the completed write.
    }
    return false;
  }
}

function registerLibraryStorageHandlers({
  ipcMain,
  getConfig,
  updateConfig,
  storage,
  recordDiagnostic,
}) {
  ipcMain.handle('library-storage:get', async () =>
    runStorageOperation(
      {
        recordDiagnostic,
        operation: 'inspect',
        code: 'LIBRARY_STORAGE_READ_FAILED',
      },
      () => ({
        policy: getConfig().libraryStorage,
        storage: storage.inspect(),
        cleanup: null,
      }),
    ),
  );

  ipcMain.handle('library-storage:set-policy', async (_event, input) => {
    if (!isValidLibraryStoragePolicy(input)) throw validationError();
    const policy = {
      autoManageSeparation: input.autoManageSeparation,
      separationLimitBytes: input.separationLimitBytes,
    };
    return runStorageOperation(
      {
        recordDiagnostic,
        operation: 'set-policy',
        code: 'LIBRARY_STORAGE_POLICY_UPDATE_FAILED',
      },
      () => {
        updateConfig({ libraryStorage: policy });
        if (policy.autoManageSeparation) {
          return response(policy, storage.enforcePolicy(policy), true);
        }
        return {
          policy,
          storage: storage.inspect(),
          cleanup: null,
        };
      },
    );
  });

  ipcMain.handle('library-storage:cleanup', async () =>
    runStorageOperation(
      {
        recordDiagnostic,
        operation: 'cleanup',
        code: 'LIBRARY_STORAGE_CLEANUP_FAILED',
      },
      () => {
        const policy = getConfig().libraryStorage;
        return response(policy, storage.cleanup(policy), true);
      },
    ),
  );
}

module.exports = {
  enforceLibraryStoragePolicySafely,
  registerLibraryStorageHandlers,
};
