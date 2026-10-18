import { reactive, readonly } from 'vue';
import { FEATURE_DEPENDENCIES } from '../constants/featureDependencies.js';
import { useTaskNotification } from './useTaskNotification.js';
import { useAppView } from './useAppView.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const { recordError } = useAppDiagnostics();

const state = reactive({
  byId: {},
  isLoading: false,
  preparingIds: new Set(),
  actionIds: new Set(),
  progressById: {},
  error: null,
  readError: null,
  errorsById: {},
});

const taskFeedback = new Map();
const STAGES = {
  starting: '準備中',
  downloading: '下載中',
  verifying: '驗證中',
  installing: '安裝中',
  ready: '確認完成',
};
const OPERATIONS = { prepare: '準備', repair: '修復', remove: '移除' };
function isDependencyBusy(id) {
  return (
    state.preparingIds.has(id) ||
    [...state.actionIds].some((key) => key.endsWith(`:${id}`))
  );
}
function beginFeedback(dependencyId, operation) {
  const dependency = FEATURE_DEPENDENCIES.find(({ id }) => id === dependencyId);
  const name = dependency?.name || '功能元件';
  const section =
    dependency?.featureId === 'provider-flow' ? 'sources' : 'processing';
  const openSettings = () => useAppView().openSettings(section);
  const feedback = useTaskNotification({
    key: `task:dependency:${dependencyId}`,
    title: `${name}${OPERATIONS[operation]}中`,
    action: openSettings,
  });
  taskFeedback.set(dependencyId, feedback);
  return {
    finish(error = null) {
      feedback.finish(
        error
          ? {
              title: `${name}${OPERATIONS[operation]}未完成`,
              message: error.message,
              tone: 'danger',
              actionLabel: operation === 'remove' ? '查看設定' : '重試',
              action:
                operation === 'remove'
                  ? openSettings
                  : () =>
                      operation === 'repair'
                        ? repairDependency(dependencyId)
                        : prepareDependency(dependencyId),
            }
          : { title: `${name}已${OPERATIONS[operation]}` },
      );
      if (taskFeedback.get(dependencyId) === feedback)
        taskFeedback.delete(dependencyId);
    },
  };
}

let unsubscribeUpdates = null;
let unsubscribeProgress = null;
let readRevision = 0;

function invalidateRead() {
  ++readRevision;
  state.isLoading = false;
}

function recordDependencyFailure(error, options) {
  const notice = recordError(error, options);
  if (options.operation === 'refresh') state.readError = notice;
  else if (options.context?.dependencyId)
    state.errorsById[options.context.dependencyId] = notice;
  return notice;
}

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
  taskFeedback
    .get(payload.dependencyId)
    ?.progress(
      STAGES[payload.stage] || '處理中',
      Number.isFinite(payload.percent) ? payload.percent : null,
    );
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
  if (state.preparingIds.size || state.actionIds.size) return;
  const current = ++readRevision;
  if (!hasBridge()) {
    state.error = recordDependencyFailure('請重新啟動 Utawakui 後再試。', {
      code: 'BRIDGE_UNAVAILABLE',
      severity: 'warning',
      title: '需要重新啟動',
      source: 'feature-dependencies',
      operation: 'refresh',
      message: '請重新啟動 Utawakui 後再試。',
    });
    return;
  }

  state.isLoading = true;
  try {
    const dependencies = await window.Utawakui.listFeatureDependencies();
    if (current !== readRevision) return;
    applyDependencies(dependencies);
    state.readError = null;
    if (state.error?.operation === 'refresh') state.error = null;
  } catch (err) {
    if (current !== readRevision) return;
    state.error = recordDependencyFailure(err, {
      code: 'FEATURE_DEPENDENCY_STATUS_FAILED',
      title: '無法讀取準備狀態',
      source: 'feature-dependencies',
      operation: 'refresh',
      actionLabel: '重新讀取',
      message: '請再試一次。',
    });
  } finally {
    if (current === readRevision) state.isLoading = false;
  }
}

async function prepareDependency(dependencyId) {
  if (!hasBridge() || isDependencyBusy(dependencyId)) return;

  const feedback = beginFeedback(dependencyId, 'prepare');
  invalidateRead();
  state.preparingIds.add(dependencyId);
  applyDependencyProgress({ dependencyId, stage: 'starting' });
  try {
    const dependency =
      await window.Utawakui.prepareFeatureDependency(dependencyId);
    state.byId = {
      ...state.byId,
      [dependency.id]: dependency,
    };
    delete state.errorsById[dependencyId];
    if (state.error?.context?.dependencyId === dependencyId) state.error = null;
    feedback.finish();
  } catch (err) {
    state.error = recordDependencyFailure(err, {
      code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
      title: '準備失敗',
      source: 'feature-dependencies',
      operation: 'prepare',
      actionLabel: '重試',
      context: { dependencyId },
      message: '請再試一次。',
    });
    feedback.finish(state.errorsById[dependencyId]);
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
    state.error = recordDependencyFailure('請重新啟動 Utawakui 後再試。', {
      code: 'BRIDGE_UNAVAILABLE',
      severity: 'warning',
      title: '需要重新啟動',
      source: 'feature-dependencies',
      operation,
      context: { dependencyId },
      message: '請重新啟動 Utawakui 後再試。',
    });
    return;
  }

  if (isDependencyBusy(dependencyId)) {
    return;
  }

  const feedback = beginFeedback(dependencyId, operation);
  invalidateRead();
  state.actionIds.add(actionKey);
  try {
    const dependency = await window.Utawakui[bridgeMethod](dependencyId);
    state.byId = {
      ...state.byId,
      [dependency.id]: dependency,
    };
    delete state.errorsById[dependencyId];
    if (state.error?.context?.dependencyId === dependencyId) state.error = null;
    feedback.finish();
  } catch (err) {
    state.error = recordDependencyFailure(err, {
      code: `FEATURE_DEPENDENCY_${operation.toUpperCase()}_FAILED`,
      title,
      source: 'feature-dependencies',
      operation,
      actionLabel,
      context: { dependencyId },
      message: '請再試一次。',
    });
    feedback.finish(state.errorsById[dependencyId]);
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
  unsubscribeUpdates = window.Utawakui.onFeatureDependenciesUpdated(
    (dependencies) => {
      invalidateRead();
      applyDependencies(dependencies);
    },
  );
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
