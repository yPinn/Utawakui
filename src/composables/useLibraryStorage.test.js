import { describe, expect, it, vi } from 'vitest';
import { useLibraryStorage } from './useLibraryStorage.js';

function snapshot(overrides = {}) {
  return {
    policy: {
      autoManageSeparation: false,
      separationLimitBytes: 26843545600,
    },
    storage: {
      totalBytes: 30,
      songBytes: 10,
      separationBytes: 18,
      otherBytes: 2,
      trackCount: 2,
      separationTrackCount: 1,
      driveFreeBytes: 100,
      driveCapacityBytes: 200,
    },
    cleanup: null,
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  let libraryUpdatedListener;
  const unsubscribe = vi.fn();
  const bridge = {
    getLibraryStorage: vi.fn().mockResolvedValue(snapshot()),
    setLibraryStoragePolicy: vi.fn().mockResolvedValue(
      snapshot({
        policy: {
          autoManageSeparation: true,
          separationLimitBytes: 53687091200,
        },
      }),
    ),
    cleanupLibraryStorage: vi.fn().mockResolvedValue(
      snapshot({
        storage: {
          ...snapshot().storage,
          totalBytes: 22,
          separationBytes: 10,
          driveFreeBytes: 108,
        },
        cleanup: { freedBytes: 8, removedCount: 1, remainingBytesToFree: 0 },
      }),
    ),
    onLibraryUpdated: vi.fn((listener) => {
      libraryUpdatedListener = listener;
      return unsubscribe;
    }),
    ...overrides,
  };
  const owner = useLibraryStorage({ bridge });
  return {
    bridge,
    owner,
    unsubscribe,
    notifyLibraryUpdated: () => libraryUpdatedListener?.(),
  };
}

describe('library storage settings owner', () => {
  it('loads one snapshot and refreshes after library changes', async () => {
    const { bridge, owner, notifyLibraryUpdated } = createHarness();

    await owner.initialize();
    expect(owner.storage.value).toMatchObject({ totalBytes: 30 });
    expect(owner.policy.value).toEqual({
      autoManageSeparation: false,
      separationLimitBytes: 26843545600,
    });
    expect(bridge.onLibraryUpdated).toHaveBeenCalledOnce();

    notifyLibraryUpdated();
    await Promise.resolve();
    expect(bridge.getLibraryStorage).toHaveBeenCalledTimes(2);
  });

  it('merges and persists one bounded policy intent', async () => {
    const { bridge, owner } = createHarness();
    await owner.initialize();

    await expect(
      owner.setPolicy({
        autoManageSeparation: true,
        separationLimitBytes: 53687091200,
      }),
    ).resolves.toBe(true);
    expect(bridge.setLibraryStoragePolicy).toHaveBeenCalledWith({
      autoManageSeparation: true,
      separationLimitBytes: 53687091200,
    });
    expect(owner.policy.value.autoManageSeparation).toBe(true);
  });

  it('projects cleanup results without exposing removed track ids', async () => {
    const { owner } = createHarness();
    await owner.initialize();

    await expect(owner.cleanup()).resolves.toBe(true);
    expect(owner.storage.value.separationBytes).toBe(10);
    expect(owner.lastCleanup.value).toEqual({
      freedBytes: 8,
      removedCount: 1,
      remainingBytesToFree: 0,
    });
  });

  it('uses bounded user copy and releases its library subscription', async () => {
    const { owner, unsubscribe } = createHarness({
      getLibraryStorage: vi.fn().mockRejectedValue(new Error('E:\\private')),
    });

    await owner.initialize();
    expect(owner.error.value).toBe('目前無法讀取曲庫空間。');
    owner.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
