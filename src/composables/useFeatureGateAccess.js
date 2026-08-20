import { reactive, readonly } from 'vue';
import { getFeatureGate } from '../constants/featureGates.js';
import { useAppView } from './useAppView.js';
import { useFeatureGates } from './useFeatureGates.js';

const state = reactive({
  request: null,
});

const DEFAULT_REASON = '請先到設定啟用這項進階功能，再回到剛才的工作流程。';

function buildRequest(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  const label =
    options.label || gate?.title?.replace(/^啟用/, '') || '進階功能';
  return {
    featureId,
    title: options.title || `需要啟用${label}`,
    message: options.message || DEFAULT_REASON,
    actionLabel: options.actionLabel || `啟用${label}`,
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
  useAppView().setActiveView('settings');
  return false;
}

function requestFeatureSetup(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  if (!gate) throw new Error(`unknown feature gate: ${featureId}`);

  state.request = buildRequest(featureId, {
    ...options,
    kind: 'setup',
    actionLabel: options.actionLabel || '查看準備項目',
  });
  useAppView().setActiveView('settings');
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
