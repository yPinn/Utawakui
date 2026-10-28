'use strict';

const FATAL_RENDERER_REASONS = new Set([
  'crashed',
  'integrity-failure',
  'launch-failed',
  'oom',
]);
// Child exits are only failures for these reasons; `killed` and
// `memory-eviction` are warnings, and a clean exit is routine evidence.
const ABNORMAL_CHILD_REASONS = new Set([
  'abnormal-exit',
  'crashed',
  'integrity-failure',
  'launch-failed',
  'oom',
]);
// ERR_ABORTED: a superseded navigation, not a load failure.
const ABORTED_LOAD_ERROR_CODE = -3;

function exitLevel(reason, failureReasons) {
  if (reason === 'clean-exit') return 'info';
  return failureReasons.has(reason) ? 'error' : 'warning';
}

function registerDiagnosticsLifecycle({
  app,
  processTarget,
  service,
  getMainWebContents = () => null,
  requestRendererRecovery = () => {},
  webContentsRoleOf = () => undefined,
}) {
  const webContentsCleanups = new Set();
  // Fixed role ids only; an untagged contents (e.g. devtools) records none.
  const roleContext = (webContents) => {
    const windowRole = webContentsRoleOf(webContents);
    return windowRole ? { windowRole } : {};
  };
  const roleField = (webContents) => {
    const context = roleContext(webContents);
    return context.windowRole ? { context } : {};
  };

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

  // Electron's main process keeps unhandled rejections in warn mode, so they
  // never reach uncaughtExceptionMonitor. The warning event observes them
  // without the exit-semantics change an unhandledRejection listener brings.
  const onProcessWarning = (warning) => {
    if (warning?.name !== 'UnhandledPromiseRejectionWarning') return;
    const text = String(warning.message ?? '');
    // Node follows each rejection with a generic hint warning; skip it.
    if (text.startsWith('Unhandled promise rejection.')) return;
    service.record({
      process: 'main',
      level: 'error',
      source: 'process',
      operation: 'unhandled-rejection',
      code: 'UNHANDLED_REJECTION',
      error: Object.assign(new Error(text.split('\n', 1)[0]), { stack: text }),
      context: { fatal: false },
    });
  };

  const onRenderProcessGone = (event, webContents, details = {}) => {
    const fatal = FATAL_RENDERER_REASONS.has(details.reason);
    service.record({
      process: 'main',
      level: exitLevel(details.reason, FATAL_RENDERER_REASONS),
      source: 'electron',
      operation: 'render-process-gone',
      code: 'RENDER_PROCESS_GONE',
      message: 'Renderer process exited',
      context: {
        fatal,
        reason: details.reason,
        exitCode: details.exitCode,
        ...roleContext(webContents),
      },
    });
    if (fatal) recoverMainRenderer(webContents, 'renderer-crashed');
  };

  const onChildProcessGone = (event, details = {}) => {
    service.record({
      process: 'main',
      level: exitLevel(details.reason, ABNORMAL_CHILD_REASONS),
      source: 'electron',
      operation: 'child-process-gone',
      code: 'CHILD_PROCESS_GONE',
      message: 'Electron child process exited',
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
      if (isMainFrame === false || errorCode === ABORTED_LOAD_ERROR_CODE) {
        return;
      }
      service.record({
        process: 'main',
        level: 'error',
        source: 'electron',
        operation: 'did-fail-load',
        code: 'RENDERER_LOAD_FAILED',
        message: 'Renderer failed to load',
        context: {
          errorCode,
          reason: errorDescription,
          ...roleContext(webContents),
        },
      });
      recoverMainRenderer(webContents, 'renderer-load-failed');
    };

    const onUnresponsive = () => {
      service.record({
        process: 'main',
        level: 'warning',
        source: 'electron',
        operation: 'unresponsive',
        code: 'RENDERER_UNRESPONSIVE',
        message: 'Renderer became unresponsive',
        ...roleField(webContents),
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
        ...roleField(webContents),
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
  processTarget.on('warning', onProcessWarning);
  app.on('render-process-gone', onRenderProcessGone);
  app.on('child-process-gone', onChildProcessGone);
  app.on('web-contents-created', onWebContentsCreated);

  return () => {
    processTarget.removeListener(
      'uncaughtExceptionMonitor',
      onUncaughtExceptionMonitor,
    );
    processTarget.removeListener('warning', onProcessWarning);
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
