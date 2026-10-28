// Main redacts and trims again; this only bounds the IPC payload.
const MAX_STACK_LENGTH = 4000;

const BENIGN_WINDOW_MESSAGES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);

function errorDetails(value) {
  if (value && typeof value === 'object') {
    return {
      message:
        typeof value.message === 'string'
          ? value.message
          : 'Unhandled renderer error',
      errorName: typeof value.name === 'string' ? value.name : 'UnknownError',
      stack:
        typeof value.stack === 'string'
          ? value.stack.slice(0, MAX_STACK_LENGTH)
          : '',
    };
  }
  return {
    message: typeof value === 'string' ? value : 'Unhandled renderer error',
    errorName: 'UnknownError',
    stack: '',
  };
}

function withStack(payload, details) {
  return details.stack ? { ...payload, stack: details.stack } : payload;
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
    safelyRecord(
      recordDiagnostic,
      withStack(
        {
          level: 'error',
          source: 'vue',
          operation: 'uncaught-error',
          code: 'VUE_UNHANDLED_ERROR',
          message: details.message,
          context: { errorName: details.errorName, vueInfo: info },
        },
        details,
      ),
    );
    previousErrorHandler?.(error, instance, info);
  };

  const onWindowError = (event) => {
    // Chromium reports deferred ResizeObserver notifications through
    // window.onerror; they are layout timing notices, not failures.
    if (!event?.error && BENIGN_WINDOW_MESSAGES.has(event?.message)) return;
    const details = errorDetails(event?.error ?? event?.message);
    safelyRecord(
      recordDiagnostic,
      withStack(
        {
          level: 'error',
          source: 'renderer',
          operation: 'window-error',
          code: 'WINDOW_ERROR',
          message: details.message,
          context: { errorName: details.errorName },
        },
        details,
      ),
    );
  };

  const onUnhandledRejection = (event) => {
    const details = errorDetails(event?.reason);
    safelyRecord(
      recordDiagnostic,
      withStack(
        {
          level: 'error',
          source: 'renderer',
          operation: 'unhandled-rejection',
          code: 'UNHANDLED_REJECTION',
          message: details.message,
          context: { errorName: details.errorName },
        },
        details,
      ),
    );
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
