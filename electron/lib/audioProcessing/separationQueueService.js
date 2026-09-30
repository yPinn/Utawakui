'use strict';

const { isSafeTrackId } = require('../library/paths');

const MAX_QUEUE_ITEMS = 500;
const ACTIVE_ITEM_STATUSES = new Set(['checking', 'running']);
const OPEN_ITEM_STATUSES = new Set(['pending', ...ACTIVE_ITEM_STATUSES]);
const TERMINAL_ITEM_STATUSES = new Set([
  'completed',
  'skipped',
  'failed',
  'cancelled',
]);
const CLEARABLE_ITEM_STATUSES = new Set(['completed', 'skipped']);

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeBoundedId(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !hasControlCharacters(value)
  );
}

function validateTrackIds(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_QUEUE_ITEMS
  ) {
    throw new Error('invalid separation queue track ids');
  }
  const unique = [];
  const seen = new Set();
  for (const trackId of value) {
    if (
      !isSafeTrackId(trackId) ||
      trackId.length > 255 ||
      hasControlCharacters(trackId)
    ) {
      throw new Error('invalid separation queue track ids');
    }
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    unique.push(trackId);
  }
  if (unique.length === 0) {
    throw new Error('invalid separation queue track ids');
  }
  return unique;
}

function publicItem(entry) {
  return {
    itemId: entry.itemId,
    trackId: entry.trackId,
    recipeId: entry.recipeId,
    status: entry.status,
    ...(typeof entry.stage === 'string' ? { stage: entry.stage } : {}),
    ...(Number.isFinite(entry.percent) ? { percent: entry.percent } : {}),
    ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
  };
}

