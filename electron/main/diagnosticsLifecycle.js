'use strict';

const FATAL_RENDERER_REASONS = new Set([
  'crashed',
  'integrity-failure',
  'launch-failed',
  'oom',
]);

function registerDiagnosticsLifecycle({
  app,
  processTarget,
  service,
  getMainWebContents = () => null,
  requestRendererRecovery = () => {},
}) {
  const webContentsCleanups = new Set();

  const recoverMainRenderer = (webContents, reason) => {
    if (!webContents || webContents !== getMainWebContents()) return;
    try {
      Promise.resolve(requestRendererRecovery(reason)).catch(() => {});
    } catch {
      // Diagnostics remain available even if the recovery host fails.
    }
  };

  const onUncaughtExceptionMonitor = (error, origin) => {
    service.record({
      process: 'main',
      level: 'error',
      source: 'process',
      operation: 'uncaught-exception',
      code: 'UNCAUGHT_EXCEPTION',
      error,
      context: { fatal: true, reason: origin },
    });
  };

  const onRenderProcessGone = (event, webContents, details = {}) => {
    const fatal = FATAL_RENDERER_REASONS.has(details.reason);
    service.record({
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'render-process-gone',
      code: 'RENDER_PROCESS_GONE',
      message: 'Renderer process terminated unexpectedly',
      context: {
        fatal,
        reason: details.reason,
        exitCode: details.exitCode,
      },
    });
    if (fatal) recoverMainRenderer(webContents, 'renderer-crashed');
  };

  const onChildProcessGone = (event, details = {}) => {
    service.record({
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'child-process-gone',
      code: 'CHILD_PROCESS_GONE',
      message: 'Electron child process terminated unexpectedly',
      context: {
        fatal: false,
        processType: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
      },
    });
  };

  const onWebContentsCreated = (event, webContents) => {
    const onDidFailLoad = (
      loadEvent,
      errorCode,
      errorDescription,
      validatedUrl,
      isMainFrame,
    ) => {
      if (isMainFrame === false) return;
      service.record({
        process: 'main',
        level: 'error',
        source: 'electron',
        operation: 'did-fail-load',
        code: 'RENDERER_LOAD_FAILED',
        message: 'Renderer failed to load',
        context: { errorCode, reason: errorDescription },
      });
      if (errorCode !== -3) {
        recoverMainRenderer(webContents, 'renderer-load-failed');
      }
    };

    const onUnresponsive = () => {
      service.record({
        process: 'main',
        level: 'warning',
        source: 'electron',
        operation: 'unresponsive',
        code: 'RENDERER_UNRESPONSIVE',
        message: 'Renderer became unresponsive',
      });
      recoverMainRenderer(webContents, 'renderer-unresponsive');
    };

    const onPreloadError = (preloadEvent, preloadPath, error) => {
      service.record({
        process: 'main',
        level: 'error',
        source: 'electron',
        operation: 'preload-error',
        code: 'PRELOAD_FAILED',
        error,
      });
      recoverMainRenderer(webContents, 'renderer-preload-failed');
    };

    const cleanupWebContents = () => {
      webContents.removeListener('did-fail-load', onDidFailLoad);
      webContents.removeListener('unresponsive', onUnresponsive);
      webContents.removeListener('preload-error', onPreloadError);
      webContents.removeListener('destroyed', cleanupWebContents);
      webContentsCleanups.delete(cleanupWebContents);
    };

    webContents.on('did-fail-load', onDidFailLoad);
    webContents.on('unresponsive', onUnresponsive);
    webContents.on('preload-error', onPreloadError);
    webContents.once('destroyed', cleanupWebContents);
    webContentsCleanups.add(cleanupWebContents);
  };

  processTarget.on('uncaughtExceptionMonitor', onUncaughtExceptionMonitor);
  app.on('render-process-gone', onRenderProcessGone);
  app.on('child-process-gone', onChildProcessGone);
  app.on('web-contents-created', onWebContentsCreated);

  return () => {
    processTarget.removeListener(
      'uncaughtExceptionMonitor',
      onUncaughtExceptionMonitor,
    );
    app.removeListener('render-process-gone', onRenderProcessGone);
    app.removeListener('child-process-gone', onChildProcessGone);
    app.removeListener('web-contents-created', onWebContentsCreated);
    for (const cleanupWebContents of [...webContentsCleanups]) {
      cleanupWebContents();
    }
  };
}

module.exports = {
  registerDiagnosticsLifecycle,
};
