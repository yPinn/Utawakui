'use strict';

const { getPreparedYtdlpPath } = require('../lib/featureDependencies');
const {
  createBgutilProviderServer,
  findAvailableLoopbackPort,
} = require('../lib/bgutilProviderServer');
const { createPythonYtdlpRunner } = require('../lib/pythonYtdlp');

const DEFAULT_BGUTIL_PROVIDER_PORT = 4417;

function createProviderRunnerManager({ userDataDir, app }) {
  let bgutilServer = null;
  let runner = null;

  async function getRunner() {
    if (runner) return runner;

    const runtimePaths = getPreparedYtdlpPath(userDataDir);
    const port = await findAvailableLoopbackPort(DEFAULT_BGUTIL_PROVIDER_PORT);
    bgutilServer = createBgutilProviderServer({
      executablePath: runtimePaths.bgutilProviderPath,
      port,
    });
    const { baseUrl } = await bgutilServer.start();
    runner = createPythonYtdlpRunner({
      pythonPath: runtimePaths.pythonPath,
      pluginDirs: runtimePaths.pluginParentDir,
      cacheDir: runtimePaths.cacheDir,
      nodeRuntime: process.execPath,
      providerBaseUrl: baseUrl,
    });
    return runner;
  }

  function stop() {
    bgutilServer?.stop();
    bgutilServer = null;
    runner = null;
  }

  app?.on?.('before-quit', stop);

  return { getRunner, stop };
}

module.exports = { createProviderRunnerManager };
