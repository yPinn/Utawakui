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
    throw createAppError({
      severity: 'error',
      ...options.publicError,
      ...(Object.keys(publicContext).length > 0
        ? { context: publicContext }
        : {}),
    });
  }
}

module.exports = { runDiagnosticIpcOperation };
