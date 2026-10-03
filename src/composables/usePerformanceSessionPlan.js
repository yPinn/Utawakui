import { computed, reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

function createEmptyPlan() {
  return {
    version: 1,
    updatedAt: null,
    source: null,
    reviewCursorItemId: null,
    items: [],
    summary: {
      total: 0,
      verified: 0,
      unreviewed: 0,
      manual: 0,
      needsLink: 0,
      unavailable: 0,
      sourceChanged: 0,
      ready: 0,
      needsAttention: 0,
    },
  };
}

const state = reactive({
  plan: createEmptyPlan(),
  isLoading: false,
  isSaving: false,
  isInitialized: false,
  error: null,
  validationError: null,
});
const { recordError } = useAppDiagnostics();

let pending = Promise.resolve();
let activeSaves = 0;
let initializationPromise = null;
let unsubscribeLibraryUpdated = null;

const selectedItem = computed(
  () =>
    state.plan.items.find(
      (entry) => entry.itemId === state.plan.reviewCursorItemId,
    ) ?? null,
);

function hasBridge() {
  return typeof window !== 'undefined' && Boolean(window.Utawakui);
}

function applyResult(result) {
  if (result?.ok === true && result.plan) {
    state.plan = result.plan;
    state.error = null;
    state.validationError = null;
    return true;
  }
  if (result?.ok === false && result.error) {
    state.validationError = result.error;
    return false;
  }
  throw new Error('invalid performance session plan response');
}

function recordOperationError(error, operation) {
  state.validationError = null;
  state.error = recordError(error, {
    code: 'PERFORMANCE_SESSION_PLAN_RENDERER_FAILED',
    title: '場次草稿未更新',
    message: '場次草稿未更新，請再試一次。',
    source: 'performance-session-plan',
    operation,
    context: { retryable: true },
  }).message;
}

function enqueue(operation, { saving = true, name = 'mutate' } = {}) {
  if (!hasBridge()) return Promise.resolve(false);

  if (saving) {
    activeSaves += 1;
    state.isSaving = true;
  }

  const task = pending.then(async () => {
    try {
      return applyResult(await operation());
    } catch (error) {
      recordOperationError(error, name);
      return false;
    } finally {
      if (saving) {
        activeSaves -= 1;
        state.isSaving = activeSaves > 0;
      }
    }
  });

  pending = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function refresh() {
  if (!hasBridge()) {
    state.isLoading = false;
    return Promise.resolve(false);
  }
  state.isLoading = true;
  return enqueue(() => window.Utawakui.getPerformanceSessionPlan(), {
    saving: false,
    name: 'get',
  }).finally(() => {
    state.isLoading = false;
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    if (!hasBridge()) {
      state.isInitialized = true;
      return;
    }
    unsubscribeLibraryUpdated ??=
      window.Utawakui.onLibraryUpdated?.(() => refresh()) ?? null;
    await refresh();
    state.isInitialized = true;
  })();
  return initializationPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeLibraryUpdated?.();
  });
}

function replaceFromCollection(sourceId, replaceCurrent = false) {
  return enqueue(() =>
    window.Utawakui.replacePerformanceSessionPlanFromCollection({
      sourceId,
      replaceCurrent,
    }),
  );
}

function appendPlaceholders(text) {
  return enqueue(() =>
    window.Utawakui.appendPerformanceSessionPlanPlaceholders(text),
  );
}

function appendLibraryTrack(trackId) {
  return enqueue(() =>
    window.Utawakui.appendPerformanceSessionPlanLibraryTrack(trackId),
  );
}

function appendManualItem(fields) {
  return enqueue(() =>
    window.Utawakui.appendPerformanceSessionPlanManualItem({
      displayTitle: fields.displayTitle,
      displayArtist: fields.displayArtist,
    }),
  );
}

function findItem(itemId) {
  return state.plan.items.find((entry) => entry.itemId === itemId) ?? null;
}

function updateItem(itemId, fields) {
  const current = findItem(itemId);
  if (!current) return Promise.resolve(false);
  const intent = {
    itemId,
    expectedRevision: current.revision,
    displayTitle: fields.displayTitle,
    displayArtist: fields.displayArtist,
  };
  if (Object.hasOwn(fields, 'trackId')) intent.trackId = fields.trackId;
  return enqueue(() =>
    window.Utawakui.updatePerformanceSessionPlanItem(intent),
  );
}

function saveDisplay(itemId, fields) {
  return updateItem(itemId, {
    displayTitle: fields.displayTitle,
    displayArtist: fields.displayArtist,
  });
}

function relinkItem(itemId, fields) {
  return updateItem(itemId, {
    displayTitle: fields.displayTitle,
    displayArtist: fields.displayArtist,
    trackId: fields.trackId,
  });
}

function moveItem(itemId, offset) {
  return enqueue(() =>
    window.Utawakui.movePerformanceSessionPlanItem({ itemId, offset }),
  );
}

function duplicateItem(itemId) {
  return enqueue(() =>
    window.Utawakui.duplicatePerformanceSessionPlanItem(itemId),
  );
}

function removeItem(itemId) {
  return enqueue(() =>
    window.Utawakui.removePerformanceSessionPlanItem(itemId),
  );
}

function selectItem(itemId) {
  return enqueue(() =>
    window.Utawakui.setPerformanceSessionPlanReviewCursor(itemId),
  );
}

function clear() {
  return enqueue(() => window.Utawakui.clearPerformanceSessionPlan());
}

export function usePerformanceSessionPlan() {
  return {
    state: readonly(state),
    selectedItem,
    initialize,
    refresh,
    replaceFromCollection,
    appendLibraryTrack,
    appendManualItem,
    appendPlaceholders,
    saveDisplay,
    relinkItem,
    moveItem,
    duplicateItem,
    removeItem,
    selectItem,
    clear,
  };
}