function createSeparationQueueService({
  resolveRecipe,
  runTrack,
  hasCurrentResult,
  cancelActiveTrack,
  createItemId,
  onUpdate = () => {},
  scheduleTask = queueMicrotask,
}) {
  if (
    typeof resolveRecipe !== 'function' ||
    typeof runTrack !== 'function' ||
    typeof hasCurrentResult !== 'function' ||
    typeof cancelActiveTrack !== 'function' ||
    typeof createItemId !== 'function' ||
    typeof onUpdate !== 'function' ||
    typeof scheduleTask !== 'function'
  ) {
    throw new Error('invalid separation queue dependencies');
  }

  let items = [];
  let paused = false;
  let activeItemId = null;
  let draining = false;
  let drainScheduled = false;

  function snapshot() {
    if (items.length === 0) return { queue: null };
    const active = items.find(({ itemId }) => itemId === activeItemId) ?? null;
    const pending = items.filter(({ status }) => status === 'pending').length;
    const completed = items.filter(
      ({ status }) => status === 'completed',
    ).length;
    const skipped = items.filter(({ status }) => status === 'skipped').length;
    const failed = items.filter(({ status }) => status === 'failed').length;
    const cancelled = items.filter(
      ({ status }) => status === 'cancelled',
    ).length;
    const done = completed + skipped + failed + cancelled;
    const status = paused
      ? active
        ? 'pausing'
        : 'paused'
      : active || pending > 0
        ? 'running'
        : 'idle';
    return {
      queue: {
        status,
        paused,
        total: items.length,
        done,
        completed,
        skipped,
        failed,
        cancelled,
        pending,
        activeItemId,
        items: items.map(publicItem),
      },
    };
  }

  function emitUpdate() {
    const value = snapshot();
    onUpdate(value);
    return value;
  }

  function findEntry(itemId) {
    return items.find((entry) => entry.itemId === itemId) ?? null;
  }

  function settleWaiters(entry) {
    const waiters = entry.waiters.splice(0);
    for (const waiter of waiters) {
      if (['completed', 'skipped'].includes(entry.status)) {
        waiter.resolve({
          itemId: entry.itemId,
          status: entry.status,
          result: entry.result,
        });
      } else {
        waiter.reject(
          entry.error ?? new Error('audio-processing job cancelled'),
        );
      }
    }
  }

  function requestDrain() {
    if (drainScheduled || draining || paused) return;
    if (!items.some(({ status }) => status === 'pending')) return;
    drainScheduled = true;
    scheduleTask(async () => {
      drainScheduled = false;
      await drain();
    });
  }

  async function drain() {
    if (draining || paused) return;
    draining = true;
    try {
      while (!paused) {
        const entry = items.find(({ status }) => status === 'pending');
        if (!entry) break;

        activeItemId = entry.itemId;
        entry.status = 'checking';
        emitUpdate();
        try {
          const currentResult = entry.regenerate
            ? false
            : await hasCurrentResult({
                trackId: entry.trackId,
                recipeId: entry.recipeId,
              });
          if (entry.cancelRequested) {
            throw new Error('audio-processing job cancelled');
          }
          if (currentResult) {
            entry.status = 'skipped';
          } else {
            entry.status = 'running';
            entry.stage = 'preparing';
            entry.percent = 0;
            emitUpdate();
            entry.result = await runTrack({
              trackId: entry.trackId,
              recipeId: entry.recipeId,
              onProgress: (progress) => {
                if (entry.status !== 'running') return;
                if (typeof progress?.stage === 'string') {
                  entry.stage = progress.stage.slice(0, 64);
                }
                if (Number.isFinite(progress?.percent)) {
                  entry.percent = Math.min(100, Math.max(0, progress.percent));
                }
                emitUpdate();
              },
            });
            entry.status = 'completed';
            entry.percent = 100;
          }
        } catch (error) {
          entry.error = error;
          if (
            entry.cancelRequested ||
            String(error?.message).includes('cancelled')
          ) {
            entry.status = 'cancelled';
          } else {
            entry.status = 'failed';
            entry.reason = String(error?.message).includes('missing audio')
              ? 'source-unavailable'
              : 'processing-failed';
          }
          delete entry.percent;
          delete entry.stage;
        } finally {
          activeItemId = null;
          settleWaiters(entry);
          emitUpdate();
        }
      }
    } finally {
      draining = false;
      requestDrain();
    }
  }

  function enqueue({ trackIds, recipeId, regenerate = false } = {}) {
    if (typeof regenerate !== 'boolean') {
      throw new Error('invalid separation queue options');
    }
    const uniqueTrackIds = validateTrackIds(trackIds);
    const recipe = resolveRecipe(recipeId);
    const newCount = uniqueTrackIds.filter(
      (trackId) =>
        !items.some(
          (entry) =>
            OPEN_ITEM_STATUSES.has(entry.status) &&
            entry.trackId === trackId &&
            entry.recipeId === recipe.id,
        ),
    ).length;
    // The entire public snapshot is bounded, not only unfinished work. This
    // keeps every emitted payload inside the preload/renderer contract until
    // the operator clears successful history.
    if (items.length + newCount > MAX_QUEUE_ITEMS) {
      throw new Error('separation queue is full');
    }

    const itemIds = [];
    for (const trackId of uniqueTrackIds) {
      const existing = items.find(
        (entry) =>
          OPEN_ITEM_STATUSES.has(entry.status) &&
          entry.trackId === trackId &&
          entry.recipeId === recipe.id,
      );
      if (existing) {
        itemIds.push(existing.itemId);
        continue;
      }
      const itemId = createItemId();
      if (!safeBoundedId(itemId, 128)) {
        throw new Error('invalid separation queue item id');
      }
      items.push({
        itemId,
        trackId,
        recipeId: recipe.id,
        regenerate,
        status: 'pending',
        cancelRequested: false,
        waiters: [],
      });
      itemIds.push(itemId);
    }
    const value = emitUpdate();
    requestDrain();
    return { ...value, itemIds };
  }

  function waitForItem(itemId) {
    const entry = findEntry(itemId);
    if (!entry)
      return Promise.reject(new Error('unknown separation queue item'));
    if (TERMINAL_ITEM_STATUSES.has(entry.status)) {
      if (['completed', 'skipped'].includes(entry.status)) {
        return Promise.resolve({
          itemId: entry.itemId,
          status: entry.status,
          result: entry.result,
        });
      }
      return Promise.reject(
        entry.error ?? new Error('audio-processing job cancelled'),
      );
    }
    return new Promise((resolve, reject) => {
      entry.waiters.push({ resolve, reject });
    });
  }

  function pause() {
    paused = true;
    return emitUpdate();
  }

  function resume() {
    paused = false;
    const value = emitUpdate();
    requestDrain();
    return value;
  }

  function move(itemId, direction) {
    if (![1, -1].includes(direction)) return false;
    const entry = findEntry(itemId);
    if (entry?.status !== 'pending') return false;
    const pending = items.filter(({ status }) => status === 'pending');
    const pendingIndex = pending.indexOf(entry);
    const target = pending[pendingIndex + direction];
    if (!target) return false;
    const entryIndex = items.indexOf(entry);
    const targetIndex = items.indexOf(target);
    items[entryIndex] = target;
    items[targetIndex] = entry;
    emitUpdate();
    return true;
  }

  function remove(itemId) {
    const entry = findEntry(itemId);
    if (!entry || !['pending', 'failed', 'cancelled'].includes(entry.status)) {
      return false;
    }
    if (entry.status === 'pending') {
      entry.status = 'cancelled';
      entry.error = new Error('audio-processing job cancelled');
      settleWaiters(entry);
    }
    items = items.filter((candidate) => candidate !== entry);
    emitUpdate();
    return true;
  }

  function retry(itemId) {
    const entry = findEntry(itemId);
    if (!entry || !['failed', 'cancelled'].includes(entry.status)) return false;
    Object.assign(entry, {
      status: 'pending',
      cancelRequested: false,
      waiters: [],
    });
    delete entry.error;
    delete entry.reason;
    delete entry.result;
    delete entry.stage;
    delete entry.percent;
    emitUpdate();
    requestDrain();
    return true;
  }

  function clearCompleted() {
    const before = items.length;
    items = items.filter(({ status }) => !CLEARABLE_ITEM_STATUSES.has(status));
    const removed = before - items.length;
    if (removed > 0) emitUpdate();
    return removed;
  }

  async function cancelActive() {
    const entry = findEntry(activeItemId);
    if (!entry || !ACTIVE_ITEM_STATUSES.has(entry.status)) return false;
    entry.cancelRequested = true;
    emitUpdate();
    if (entry.status === 'checking') return true;
    const cancelled = await cancelActiveTrack();
    if (cancelled === false) entry.cancelRequested = false;
    return cancelled !== false;
  }

  return {
    enqueue,
    waitForItem,
    getStatus: snapshot,
    pause,
    resume,
    move,
    remove,
    retry,
    clearCompleted,
    cancelActive,
  };
}

module.exports = {
  MAX_QUEUE_ITEMS,
  createSeparationQueueService,
};
