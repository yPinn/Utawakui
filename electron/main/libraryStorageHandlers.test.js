import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { registerLibraryStorageHandlers } from './libraryStorageHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function createHarness(overrides = {}) {
  const ipcMain = createIpcMain();
  let config = {
    libraryStorage: {
      autoManageSeparation: false,
      separationLimitBytes: 26843545600,
    },
  };
  const getConfig = vi.fn(() => config);
  const updateConfig = vi.fn((patch) => {
    config = { ...config, ...patch };
    return config;
  });
  const storage = {
    inspect: vi.fn(() => ({
      totalBytes: 30,
      songBytes: 10,
      separationBytes: 18,
      otherBytes: 2,
      trackCount: 2,
      separationTrackCount: 1,
      driveFreeBytes: 100,
      driveCapacityBytes: 200,
    })),
    enforcePolicy: vi.fn(() => ({
      freedBytes: 8,
      removed: [{ trackId: 'track-a', recipeId: 'quick', bytes: 8 }],
      remainingBytesToFree: 0,
      storage: {
        totalBytes: 22,
        songBytes: 10,
        separationBytes: 10,
        otherBytes: 2,
        trackCount: 2,
        separationTrackCount: 1,
        driveFreeBytes: 108,
        driveCapacityBytes: 200,
      },
    })),
    cleanup: vi.fn(() => ({
      freedBytes: 8,
      removed: [{ trackId: 'track-a', recipeId: 'quick', bytes: 8 }],
      remainingBytesToFree: 0,
      storage: {
        totalBytes: 22,
        songBytes: 10,
        separationBytes: 10,
        otherBytes: 2,
        trackCount: 2,
        separationTrackCount: 1,
        driveFreeBytes: 108,
        driveCapacityBytes: 200,
      },
    })),
  };
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerLibraryStorageHandlers({
    ipcMain,
    getConfig,
    updateConfig,
    storage,
    recordDiagnostic,
    ...overrides,
  });
  return { ipcMain, getConfig, updateConfig, storage, recordDiagnostic };
}

describe('library storage handlers', () => {
  it('registers fixed inspect, policy, and cleanup intents', () => {
    const { ipcMain } = createHarness();
    expect([...ipcMain.handlers.keys()]).toEqual([
      'library-storage:get',
      'library-storage:set-policy',
      'library-storage:cleanup',
    ]);
  });

  it('returns the current policy with a path-free storage projection', async () => {
    const { ipcMain, storage } = createHarness();
    await expect(
      ipcMain.handlers.get('library-storage:get')(),
    ).resolves.toMatchObject({
      policy: {
        autoManageSeparation: false,
        separationLimitBytes: 26843545600,
      },
      storage: { totalBytes: 30, driveFreeBytes: 100 },
    });
    expect(storage.inspect).toHaveBeenCalledOnce();
  });

  it('persists a bounded policy and enforces it when automatic management is enabled', async () => {
    const { ipcMain, updateConfig, storage } = createHarness();
    const policy = {
      autoManageSeparation: true,
      separationLimitBytes: 53687091200,
      privatePath: 'E:\\private',
    };

    await expect(
      ipcMain.handlers.get('library-storage:set-policy')(null, policy),
    ).resolves.toMatchObject({
      policy: {
        autoManageSeparation: true,
        separationLimitBytes: 53687091200,
      },
      cleanup: { freedBytes: 8, removedCount: 1 },
    });
    expect(updateConfig).toHaveBeenCalledWith({
      libraryStorage: {
        autoManageSeparation: true,
        separationLimitBytes: 53687091200,
      },
    });
    expect(storage.enforcePolicy).toHaveBeenCalledWith({
      autoManageSeparation: true,
      separationLimitBytes: 53687091200,
    });
  });

  it('supports the explicit unlimited preset and rejects other limits', async () => {
    const { ipcMain } = createHarness();
    const setPolicy = ipcMain.handlers.get('library-storage:set-policy');

    await expect(
      setPolicy(null, {
        autoManageSeparation: true,
        separationLimitBytes: null,
      }),
    ).resolves.toMatchObject({
      policy: { autoManageSeparation: true, separationLimitBytes: null },
    });
    await expect(
      setPolicy(null, {
        autoManageSeparation: true,
        separationLimitBytes: 123,
      }),
    ).rejects.toThrow(APP_ERROR_PREFIX);
  });

  it('runs the same safe separation cleanup for an explicit user action', async () => {
    const { ipcMain, storage } = createHarness();
    await expect(
      ipcMain.handlers.get('library-storage:cleanup')(),
    ).resolves.toMatchObject({
      policy: { separationLimitBytes: 26843545600 },
      cleanup: { freedBytes: 8, removedCount: 1 },
      storage: { separationBytes: 10 },
    });
    expect(storage.cleanup).toHaveBeenCalledOnce();
  });
});
