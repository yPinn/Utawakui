'use strict';

const { getPreparedYtdlpPath } = require('../lib/featureDependencies');
const {
  resolveArtistPhotoYtMusicWorkerPath,
} = require('../lib/providerRuntime');
const {
  runYtMusicArtistPhotoWorker,
} = require('../lib/artists/ytMusicArtistPhotoRunner');
const {
  createBgutilProviderServer,
  findAvailableLoopbackPort,
} = require('../lib/bgutilProviderServer');
const { createPythonYtdlpRunner } = require('../lib/pythonYtdlp');
const path = require('node:path');
const { runReleaseCatalogWorker } = require('../lib/releases/ytMusicRunner');

const DEFAULT_BGUTIL_PROVIDER_PORT = 4417;

function createProviderRunnerManager({
  userDataDir,
  app,
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  getRuntimePaths = getPreparedYtdlpPath,
  resolveArtistWorker = resolveArtistPhotoYtMusicWorkerPath,
  runArtistWorker = runYtMusicArtistPhotoWorker,
  runReleaseWorker = runReleaseCatalogWorker,
  findPort = findAvailableLoopbackPort,
  createBgutilServer = createBgutilProviderServer,
  createYtdlpRunner = createPythonYtdlpRunner,
}) {
  let bgutilServer = null;
  let runner = null;
  let stopped = false;
  const activeArtistWorkers = new Set();
  const activeArtistWorkerTasks = new Set();
  let quitBarrier = null;
  let quitReady = false;

  async function getRunner() {
    if (stopped) throw new Error('provider runner manager stopped');
    if (runner) return runner;

    const runtimePaths = getRuntimePaths(userDataDir);
    const port = await findPort(DEFAULT_BGUTIL_PROVIDER_PORT);
    if (stopped) throw new Error('provider runner manager stopped');
    bgutilServer = createBgutilServer({
      executablePath: runtimePaths.bgutilProviderPath,
      port,
    });
    const startingServer = bgutilServer;
    const { baseUrl } = await startingServer.start();
    if (stopped) {
      startingServer.stop();
      if (bgutilServer === startingServer) bgutilServer = null;
      throw new Error('provider runner manager stopped');
    }
    runner = createYtdlpRunner({
      pythonPath: runtimePaths.pythonPath,
      pluginDirs: runtimePaths.pluginParentDir,
      cacheDir: runtimePaths.cacheDir,
      nodeRuntime: process.execPath,
      providerBaseUrl: baseUrl,
    });
    return runner;
  }

  async function runMetadataWorker(request, options = {}, release = false) {
    if (stopped) return { status: 'error', reason: 'cancelled' };
    const runtimePaths = getRuntimePaths(userDataDir);
    const workerPath = release
      ? path.join(
          isPackaged ? resourcesPath : path.join(app.getAppPath(), 'resources'),
          'provider',
          'release_catalog_worker.py',
        )
      : resolveArtistWorker({
          isPackaged,
          resourcesPath,
          appPath: app?.getAppPath?.(),
        });
    const controller = new AbortController();
    const abortWorker = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortWorker();
    else options.signal?.addEventListener('abort', abortWorker, { once: true });
    activeArtistWorkers.add(controller);
    let workerTask;
    try {
      workerTask = Promise.resolve(
        (release ? runReleaseWorker : runArtistWorker)({
          pythonPath: runtimePaths.pythonPath,
          workerPath,
          request,
          signal: controller.signal,
        }),
      );
      activeArtistWorkerTasks.add(workerTask);
      return await workerTask;
    } finally {
      if (workerTask) activeArtistWorkerTasks.delete(workerTask);
      activeArtistWorkers.delete(controller);
      options.signal?.removeEventListener('abort', abortWorker);
    }
  }
  const runArtistPhotoWorker = (request, options) =>
    runMetadataWorker(request, options);
  const runReleaseWorkerRequest = (request, options) =>
    runMetadataWorker(request, options, true);

  function stop() {
    stopped = true;
    for (const controller of activeArtistWorkers) controller.abort();
    activeArtistWorkers.clear();
    bgutilServer?.stop();
    bgutilServer = null;
    runner = null;
  }

  function handleBeforeQuit(event) {
    if (quitReady) return;

    stop();
    const pendingTasks = [...activeArtistWorkerTasks];
    if (
      pendingTasks.length === 0 ||
      typeof event?.preventDefault !== 'function'
    ) {
      return;
    }

    event.preventDefault();
    if (quitBarrier) return;

    quitBarrier = Promise.allSettled(pendingTasks).finally(() => {
      quitReady = true;
      quitBarrier = null;
      app?.quit?.();
    });
  }

  app?.on?.('before-quit', handleBeforeQuit);

  return {
    getRunner,
    runArtistPhotoWorker,
    runReleaseCatalogWorker: runReleaseWorkerRequest,
    stop,
  };
}

module.exports = { createProviderRunnerManager };
