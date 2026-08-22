function errorDetails(value) {
  if (value && typeof value === 'object') {
    return {
      message:
        typeof value.message === 'string'
          ? value.message
          : 'Unhandled renderer error',
      errorName: typeof value.name === 'string' ? value.name : 'UnknownError',
    };
  }
  return {
    message: typeof value === 'string' ? value : 'Unhandled renderer error',
    errorName: 'UnknownError',
  };
}

function safelyRecord(recordDiagnostic, payload) {
  try {
    Promise.resolve(recordDiagnostic(payload)).catch(() => {});
  } catch {
    // Diagnostics must never become a second application failure.
  }
}

export function installRendererDiagnostics({
  app,
  windowTarget = globalThis.window,
  recordDiagnostic,
}) {
  if (!app?.config || typeof recordDiagnostic !== 'function') return () => {};

  const previousErrorHandler = app.config.errorHandler;
  const errorHandler = (error, instance, info) => {
    const details = errorDetails(error);
    safelyRecord(recordDiagnostic, {
      level: 'error',
      source: 'vue',
      operation: 'uncaught-error',
      code: 'VUE_UNHANDLED_ERROR',
      message: details.message,
      context: { errorName: details.errorName, vueInfo: info },
    });
    previousErrorHandler?.(error, instance, info);
  };

  const onWindowError = (event) => {
    const details = errorDetails(event?.error ?? event?.message);
    safelyRecord(recordDiagnostic, {
      level: 'error',
      source: 'renderer',
      operation: 'window-error',
      code: 'WINDOW_ERROR',
      message: details.message,
      context: { errorName: details.errorName },
    });
  };

  const onUnhandledRejection = (event) => {
    const details = errorDetails(event?.reason);
    safelyRecord(recordDiagnostic, {
      level: 'error',
      source: 'renderer',
      operation: 'unhandled-rejection',
      code: 'UNHANDLED_REJECTION',
      message: details.message,
      context: { errorName: details.errorName },
    });
  };

  app.config.errorHandler = errorHandler;
  windowTarget?.addEventListener?.('error', onWindowError);
  windowTarget?.addEventListener?.('unhandledrejection', onUnhandledRejection);

  return () => {
    if (app.config.errorHandler === errorHandler) {
      app.config.errorHandler = previousErrorHandler;
    }
    windowTarget?.removeEventListener?.('error', onWindowError);
    windowTarget?.removeEventListener?.(
      'unhandledrejection',
      onUnhandledRejection,
    );
  };
}
