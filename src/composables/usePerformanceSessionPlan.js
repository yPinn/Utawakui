import { computed, readonly } from 'vue';
import { useSerializedPlanStore } from './useSerializedPlanStore.js';
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

function hasBridge() {
  return typeof window !== 'undefined' && Boolean(window.Utawakui);
}

const { state, enqueue, refresh, initialize, dispose } = useSerializedPlanStore(
  {
    createEmptyPlan,
    hasBridge,
    fetchPlan: () => window.Utawakui.getPerformanceSessionPlan(),
    invalidResponseMessage: 'invalid performance session plan response',
    errorPresentation: {
      code: 'PERFORMANCE_SESSION_PLAN_RENDERER_FAILED',
      title: '場次草稿未更新',
      message: '場次草稿未更新，請再試一次。',
      source: 'performance-session-plan',
    },
    recordError: useAppDiagnostics().recordError,
  },
);

if (import.meta.hot) import.meta.hot.dispose(dispose);

const selectedItem = computed(
  () =>
    state.plan.items.find(
      (entry) => entry.itemId === state.plan.reviewCursorItemId,
    ) ?? null,
);

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
