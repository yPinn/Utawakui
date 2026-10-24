import { describe, expect, it, vi } from 'vitest';
import { createProviderRunnerManager } from './providerRunner.js';

describe('createProviderRunnerManager', () => {
  it('runs artist-photo lookups in one-shot workers from the shared managed provider runtime', async () => {
    const runtimePaths = {
      pythonPath: 'C:\\managed\\python.exe',
      pluginParentDir: 'C:\\managed\\plugins',
      cacheDir: 'C:\\managed\\cache',
      bgutilProviderPath: 'C:\\managed\\bgutil.exe',
    };
    const getRuntimePaths = vi.fn(() => runtimePaths);
    const resolveArtistWorker = vi.fn(() => 'C:\\app\\artist_worker.py');
    const workerResult = { status: 'no-match', candidates: [] };
    const runArtistWorker = vi.fn().mockResolvedValue(workerResult);
    const app = {
      getAppPath: vi.fn(() => 'C:\\app'),
      on: vi.fn(),
    };
    const manager = createProviderRunnerManager({
      userDataDir: 'C:\\user-data',
      app,
      isPackaged: true,
      resourcesPath: 'C:\\resources',
      getRuntimePaths,
      resolveArtistWorker,
      runArtistWorker,
      findPort: vi.fn(),
      createBgutilServer: vi.fn(),
    });
    const request = { artistName: 'Artist', recordings: [] };
    const controller = new AbortController();

    await expect(
      manager.runArtistPhotoWorker(request, { signal: controller.signal }),
    ).resolves.toBe(workerResult);
    expect(getRuntimePaths).toHaveBeenCalledWith('C:\\user-data');
    expect(resolveArtistWorker).toHaveBeenCalledWith({
      isPackaged: true,
      resourcesPath: 'C:\\resources',
      appPath: 'C:\\app',
    });
    expect(runArtistWorker).toHaveBeenCalledWith({
      pythonPath: runtimePaths.pythonPath,
      workerPath: 'C:\\app\\artist_worker.py',
      request,
      signal: expect.any(AbortSignal),
      logger: expect.any(Object),
    });
    expect(runArtistWorker.mock.calls[0][0].signal).not.toBe(controller.signal);
    expect(runArtistWorker.mock.calls[0][0].signal.aborted).toBe(false);
    expect(manager.runArtistPhotoWorker).not.toBe(manager.getRunner);
    expect(manager.stop()).toBeUndefined();
  });

  it('rechecks the managed runtime on every one-shot artist-photo request', async () => {
    const getRuntimePaths = vi.fn(() => ({ pythonPath: 'C:\\python.exe' }));
    const manager = createProviderRunnerManager({
      userDataDir: 'C:\\user-data',
      app: { getAppPath: () => 'C:\\app', on: vi.fn() },
      isPackaged: false,
      resourcesPath: 'C:\\resources',
      getRuntimePaths,
      resolveArtistWorker: () => 'C:\\app\\worker.py',
      runArtistWorker: vi.fn().mockResolvedValue({
        status: 'no-match',
        candidates: [],
      }),
    });

    await manager.runArtistPhotoWorker({ artistName: 'A', recordings: [] });
    await manager.runArtistPhotoWorker({ artistName: 'B', recordings: [] });

    expect(getRuntimePaths).toHaveBeenCalledTimes(2);
  });

  it('forwards caller cancellation to the managed one-shot worker signal', async () => {
    let workerSignal;
    const runArtistWorker = vi.fn(({ signal }) => {
      workerSignal = signal;
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => resolve({ status: 'error', reason: 'cancelled' }),
          { once: true },
        );
      });
    });
    const manager = createProviderRunnerManager({
      userDataDir: 'C:\\user-data',
      app: { getAppPath: () => 'C:\\app', on: vi.fn() },
      getRuntimePaths: () => ({ pythonPath: 'C:\\python.exe' }),
      resolveArtistWorker: () => 'C:\\app\\worker.py',
      runArtistWorker,
    });
    const controller = new AbortController();

    const running = manager.runArtistPhotoWorker(
      { artistName: 'A', recordings: [] },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(workerSignal).toBeInstanceOf(AbortSignal));
    controller.abort();

    await expect(running).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(workerSignal.aborted).toBe(true);
  });

  it('aborts active one-shot workers before stopping the shared provider server', async () => {
    let workerSignal;
    const runArtistWorker = vi.fn(({ signal }) => {
      workerSignal = signal;
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => resolve({ status: 'error', reason: 'cancelled' }),
          { once: true },
        );
      });
    });
    const stopServer = vi.fn();
    let beforeQuit;
    const app = {
      getAppPath: () => 'C:\\app',
      on: vi.fn((event, listener) => {
        if (event === 'before-quit') beforeQuit = listener;
      }),
    };
    const manager = createProviderRunnerManager({
      userDataDir: 'C:\\user-data',
      app,
      getRuntimePaths: () => ({
        pythonPath: 'C:\\python.exe',
        bgutilProviderPath: 'C:\\bgutil.exe',
        pluginParentDir: 'C:\\plugins',
        cacheDir: 'C:\\cache',
      }),
      resolveArtistWorker: () => 'C:\\app\\worker.py',
      runArtistWorker,
      findPort: vi.fn().mockResolvedValue(4417),
      createBgutilServer: () => ({
        start: vi.fn().mockResolvedValue({ baseUrl: 'http://127.0.0.1:4417' }),
        stop: stopServer,
      }),
      createYtdlpRunner: vi.fn(() => vi.fn()),
    });
    await manager.getRunner();
    const running = manager.runArtistPhotoWorker({
      artistName: 'A',
      recordings: [],
    });
    await vi.waitFor(() => expect(workerSignal).toBeInstanceOf(AbortSignal));

    beforeQuit();

    expect(workerSignal.aborted).toBe(true);
    expect(stopServer).toHaveBeenCalledOnce();
    await expect(running).resolves.toMatchObject({ reason: 'cancelled' });
    await expect(
      manager.runArtistPhotoWorker({ artistName: 'B', recordings: [] }),
    ).resolves.toEqual({ status: 'error', reason: 'cancelled' });
    expect(runArtistWorker).toHaveBeenCalledOnce();
    await expect(manager.getRunner()).rejects.toThrow(/stopped/i);
  });

  it('holds before-quit until active one-shot workers confirm termination', async () => {
    let releaseWorker;
    const runArtistWorker = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseWorker = () =>
            resolve({ status: 'error', reason: 'cancelled' });
        }),
    );
    let beforeQuit;
    const app = {
      getAppPath: () => 'C:\\app',
      quit: vi.fn(),
      on: vi.fn((event, listener) => {
        if (event === 'before-quit') beforeQuit = listener;
      }),
    };
    const manager = createProviderRunnerManager({
      userDataDir: 'C:\\user-data',
      app,
      getRuntimePaths: () => ({ pythonPath: 'C:\\python.exe' }),
      resolveArtistWorker: () => 'C:\\app\\worker.py',
      runArtistWorker,
    });
    const running = manager.runArtistPhotoWorker({
      artistName: 'A',
      recordings: [],
    });
    await vi.waitFor(() => expect(runArtistWorker).toHaveBeenCalledOnce());
    const event = { preventDefault: vi.fn() };

    beforeQuit(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
    releaseWorker();
    await expect(running).resolves.toMatchObject({ reason: 'cancelled' });
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
  });
});
