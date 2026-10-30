import { reactive, readonly } from 'vue';
import { notificationKey } from '../constants/notificationKeys.js';
import { FEATURE_DEPENDENCIES } from '../constants/featureDependencies.js';
import { useTaskNotification } from './useTaskNotification.js';
import { useAppView } from './useAppView.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { t } from '../utils/i18n.js';

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
  starting: t('dependencies.progress.starting'),
  downloading: t('dependencies.progress.downloading'),
  verifying: t('dependencies.progress.verifying'),
  installing: t('dependencies.progress.installing'),
  ready: t('dependencies.progress.confirmed'),
};
const dependencyNotice = (operation, outcome, name) =>
  t(`dependencies.notify.${operation}.${outcome}`, { name });
function isDependencyBusy(id) {
  return (
    state.preparingIds.has(id) ||
    [...state.actionIds].some((key) => key.endsWith(`:${id}`))
  );
}
function beginFeedback(dependencyId, operation) {
  const dependency = FEATURE_DEPENDENCIES.find(({ id }) => id === dependencyId);
  const name = dependency?.name || t('dependencies.notify.fallbackName');
  const section =
    dependency?.featureId === 'provider-flow' ? 'sources' : 'processing';
  const openSettings = () => useAppView().openSettings(section);
  const feedback = useTaskNotification({
    key: notificationKey.taskDependency(dependencyId),
    title: dependencyNotice(operation, 'running', name),
    action: openSettings,
  });
  taskFeedback.set(dependencyId, feedback);
  return {
    finish(error = null) {
      feedback.finish(
        error
          ? {
              title: dependencyNotice(operation, 'failed', name),
              message: error.message,
              tone: 'danger',
              actionLabel:
                operation === 'remove'
                  ? t('dependencies.notify.viewSettings')
                  : t('dependencies.notify.retry'),
              action:
                operation === 'remove'
                  ? openSettings
                  : () =>
                      operation === 'repair'
                        ? repairDependency(dependencyId)
                        : prepareDependency(dependencyId),
            }
          : { title: dependencyNotice(operation, 'done', name) },
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
      STAGES[payload.stage] || t('dependencies.progress.working'),
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
    state.error = recordDependencyFailure(
      t('dependencies.notify.restartMessage'),
      {
        code: 'BRIDGE_UNAVAILABLE',
        severity: 'warning',
        title: t('dependencies.notify.restartTitle'),
        source: 'feature-dependencies',
        operation: 'refresh',
        message: t('dependencies.notify.restartMessage'),
      },
    );
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
      title: t('dependencies.notify.readFailed'),
      source: 'feature-dependencies',
      operation: 'refresh',
      actionLabel: t('dependencies.notify.reload'),
      message: t('dependencies.notify.tryAgain'),
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
      title: t('dependencies.notify.prepareFailed'),
      source: 'feature-dependencies',
      operation: 'prepare',
      actionLabel: t('dependencies.notify.retry'),
      context: { dependencyId },
      message: t('dependencies.notify.tryAgain'),
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
    state.error = recordDependencyFailure(
      t('dependencies.notify.restartMessage'),
      {
        code: 'BRIDGE_UNAVAILABLE',
        severity: 'warning',
        title: t('dependencies.notify.restartTitle'),
        source: 'feature-dependencies',
        operation,
        context: { dependencyId },
        message: t('dependencies.notify.restartMessage'),
      },
    );
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
      message: t('dependencies.notify.tryAgain'),
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
    title: t('dependencies.notify.removeFailed'),
    actionLabel: t('dependencies.notify.reload'),
  });
}

async function repairDependency(dependencyId) {
  await runDependencyAction({
    dependencyId,
    actionKey: `repair:${dependencyId}`,
    bridgeMethod: 'repairFeatureDependency',
    operation: 'repair',
    title: t('dependencies.notify.repairFailed'),
    actionLabel: t('dependencies.notify.retry'),
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
