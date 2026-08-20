import { computed, reactive, readonly } from 'vue';
import { normalizeAppError } from '../utils/appErrors.js';

const MAX_RECORDS = 100;

const state = reactive({
  records: [],
});

const recentRecords = computed(() => state.records.slice(0, 20));

function recordError(error, options = {}) {
  const record = normalizeAppError(error, options);
  state.records.unshift(record);
  if (state.records.length > MAX_RECORDS) {
    state.records.splice(MAX_RECORDS);
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
