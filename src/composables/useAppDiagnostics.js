import { computed, reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';

const MAX_RECORDS = 100;

const state = reactive({
  records: [],
});
const recordedErrors = new WeakMap();

const DIAGNOSTIC_CONTEXT_KEYS = new Set([
  'count',
  'dependencyId',
  'featureId',
  'httpStatus',
  'presetId',
  'retryable',
  'stage',
  'status',
]);

const recentRecords = computed(() => state.records.slice(0, 20));

function recordError(error, options = {}) {
  if (error && typeof error === 'object' && recordedErrors.has(error)) {
    return recordedErrors.get(error);
  }

  const record = normalizeAppError(error, options);
  state.records.unshift(record);
  if (state.records.length > MAX_RECORDS) {
    state.records.splice(MAX_RECORDS);
  }
  if (error && typeof error === 'object') recordedErrors.set(error, record);
  if (options.persist !== false && record.context.diagnosticRecorded !== true) {
    const context = Object.fromEntries(
      Object.entries(record.context).filter(([key]) =>
        DIAGNOSTIC_CONTEXT_KEYS.has(key),
      ),
    );
    try {
      Promise.resolve(
        globalThis.window?.Utawakui?.recordDiagnostic?.({
          level: record.severity === 'success' ? 'info' : record.severity,
          source: record.source,
          operation: record.operation || 'unknown',
          code: record.code,
          message: options.diagnosticMessage || 'Renderer operation failed',
          correlationId: record.id,
          context,
        }),
      ).catch(() => {});
    } catch {
      // Diagnostics must never become a second user-facing failure.
    }
  }
  return record;
}

function clearRecords() {
  state.records = [];
}

export function useAppDiagnostics() {
  return {
    state: readonly(state),
    recentRecords,
    recordError,
    clearRecords,
  };
}
