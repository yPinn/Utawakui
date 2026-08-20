import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const { recordError } = useAppDiagnostics();

const state = reactive({
  byId: {},
  isLoading: false,
  preparingIds: new Set(),
  actionIds: new Set(),
  progressById: {},
  error: null,
});

let unsubscribeUpdates = null;
let unsubscribeProgress = null;

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.listFeatureDependencies === 'function' &&
    typeof window.Utawakui?.prepareFeatureDependency === 'function'
  );
}

function hasDependencyActionBridge(actionName) {
  return hasBridge() && typeof window.Utawakui?.[actionName] === 'function';
}

function applyDependencies(dependencies = []) {
  state.byId = Object.fromEntries(
    dependencies.map((dependency) => [dependency.id, dependency]),
  );
}

function applyDependencyProgress(payload = {}) {
  if (!payload.dependencyId) return;
  state.progressById = {
    ...state.progressById,
    [payload.dependencyId]: payload,
  };
}

function clearDependencyProgress(dependencyId) {
  if (!state.progressById[dependencyId]) return;
  const next = { ...state.progressById };
  delete next[dependencyId];
  state.progressById = next;
}

async function refreshDependencies() {
  if (!hasBridge()) {
    state.error = recordError('需要重新啟動應用程式才能讀取功能準備狀態。', {
      code: 'BRIDGE_UNAVAILABLE',
      severity: 'warning',
      title: '需要重新啟動',
      source: 'feature-dependencies',
      operation: 'refresh',
    });
    return;
  }

  state.isLoading = true;
  try {
    applyDependencies(await window.Utawakui.listFeatureDependencies());
    state.error = null;
  } catch (err) {
    state.error = recordError(err, {
      code: 'FEATURE_DEPENDENCY_STATUS_FAILED',
      title: '讀取功能準備狀態失敗',
      source: 'feature-dependencies',
      operation: 'refresh',
      actionLabel: '重新讀取',
    });
  } finally {
    state.isLoading = false;
  }
}

async function prepareDependency(dependencyId) {
  if (!hasBridge() || state.preparingIds.has(dependencyId)) return;

  state.preparingIds.add(dependencyId);
  applyDependencyProgress({ dependencyId, stage: 'starting' });
  try {
    const dependency =
      await window.Utawakui.prepareFeatureDependency(dependencyId);
    state.byId = {
      ...state.byId,
      [dependency.id]: dependency,
    };
    state.error = null;
  } catch (err) {
    state.error = recordError(err, {
      code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
      title: '準備項目失敗',
      source: 'feature-dependencies',
      operation: 'prepare',
      actionLabel: '重試',
      context: { dependencyId },
    });
  } finally {
    state.preparingIds.delete(dependencyId);
    clearDependencyProgress(dependencyId);
  }
}

async function runDependencyAction({
  dependencyId,
  actionKey,
  bridgeMethod,
  operation,
  title,
  actionLabel,
}) {
  if (!hasDependencyActionBridge(bridgeMethod)) {
    state.error = recordError('需要重新啟動應用程式才能使用這個維護動作。', {
      code: 'BRIDGE_UNAVAILABLE',
      severity: 'warning',
      title: '需要重新啟動',
      source: 'feature-dependencies',
      operation,
    });
    return;
  }

  if (state.actionIds.has(actionKey) || state.preparingIds.has(dependencyId)) {
    return;
  }

  state.actionIds.add(actionKey);
  try {
    const dependency = await window.Utawakui[bridgeMethod](dependencyId);
    state.byId = {
      ...state.byId,
      [dependency.id]: dependency,
    };
    state.error = null;
  } catch (err) {
    state.error = recordError(err, {
      code: `FEATURE_DEPENDENCY_${operation.toUpperCase()}_FAILED`,
      title,
      source: 'feature-dependencies',
      operation,
      actionLabel,
      context: { dependencyId },
    });
  } finally {
    state.actionIds.delete(actionKey);
    clearDependencyProgress(dependencyId);
  }
}

async function removeDependency(dependencyId) {
  await runDependencyAction({
    dependencyId,
    actionKey: `remove:${dependencyId}`,
    bridgeMethod: 'removeFeatureDependency',
    operation: 'remove',
    title: '移除項目失敗',
    actionLabel: '重新讀取',
  });
}

async function repairDependency(dependencyId) {
  await runDependencyAction({
    dependencyId,
    actionKey: `repair:${dependencyId}`,
    bridgeMethod: 'repairFeatureDependency',
    operation: 'repair',
    title: '修復項目失敗',
    actionLabel: '重試',
  });
}

if (
  typeof window !== 'undefined' &&
  typeof window.Utawakui?.onFeatureDependenciesUpdated === 'function'
) {
  unsubscribeUpdates =
    window.Utawakui.onFeatureDependenciesUpdated(applyDependencies);
}

if (
  typeof window !== 'undefined' &&
  typeof window.Utawakui?.onFeatureDependencyProgress === 'function'
) {
  unsubscribeProgress = window.Utawakui.onFeatureDependencyProgress(
    applyDependencyProgress,
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeUpdates?.();
    unsubscribeProgress?.();
  });
}

export function useFeatureDependencies() {
  return {
    state: readonly(state),
    refreshDependencies,
    prepareDependency,
    removeDependency,
    repairDependency,
  };
}
