'use strict';

function startInteractiveRuntime({
  attachRenderer,
  createWindow,
  runMigrations,
  startOutput,
  defer = setImmediate,
  logger = console,
  recordMilestone = () => undefined,
}) {
  const mainWindow = createWindow();
  recordMilestone('window-created');
  mainWindow.webContents.once?.('did-finish-load', () => {
    recordMilestone('dom-loaded');
  });
  attachRenderer(mainWindow.webContents);

  const outputStartup = Promise.resolve()
    .then(startOutput)
    .catch((error) => {
      logger.warn?.('[output] Automatic startup failed', error);
    });

  mainWindow.once('ready-to-show', () => {
    defer(() => {
      try {
        runMigrations();
      } catch (error) {
        logger.warn?.('[startup] Deferred migration failed', error);
      }
    });
  });

  return { mainWindow, outputStartup };
}

module.exports = { startInteractiveRuntime };
