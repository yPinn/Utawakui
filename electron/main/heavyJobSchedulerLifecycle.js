'use strict';

function registerHeavyJobSchedulerLifecycle({
  app,
  scheduler,
  logger = console,
}) {
  let allowQuit = false;
  let shutdownPromise = null;

  function handleBeforeQuit(event) {
    if (allowQuit) return;
    event.preventDefault();
    if (shutdownPromise) return;

    shutdownPromise = Promise.resolve()
      .then(() => scheduler.shutdown())
      .catch((error) => {
        logger.error?.('[audio-processing] Failed to stop heavy jobs', error);
      })
      .finally(() => {
        allowQuit = true;
        app.quit();
      });
  }

  app.on('before-quit', handleBeforeQuit);
  return () => app.removeListener('before-quit', handleBeforeQuit);
}

module.exports = { registerHeavyJobSchedulerLifecycle };
