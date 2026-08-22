'use strict';

function startInteractiveRuntime({
  attachRenderer,
  createWindow,
  runMigrations,
  startOutput,
  defer = setImmediate,
  logger = console,
}) {
  const mainWindow = createWindow();
  attachRenderer(mainWindow.webContents);

  const outputStartup = Promise.resolve()
    .then(startOutput)
    .catch((error) => {
      logger.warn?.('[output] Automatic startup failed', error.message);
    });

  mainWindow.once('ready-to-show', () => {
    defer(() => {
      try {
        runMigrations();
      } catch (error) {
        logger.warn?.('[startup] Deferred migration failed', error.message);
      }
    });
  });

  return { mainWindow, outputStartup };
}

module.exports = { startInteractiveRuntime };
