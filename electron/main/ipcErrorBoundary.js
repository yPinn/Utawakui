'use strict';

const { createAppError } = require('../lib/appError');

async function runDiagnosticIpcOperation(options, operation) {
  try {
    return await operation();
  } catch (error) {
    let diagnosticRecorded = false;
    try {
      diagnosticRecorded =
        options.recordDiagnostic?.({
          process: 'main',
          level: 'error',
          ...options.diagnostic,
          error,
        })?.ok === true;
    } catch {
      // Diagnostics are fail-open and must not replace the original failure.
    }

    const publicContext = {
      ...(options.publicError.context || {}),
      ...(diagnosticRecorded ? { diagnosticRecorded: true } : {}),
    };
    const appError = createAppError({
      severity: 'error',
      ...options.publicError,
      ...(Object.keys(publicContext).length > 0
        ? { context: publicContext }
        : {}),
    });
    // The public error replaces the cause, so let callers keep an internal
    // classification of it (never serialized to the renderer).
    throw Object.assign(appError, options.classifyError?.(error));
  }
}

function publicValidationResult(error, contextKeys = []) {
  const allowed = new Set(contextKeys);
  const context = Object.fromEntries(
    Object.entries(error.context ?? {}).filter(([key]) => allowed.has(key)),
  );
  return {
    ok: false,
    error: {
      code: error.code,
      field: error.field,
      message: error.message,
      ...(Object.keys(context).length > 0 ? { context } : {}),
    },
  };
}

// Plan stores share one IPC result contract: `{ ok: true, plan }`, a bounded
// validation result, or a diagnosed retryable AppError.
function createPlanIpcRunner({
  source,
  operationErrors,
  isValidationError,
  validationContextKeys,
  recordDiagnostic,
}) {
  return function run(operation, work) {
    const presentation = operationErrors[operation];
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: { source, operation, code: presentation.code },
        publicError: { ...presentation, context: { retryable: true } },
      },
      async () => {
        try {
          return { ok: true, plan: await work() };
        } catch (error) {
          if (!isValidationError(error)) throw error;
          return publicValidationResult(error, validationContextKeys);
        }
      },
    );
  };
}

module.exports = { createPlanIpcRunner, runDiagnosticIpcOperation };
