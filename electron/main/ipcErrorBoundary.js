'use strict';

const { randomUUID } = require('node:crypto');
const { createAppError } = require('../lib/appError');

// Failures get one id shared by the main event and the public error, so a
// renderer fallback record links to the same failure. Successes stay unlogged.
async function runDiagnosticIpcOperation(options, operation) {
  const startedAt = Date.now();
  try {
    return await operation();
  } catch (error) {
    const correlationId = randomUUID();
    let diagnosticRecorded = false;
    try {
      diagnosticRecorded =
        options.recordDiagnostic?.({
          process: 'main',
          level: 'error',
          ...options.diagnostic,
          correlationId,
          context: {
            ...(options.diagnostic?.context || {}),
            durationMs: Date.now() - startedAt,
          },
          error,
        })?.ok === true;
    } catch {
      // Diagnostics are fail-open and must not replace the original failure.
    }

    const publicContext = {
      ...(options.publicError.context || {}),
      correlationId,
      ...(diagnosticRecorded ? { diagnosticRecorded: true } : {}),
    };
    const appError = createAppError({
      severity: 'error',
      ...options.publicError,
      context: publicContext,
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
