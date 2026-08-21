'use strict';

const { createOutputServer } = require('../lib/outputServer');

const outputServer = createOutputServer();

function registerOutputRuntimeLifecycle({
  app,
  server = outputServer,
  logger = console,
}) {
  let allowQuit = false;
  let cleanupPromise = null;

  function handleBeforeQuit(event) {
    if (allowQuit) return;
    event.preventDefault();
    if (cleanupPromise) return;

    let stopResult;
    try {
      stopResult = server.stop();
    } catch (error) {
      stopResult = Promise.reject(error);
    }

    cleanupPromise = Promise.resolve(stopResult)
      .catch((error) => {
        logger.error?.('[output] Failed to stop output runtime', error);
      })
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  }

  app.on('before-quit', handleBeforeQuit);
  return () => app.removeListener('before-quit', handleBeforeQuit);
}

module.exports = {
  outputServer,
  registerOutputRuntimeLifecycle,
};
