import { computed, readonly, shallowRef } from 'vue';

const MAX_QUEUE_ITEMS = 500;
const QUEUE_STATUSES = new Set(['idle', 'running', 'pausing', 'paused']);
const ITEM_STATUSES = new Set([
  'pending',
  'checking',
  'running',
  'completed',
  'skipped',
  'failed',
  'cancelled',
]);
const ACTIVE_ITEM_STATUSES = new Set(['checking', 'running']);
const ITEM_REASONS = new Set(['source-unavailable', 'processing-failed']);
const RECIPE_IDS = new Set(['quick', 'general']);

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeId(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !hasControlCharacters(value)
  );
}

function boundedCount(value, total) {
  return Number.isSafeInteger(value) && value >= 0 && value <= total;
}

function normalizeItem(value) {
  if (
    !value ||
    !safeId(value.itemId, 128) ||
    !safeId(value.trackId, 255) ||
    !RECIPE_IDS.has(value.recipeId) ||
    !ITEM_STATUSES.has(value.status)
  ) {
    return null;
  }
  if (
    value.stage !== undefined &&
    (typeof value.stage !== 'string' ||
      value.stage.length > 64 ||
      hasControlCharacters(value.stage))
  ) {
    return null;
  }
  if (
    value.percent !== undefined &&
    (!Number.isFinite(value.percent) ||
      value.percent < 0 ||
      value.percent > 100)
  ) {
    return null;
  }
  if (value.reason !== undefined && !ITEM_REASONS.has(value.reason)) {
    return null;
  }
  return {
    itemId: value.itemId,
    trackId: value.trackId,
    recipeId: value.recipeId,
    status: value.status,
    ...(typeof value.stage === 'string' ? { stage: value.stage } : {}),
    ...(Number.isFinite(value.percent) ? { percent: value.percent } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

export function normalizeSeparationQueueStatus(payload) {
  if (payload?.queue === null) return null;
  const value = payload?.queue;
  if (
    !value ||
    !QUEUE_STATUSES.has(value.status) ||
    typeof value.paused !== 'boolean' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 1 ||
    value.total > MAX_QUEUE_ITEMS ||
    !Array.isArray(value.items) ||
    value.items.length !== value.total
  ) {
    throw new Error('invalid separation queue status');
  }
  const items = value.items.map(normalizeItem);
  if (items.some((item) => item === null)) {
    throw new Error('invalid separation queue status');
  }
  for (const key of [
    'done',
    'completed',
    'skipped',
    'failed',
    'cancelled',
    'pending',
  ]) {
    if (!boundedCount(value[key], value.total)) {
      throw new Error('invalid separation queue status');
    }
  }
  if (
    value.done !==
      value.completed + value.skipped + value.failed + value.cancelled ||
    value.pending !== items.filter(({ status }) => status === 'pending').length
  ) {
    throw new Error('invalid separation queue status');
  }
  const activeItems = items.filter(({ status }) =>
    ACTIVE_ITEM_STATUSES.has(status),
  );
  const activeItem = activeItems.find(
    ({ itemId }) => itemId === value.activeItemId,
  );
  if (
    activeItems.length > 1 ||
    (value.activeItemId === null) !== (activeItems.length === 0) ||
    (value.activeItemId !== null && !activeItem) ||
    value.total !== value.done + value.pending + activeItems.length ||
    value.paused !== ['pausing', 'paused'].includes(value.status) ||
    (value.status === 'pausing' && activeItems.length !== 1) ||
    (value.status === 'paused' && activeItems.length !== 0) ||
    (value.status === 'idle' &&
      (activeItems.length !== 0 || value.pending !== 0)) ||
    (value.status === 'running' &&
      activeItems.length === 0 &&
      value.pending === 0)
  ) {
    throw new Error('invalid separation queue status');
  }
  return {
    status: value.status,
    paused: value.paused,
    total: value.total,
    done: value.done,
    completed: value.completed,
    skipped: value.skipped,
    failed: value.failed,
    cancelled: value.cancelled,
    pending: value.pending,
    activeItemId: value.activeItemId,
    items,
  };
}

export function useSeparationQueue({ bridge = window.Utawakui } = {}) {
  const queue = shallowRef(null);
  const error = shallowRef('');
  let unsubscribe = null;
  let disposed = false;

  const active = computed(() =>
    ['running', 'pausing'].includes(queue.value?.status),
  );

  function applyStatus(payload) {
    if (disposed) return null;
    try {
      queue.value = normalizeSeparationQueueStatus(payload);
      error.value = '';
      return queue.value;
    } catch {
      queue.value = null;
      error.value = '處理清單暫時無法讀取，請重新開啟後再試。';
      return null;
    }
  }

  async function refreshStatus() {
    if (typeof bridge?.getSeparationQueueStatus !== 'function') return null;
    try {
      return applyStatus(await bridge.getSeparationQueueStatus());
    } catch {
      error.value = '處理清單暫時無法讀取，請稍後再試。';
      return null;
    }
  }

  async function initialize() {
    if (!unsubscribe) {
      unsubscribe = bridge?.onSeparationQueueProgress?.(applyStatus) ?? null;
    }
    return refreshStatus();
  }

  async function enqueue(trackIds, recipeId = 'general', regenerate = false) {
    const uniqueTrackIds = [
      ...new Set(
        Array.isArray(trackIds)
          ? trackIds.filter((trackId) => safeId(trackId, 255))
          : [],
      ),
    ].slice(0, MAX_QUEUE_ITEMS);
    if (
      uniqueTrackIds.length === 0 ||
      !RECIPE_IDS.has(recipeId) ||
      typeof bridge?.enqueueSeparations !== 'function'
    ) {
      return null;
    }
    try {
      return applyStatus(
        await bridge.enqueueSeparations(
          uniqueTrackIds,
          recipeId,
          regenerate === true,
        ),
      );
    } catch {
      error.value = '歌曲目前無法加入，請到設定完成準備後再試。';
      return null;
    }
  }

  async function applyStatusAction(methodName) {
    if (typeof bridge?.[methodName] !== 'function') return null;
    try {
      return applyStatus(await bridge[methodName]());
    } catch {
      error.value = '目前無法更新處理清單，請再試一次。';
      return null;
    }
  }

  async function applyRefreshAction(methodName, ...args) {
    if (typeof bridge?.[methodName] !== 'function') return false;
    try {
      const result = await bridge[methodName](...args);
      await refreshStatus();
      return result;
    } catch {
      error.value = '目前無法更新處理清單，請再試一次。';
      return false;
    }
  }

  const pause = () => applyStatusAction('pauseSeparationQueue');
  const resume = () => applyStatusAction('resumeSeparationQueue');
  const move = (itemId, offset) =>
    safeId(itemId, 128) &&
    Number.isSafeInteger(offset) &&
    offset !== 0 &&
    Math.abs(offset) < MAX_QUEUE_ITEMS
      ? applyRefreshAction('moveSeparationQueueItem', itemId, offset)
      : false;
  const remove = (itemId) =>
    safeId(itemId, 128)
      ? applyRefreshAction('removeSeparationQueueItem', itemId)
      : false;
  const retry = (itemId) =>
    safeId(itemId, 128)
      ? applyRefreshAction('retrySeparationQueueItem', itemId)
      : false;
  const clearCompleted = () => applyRefreshAction('clearCompletedSeparations');
  const cancelActive = () => applyRefreshAction('cancelSeparation');

  function dispose() {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
  }

  return {
    queue: readonly(queue),
    error: readonly(error),
    active,
    initialize,
    refreshStatus,
    enqueue,
    pause,
    resume,
    move,
    remove,
    retry,
    clearCompleted,
    cancelActive,
    dispose,
  };
}
