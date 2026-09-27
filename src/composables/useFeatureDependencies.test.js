import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEPENDENCY_ID = 'ffmpeg-gyan-essentials';

let bridge;
let listFeatureDependenciesMock;
let prepareFeatureDependencyMock;
let removeFeatureDependencyMock;
let repairFeatureDependencyMock;
let progressCallback;
let updatedCallback;
let unsubscribeProgressMock;
let unsubscribeUpdatesMock;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.resetModules();
  progressCallback = undefined;
  updatedCallback = undefined;
  unsubscribeProgressMock = vi.fn();
  unsubscribeUpdatesMock = vi.fn();
  listFeatureDependenciesMock = vi.fn().mockResolvedValue([]);
  prepareFeatureDependencyMock = vi.fn().mockResolvedValue({
    id: DEPENDENCY_ID,
    installed: true,
  });
  removeFeatureDependencyMock = vi.fn().mockResolvedValue({
    id: DEPENDENCY_ID,
    installed: false,
  });
  repairFeatureDependencyMock = vi.fn().mockResolvedValue({
    id: DEPENDENCY_ID,
    installed: true,
  });
  bridge = {
    listFeatureDependencies: listFeatureDependenciesMock,
    prepareFeatureDependency: prepareFeatureDependencyMock,
    removeFeatureDependency: removeFeatureDependencyMock,
    repairFeatureDependency: repairFeatureDependencyMock,
    onFeatureDependenciesUpdated: (callback) => {
      updatedCallback = callback;
      return unsubscribeUpdatesMock;
    },
    onFeatureDependencyProgress: (callback) => {
      progressCallback = callback;
      return unsubscribeProgressMock;
    },
    recordDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadFeatureDependencies() {
  const { useFeatureDependencies } =
    await import('./useFeatureDependencies.js');
  return useFeatureDependencies();
}

describe('useFeatureDependencies', () => {
  it('exposes one bounded state owner and subscribes to dependency events', async () => {
    const dependencies = await loadFeatureDependencies();

    expect(Object.keys(dependencies).sort()).toEqual([
      'prepareDependency',
      'refreshDependencies',
      'removeDependency',
      'repairDependency',
      'state',
    ]);
    expect(Object.keys(dependencies.state).sort()).toEqual([
      'actionIds',
      'byId',
      'error',
      'isLoading',
      'preparingIds',
      'progressById',
    ]);
    expect(updatedCallback).toBeTypeOf('function');
    expect(progressCallback).toBeTypeOf('function');

    updatedCallback([
      { id: DEPENDENCY_ID, installed: true },
      { id: 'audio-python', installed: false },
    ]);
    expect(dependencies.state.byId).toEqual({
      [DEPENDENCY_ID]: { id: DEPENDENCY_ID, installed: true },
      'audio-python': { id: 'audio-python', installed: false },
    });

    updatedCallback([{ id: DEPENDENCY_ID, installed: false }]);
    expect(dependencies.state.byId).toEqual({
      [DEPENDENCY_ID]: { id: DEPENDENCY_ID, installed: false },
    });
  });

  it('stores only identified progress and replaces the latest payload', async () => {
    const dependencies = await loadFeatureDependencies();

    progressCallback({ stage: 'ignored', percent: 1 });
    expect(dependencies.state.progressById).toEqual({});

    progressCallback({
      dependencyId: DEPENDENCY_ID,
      stage: 'downloading',
      percent: 42,
    });
    progressCallback({
      dependencyId: DEPENDENCY_ID,
      stage: 'extracting',
      percent: 80,
    });

    expect(dependencies.state.progressById[DEPENDENCY_ID]).toEqual({
      dependencyId: DEPENDENCY_ID,
      stage: 'extracting',
      percent: 80,
    });
  });

  it('refreshes dependency truth and restores loading state', async () => {
    const deferred = createDeferred();
    listFeatureDependenciesMock.mockReturnValue(deferred.promise);
    const dependencies = await loadFeatureDependencies();

    const refreshPromise = dependencies.refreshDependencies();
    expect(dependencies.state.isLoading).toBe(true);

    deferred.resolve([{ id: DEPENDENCY_ID, installed: true }]);
    await refreshPromise;

    expect(dependencies.state.isLoading).toBe(false);
    expect(dependencies.state.byId[DEPENDENCY_ID]).toMatchObject({
      installed: true,
    });
    expect(dependencies.state.error).toBeNull();
  });

  it('returns a bounded refresh error and restores loading state', async () => {
    listFeatureDependenciesMock.mockRejectedValue(
      new Error('C:\\Users\\Singer\\private-runtime.json'),
    );
    const dependencies = await loadFeatureDependencies();

    await dependencies.refreshDependencies();

    expect(dependencies.state.isLoading).toBe(false);
    expect(dependencies.state.error).toMatchObject({
      code: 'FEATURE_DEPENDENCY_STATUS_FAILED',
      operation: 'refresh',
      source: 'feature-dependencies',
      title: '無法讀取準備狀態',
      message: '請再試一次。',
    });
    expect(dependencies.state.error.message).not.toContain('private-runtime');
  });

  it('reports a bounded warning when the required preload bridge is absent', async () => {
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic: vi.fn() } });
    const dependencies = await loadFeatureDependencies();

    await dependencies.refreshDependencies();

    expect(dependencies.state.error).toMatchObject({
      code: 'BRIDGE_UNAVAILABLE',
      operation: 'refresh',
      severity: 'warning',
      message: '請重新啟動 Utawakui 後再試。',
    });
    expect(dependencies.state.isLoading).toBe(false);
  });

  it('suppresses duplicate prepare calls and clears progress after success', async () => {
    const deferred = createDeferred();
    prepareFeatureDependencyMock.mockReturnValue(deferred.promise);
    const dependencies = await loadFeatureDependencies();

    const firstPrepare = dependencies.prepareDependency(DEPENDENCY_ID);
    const duplicatePrepare = dependencies.prepareDependency(DEPENDENCY_ID);
    expect(prepareFeatureDependencyMock).toHaveBeenCalledTimes(1);
    expect(dependencies.state.preparingIds.has(DEPENDENCY_ID)).toBe(true);
    expect(dependencies.state.progressById[DEPENDENCY_ID]).toMatchObject({
      stage: 'starting',
    });

    progressCallback({
      dependencyId: DEPENDENCY_ID,
      stage: 'downloading',
      percent: 80,
    });
    deferred.resolve({ id: DEPENDENCY_ID, installed: true });
    await Promise.all([firstPrepare, duplicatePrepare]);

    expect(dependencies.state.byId[DEPENDENCY_ID]).toMatchObject({
      installed: true,
    });
    expect(dependencies.state.preparingIds.has(DEPENDENCY_ID)).toBe(false);
    expect(dependencies.state.progressById[DEPENDENCY_ID]).toBeUndefined();
    expect(dependencies.state.error).toBeNull();
  });

  it('cleans up a failed prepare and exposes only the public error', async () => {
    prepareFeatureDependencyMock.mockRejectedValue(
      new Error('failed https://private.test/runtime.zip'),
    );
    const dependencies = await loadFeatureDependencies();

    await dependencies.prepareDependency(DEPENDENCY_ID);

    expect(dependencies.state.preparingIds.has(DEPENDENCY_ID)).toBe(false);
    expect(dependencies.state.progressById[DEPENDENCY_ID]).toBeUndefined();
    expect(dependencies.state.error).toMatchObject({
      code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
      operation: 'prepare',
      context: { dependencyId: DEPENDENCY_ID },
      title: '準備失敗',
      message: '請再試一次。',
    });
    expect(dependencies.state.error.message).not.toContain('private.test');
  });

  it('serializes maintenance actions and updates dependency truth', async () => {
    const deferred = createDeferred();
    removeFeatureDependencyMock.mockReturnValue(deferred.promise);
    const dependencies = await loadFeatureDependencies();

    const firstRemove = dependencies.removeDependency(DEPENDENCY_ID);
    const duplicateRemove = dependencies.removeDependency(DEPENDENCY_ID);
    expect(removeFeatureDependencyMock).toHaveBeenCalledTimes(1);
    expect(dependencies.state.actionIds.has(`remove:${DEPENDENCY_ID}`)).toBe(
      true,
    );

    deferred.resolve({ id: DEPENDENCY_ID, installed: false });
    await Promise.all([firstRemove, duplicateRemove]);
    expect(dependencies.state.byId[DEPENDENCY_ID]).toMatchObject({
      installed: false,
    });
    expect(dependencies.state.actionIds.size).toBe(0);

    await dependencies.repairDependency(DEPENDENCY_ID);
    expect(repairFeatureDependencyMock).toHaveBeenCalledWith(DEPENDENCY_ID);
    expect(dependencies.state.byId[DEPENDENCY_ID]).toMatchObject({
      installed: true,
    });
  });

  it('does not start maintenance while the same dependency is preparing', async () => {
    const deferred = createDeferred();
    prepareFeatureDependencyMock.mockReturnValue(deferred.promise);
    const dependencies = await loadFeatureDependencies();

    const preparePromise = dependencies.prepareDependency(DEPENDENCY_ID);
    await dependencies.removeDependency(DEPENDENCY_ID);
    await dependencies.repairDependency(DEPENDENCY_ID);

    expect(removeFeatureDependencyMock).not.toHaveBeenCalled();
    expect(repairFeatureDependencyMock).not.toHaveBeenCalled();
    deferred.resolve({ id: DEPENDENCY_ID, installed: true });
    await preparePromise;
  });

  it.each([
    ['removeDependency', 'removeFeatureDependency', 'remove'],
    ['repairDependency', 'repairFeatureDependency', 'repair'],
  ])(
    'cleans up a failed %s action and exposes only its public error',
    async (methodName, bridgeMethod, operation) => {
      bridge[bridgeMethod].mockRejectedValue(
        new Error('failed C:\\Users\\Singer\\private.exe'),
      );
      const dependencies = await loadFeatureDependencies();

      await dependencies[methodName](DEPENDENCY_ID);

      expect(dependencies.state.actionIds.size).toBe(0);
      expect(dependencies.state.error).toMatchObject({
        code: `FEATURE_DEPENDENCY_${operation.toUpperCase()}_FAILED`,
        operation,
        context: { dependencyId: DEPENDENCY_ID },
      });
      expect(dependencies.state.error.message).not.toContain('private.exe');
    },
  );

  it('reports unavailable optional maintenance bridges without invoking work', async () => {
    delete bridge.removeFeatureDependency;
    const dependencies = await loadFeatureDependencies();

    await dependencies.removeDependency(DEPENDENCY_ID);

    expect(dependencies.state.error).toMatchObject({
      code: 'BRIDGE_UNAVAILABLE',
      operation: 'remove',
      severity: 'warning',
    });
    expect(dependencies.state.actionIds.size).toBe(0);
  });
});
