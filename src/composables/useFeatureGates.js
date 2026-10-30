import { computed, reactive, readonly } from 'vue';
import { getFeatureGate } from '../constants/featureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { t } from '../utils/i18n.js';

const { recordError } = useAppDiagnostics();

const state = reactive({
  confirmations: {},
  pendingFeatureId: null,
  isLoading: false,
  isSaving: false,
  get error() {
    return this.confirmError || this.readError;
  },
  readError: '',
  confirmError: '',
});

let refreshPromise = null;
let confirmationPromise = null;
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
    state.readError = t('featureGates.restartRequired');
    return state.confirmations;
  }

  if (!refreshPromise) {
    state.isLoading = true;
    refreshPromise = window.Utawakui.getFeatureConfirmations()
      .then((confirmations) => {
        state.confirmations = normalizeConfirmations(confirmations);
        state.readError = '';
        return state.confirmations;
      })
      .catch((err) => {
        state.readError = recordError(err, {
          code: 'FEATURE_GATE_LIST_FAILED',
          title: t('featureGates.readFailed'),
          message: t('featureGates.readFailedMessage'),
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

  state.confirmError = '';
  state.pendingFeatureId = featureId;
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

function confirmPendingFeature() {
  if (confirmationPromise) return confirmationPromise;

  const featureId = state.pendingFeatureId;
  const gate = getFeatureGate(featureId);
  if (!gate || !hasBridge()) {
    settlePending(false);
    return Promise.resolve(false);
  }

  state.isSaving = true;
  confirmationPromise = (async () => {
    try {
      const record = await window.Utawakui.confirmFeatureGate(
        featureId,
        gate.noticeVersion,
      );
      const confirmation = normalizeConfirmations({
        [featureId]: record,
      })[featureId];
      if (!confirmation) {
        throw new Error('invalid feature confirmation response');
      }
      state.confirmations[featureId] = confirmation;
      state.confirmError = '';
      settlePending(true);
      return true;
    } catch (err) {
      state.confirmError = recordError(err, {
        code: 'FEATURE_GATE_CONFIRM_FAILED',
        title: t('featureGates.enableFailed'),
        message: t('featureGates.enableFailedMessage'),
        source: 'feature-gates',
        operation: 'confirm',
        context: { featureId, retryable: true },
      }).message;
      return false;
    } finally {
      state.isSaving = false;
      confirmationPromise = null;
    }
  })();
  return confirmationPromise;
}

function cancelPendingFeature() {
  if (state.isSaving) return;
  state.confirmError = '';
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
