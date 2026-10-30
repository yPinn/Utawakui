import { reactive, readonly } from 'vue';
import { getFeatureGate } from '../constants/featureGates.js';
import { useAppView } from './useAppView.js';
import { useFeatureGates } from './useFeatureGates.js';
import { catalogKey, t } from '../utils/i18n.js';

const state = reactive({
  request: null,
});

const DEFAULT_REASON = t('featureGates.access.defaultReason');

function buildRequest(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  const label =
    options.label ||
    (gate
      ? t(`featureGates.gates.${catalogKey(gate.id)}.title`)
      : t('featureGates.access.fallback'));
  return {
    featureId,
    title:
      options.title || t('featureGates.access.needEnable', { feature: label }),
    message: options.message || DEFAULT_REASON,
    actionLabel:
      options.actionLabel ||
      t('featureGates.access.enable', { feature: label }),
    kind: options.kind || 'enable',
    source: options.source || '',
    operation: options.operation || '',
    context: options.context || {},
    createdAt: new Date().toISOString(),
  };
}

async function requireFeatureGate(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  if (!gate) throw new Error(`unknown feature gate: ${featureId}`);

  const { isFeatureEnabled, refreshConfirmations } = useFeatureGates();
  if (isFeatureEnabled(featureId)) return true;

  await refreshConfirmations();
  if (isFeatureEnabled(featureId)) return true;

  state.request = buildRequest(featureId, options);
  useAppView().openSettings();
  return false;
}

function requestFeatureSetup(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  if (!gate) throw new Error(`unknown feature gate: ${featureId}`);

  state.request = buildRequest(featureId, {
    ...options,
    kind: 'setup',
    actionLabel: options.actionLabel || t('featureGates.access.viewSetup'),
  });
  useAppView().openSettings();
}

function clearFeatureGateRequest(featureId = null) {
  if (!state.request) return;
  if (featureId && state.request.featureId !== featureId) return;
  state.request = null;
}

export function useFeatureGateAccess() {
  return {
    state: readonly(state),
    requireFeatureGate,
    requestFeatureSetup,
    clearFeatureGateRequest,
  };
}
