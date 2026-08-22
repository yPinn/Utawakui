import { computed, reactive, readonly } from 'vue';
import { getFeatureGate } from '../constants/featureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const { recordError } = useAppDiagnostics();

const state = reactive({
  confirmations: {},
  pendingFeatureId: null,
  isLoading: false,
  isSaving: false,
  error: '',
});

let refreshPromise = null;
let pendingResolve = null;

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.getFeatureConfirmations === 'function' &&
    typeof window.Utawakui?.confirmFeatureGate === 'function'
  );
}

function normalizeConfirmations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const confirmations = {};
  for (const [featureId, record] of Object.entries(value)) {
    const gate = getFeatureGate(featureId);
    if (!gate || !record || typeof record !== 'object') continue;
    if (record.enabled !== true) continue;
    if (record.noticeVersion !== gate.noticeVersion) continue;
    if (typeof record.confirmedAt !== 'string') continue;
    confirmations[featureId] = {
      featureId,
      noticeVersion: gate.noticeVersion,
      confirmedAt: record.confirmedAt,
      enabled: true,
    };
  }
  return confirmations;
}

function isFeatureEnabled(featureId) {
  const gate = getFeatureGate(featureId);
  const record = state.confirmations[featureId];
  return Boolean(
    gate &&
    record?.enabled === true &&
    record.noticeVersion === gate.noticeVersion,
  );
}

async function refreshConfirmations() {
  if (!hasBridge()) {
    state.error = '需要重新啟動應用程式才能使用新版功能啟用確認。';
    return state.confirmations;
  }

  if (!refreshPromise) {
    state.isLoading = true;
    refreshPromise = window.Utawakui.getFeatureConfirmations()
      .then((confirmations) => {
        state.confirmations = normalizeConfirmations(confirmations);
        state.error = '';
        return state.confirmations;
      })
      .catch((err) => {
        state.error = recordError(err, {
          code: 'FEATURE_GATE_LIST_FAILED',
          title: '功能狀態讀取失敗',
          message: '目前無法讀取功能狀態，請再試一次。',
          source: 'feature-gates',
          operation: 'list',
          context: { retryable: true },
        }).message;
        return state.confirmations;
      })
      .finally(() => {
        state.isLoading = false;
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function settlePending(result) {
  const resolve = pendingResolve;
  pendingResolve = null;
  state.pendingFeatureId = null;
  if (resolve) resolve(result);
}

async function ensureFeatureGate(featureId) {
  const gate = getFeatureGate(featureId);
  if (!gate) throw new Error(`unknown feature gate: ${featureId}`);
  if (isFeatureEnabled(featureId)) return true;

  await refreshConfirmations();
  if (isFeatureEnabled(featureId)) return true;
  if (!hasBridge()) return false;

  if (pendingResolve) settlePending(false);

  state.error = '';
  state.pendingFeatureId = featureId;
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

async function confirmPendingFeature() {
  const featureId = state.pendingFeatureId;
  const gate = getFeatureGate(featureId);
  if (!gate || !hasBridge()) {
    settlePending(false);
    return false;
  }

  state.isSaving = true;
  try {
    const record = await window.Utawakui.confirmFeatureGate(
      featureId,
      gate.noticeVersion,
    );
    state.confirmations[featureId] = normalizeConfirmations({
      [featureId]: record,
    })[featureId];
    state.error = '';
    settlePending(true);
    return true;
  } catch (err) {
    state.error = recordError(err, {
      code: 'FEATURE_GATE_CONFIRM_FAILED',
      title: '功能未啟用',
      message: '目前無法啟用這項功能，請再試一次。',
      source: 'feature-gates',
      operation: 'confirm',
      context: { featureId, retryable: true },
    }).message;
    return false;
  } finally {
    state.isSaving = false;
  }
}

function cancelPendingFeature() {
  state.error = '';
  settlePending(false);
}

const pendingFeature = computed(() => getFeatureGate(state.pendingFeatureId));

export function useFeatureGates() {
  return {
    state: readonly(state),
    pendingFeature,
    isFeatureEnabled,
    refreshConfirmations,
    ensureFeatureGate,
    confirmPendingFeature,
    cancelPendingFeature,
  };
}
