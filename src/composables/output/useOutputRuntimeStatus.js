import OUTPUT_RUNTIME_VALUES from '../../../shared/outputRuntimeValues.json';
import { isOutputPortConflict } from '../../utils/outputRuntimeError.js';

export const INITIAL_OUTPUT_STATUS = Object.freeze({
  running: false,
  host: OUTPUT_RUNTIME_VALUES.host,
  port: OUTPUT_RUNTIME_VALUES.defaultPort,
  revision: 0,
  httpUrl: null,
  wsUrl: null,
  clients: 0,
  bootId: null,
  sourceEpoch: null,
  desired: {
    running: false,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
    displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  },
  observed: {
    serviceLifecycle: 'stopped',
    sourceSynchronization: 'unavailable',
    unavailableReason: 'renderer_not_connected',
    clients: 0,
  },
  effective: { host: null, port: null, sourceEpoch: null },
  error: null,
});

// State and IPC authority stay with the runtime; this owner projects status
// and keeps each operation failure independent from healthy background reads.
export function useOutputRuntimeStatus({ state, recordError, suggestPorts }) {
  function reportOutputError(error, operation, message, key = operation) {
    const notice = recordError(error, {
      code: `OUTPUT_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
      title: '輸出操作未完成',
      message,
      source: 'output',
      operation,
      context: { retryable: true },
    });
    state.errors[key] = notice.message;
    return notice.message;
  }

  function clearOutputFailure(operation) {
    delete state.errors[operation];
  }

  function applyStatus(value = {}) {
    state.status = {
      ...INITIAL_OUTPUT_STATUS,
      ...value,
      desired: { ...INITIAL_OUTPUT_STATUS.desired, ...value.desired },
      observed: { ...INITIAL_OUTPUT_STATUS.observed, ...value.observed },
      effective: { ...INITIAL_OUTPUT_STATUS.effective, ...value.effective },
      running: value.running === true,
    };
    if (typeof value.running === 'boolean') {
      clearOutputFailure('status');
      if (!value.error) {
        clearOutputFailure('runtime');
        clearOutputFailure(value.running ? 'start' : 'stop');
      }
    }
  }

  async function surfaceStatusError(
    status,
    { operation, message, clearWhenHealthy = true },
  ) {
    const statusError = status?.error?.message ?? '';
    if (statusError) {
      state.error = reportOutputError(
        new Error(statusError),
        operation,
        message,
        'runtime',
      );
      if (isOutputPortConflict(statusError)) await suggestPorts();
      else state.suggestedPorts = [];
      return true;
    }

    if (clearWhenHealthy) {
      state.error = '';
      clearOutputFailure('runtime');
    }
    state.suggestedPorts = [];
    return false;
  }

  return {
    reportOutputError,
    clearOutputFailure,
    applyStatus,
    surfaceStatusError,
  };
}
