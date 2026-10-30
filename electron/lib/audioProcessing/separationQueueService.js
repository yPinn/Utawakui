'use strict';

const { isBoundedTrackId } = require('../library/paths');
const { hasControlCharacters } = require('../textGuards');
const { normalizeSeparationOutputFormat } = require('./separationOutputJob');

const MAX_QUEUE_ITEMS = 500;
const ACTIVE_ITEM_STATUSES = new Set(['checking', 'running']);
const OPEN_ITEM_STATUSES = new Set(['pending', ...ACTIVE_ITEM_STATUSES]);
const TERMINAL_ITEM_STATUSES = new Set([
  'completed',
  'skipped',
  'failed',
  'cancelled',
]);
// Every emit carries the whole (up to 500 item) queue, so progress ticks are
// coalesced; stage changes and status transitions always emit immediately.
const PROGRESS_EMIT_INTERVAL_MS = 250;
const CANCELLED_MESSAGE = 'audio-processing job cancelled';
const CLEARABLE_ITEM_STATUSES = new Set(['completed', 'skipped']);

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
    if (!isBoundedTrackId(trackId)) {
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
    ...(entry.outputFormat === 'flac5' ? { outputFormat: 'flac5' } : {}),
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
  now = Date.now,
  getScopeKey = () => '',
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
  let lastProgressEmitAt = -Infinity;

  function assertCurrent(entry) {
    if (entry.scopeKey !== getScopeKey()) {
      throw Object.assign(new Error('separation library scope changed'), {
        code: 'SEPARATION_SOURCE_UNAVAILABLE',
        failureReason: 'source-unavailable',
      });
    }
  }

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
        waiter.reject(entry.error ?? new Error(CANCELLED_MESSAGE));
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
          assertCurrent(entry);
          const currentResult = entry.regenerate
            ? false
            : await hasCurrentResult({
                trackId: entry.trackId,
                recipeId: entry.recipeId,
              });
          assertCurrent(entry);
          if (entry.cancelRequested) {
            throw new Error(CANCELLED_MESSAGE);
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
              ...(entry.outputFormat === 'flac5'
                ? { outputFormat: 'flac5' }
                : {}),
              assertCurrent: () => assertCurrent(entry),
              onProgress: (progress) => {
                if (entry.status !== 'running') return;
                const previousStage = entry.stage;
                if (typeof progress?.stage === 'string') {
                  entry.stage = progress.stage.slice(0, 64);
                }
                if (Number.isFinite(progress?.percent)) {
                  entry.percent = Math.min(100, Math.max(0, progress.percent));
                }
                const tick = now();
                if (
                  entry.stage === previousStage &&
                  tick - lastProgressEmitAt < PROGRESS_EMIT_INTERVAL_MS
                ) {
                  return;
                }
                lastProgressEmitAt = tick;
                emitUpdate();
              },
            });
            assertCurrent(entry);
            entry.status = 'completed';
            entry.percent = 100;
          }
        } catch (error) {
          // A cancellation request is not an acknowledgement. Let its decision
          // settle before classifying a concurrent worker failure.
          if (entry.cancellation) await entry.cancellation.catch(() => false);
          entry.error = error;
          if (entry.cancelRequested || error?.message === CANCELLED_MESSAGE) {
            entry.status = 'cancelled';
          } else {
            entry.status = 'failed';
            entry.reason =
              error?.failureReason === 'source-unavailable'
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

  function enqueue({
    trackIds,
    recipeId,
    regenerate = false,
    outputFormat,
  } = {}) {
    const format = normalizeSeparationOutputFormat(outputFormat);
    if (typeof regenerate !== 'boolean') {
      throw new Error('invalid separation queue options');
    }
    const uniqueTrackIds = validateTrackIds(trackIds);
    const recipe = resolveRecipe(recipeId);
    const scopeKey = getScopeKey();
    const newCount = uniqueTrackIds.filter(
      (trackId) =>
        !items.some(
          (entry) =>
            OPEN_ITEM_STATUSES.has(entry.status) &&
            entry.scopeKey === scopeKey &&
            entry.trackId === trackId &&
            entry.recipeId === recipe.id &&
            entry.outputFormat === format,
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
          entry.scopeKey === scopeKey &&
          entry.trackId === trackId &&
          entry.recipeId === recipe.id &&
          entry.outputFormat === format,
      );
      if (existing) {
        // An explicit regenerate request must not be absorbed by earlier
        // queued work that would skip a current result.
        if (regenerate && existing.status === 'pending') {
          existing.regenerate = true;
        }
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
        outputFormat: format,
        scopeKey,
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
      return Promise.reject(entry.error ?? new Error(CANCELLED_MESSAGE));
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

  function move(itemId, offset) {
    if (
      !Number.isSafeInteger(offset) ||
      offset === 0 ||
      Math.abs(offset) >= MAX_QUEUE_ITEMS
    ) {
      return false;
    }
    const entry = findEntry(itemId);
    if (entry?.status !== 'pending') return false;
    const pending = items.filter(({ status }) => status === 'pending');
    const pendingIndex = pending.indexOf(entry);
    const targetIndex = pendingIndex + offset;
    const target = pending[targetIndex];
    if (!target) return false;

    const step = Math.sign(offset);
    for (
      let currentIndex = pendingIndex;
      currentIndex !== targetIndex;
      currentIndex += step
    ) {
      const current = pending[currentIndex];
      const adjacent = pending[currentIndex + step];
      const currentItemIndex = items.indexOf(current);
      const adjacentItemIndex = items.indexOf(adjacent);
      items[currentItemIndex] = adjacent;
      items[adjacentItemIndex] = current;
      pending[currentIndex] = adjacent;
      pending[currentIndex + step] = current;
    }
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
      entry.error = new Error(CANCELLED_MESSAGE);
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

  function clearPending() {
    const pendingEntries = items.filter(({ status }) => status === 'pending');
    if (pendingEntries.length === 0) return 0;

    for (const entry of pendingEntries) {
      entry.status = 'cancelled';
      entry.error = new Error(CANCELLED_MESSAGE);
      settleWaiters(entry);
    }
    const pendingSet = new Set(pendingEntries);
    items = items.filter((entry) => !pendingSet.has(entry));
    emitUpdate();
    return pendingEntries.length;
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
    if (entry.cancellation) return entry.cancellation;
    entry.cancelRequested = true;
    emitUpdate();
    if (entry.status === 'checking') return true;
    const cancellation = Promise.resolve()
      .then(cancelActiveTrack)
      .then(
        (cancelled) => {
          if (cancelled === false) entry.cancelRequested = false;
          return cancelled !== false;
        },
        (error) => {
          entry.cancelRequested = false;
          throw error;
        },
      );
    entry.cancellation = cancellation;
    try {
      return await cancellation;
    } finally {
      if (entry.cancellation === cancellation) delete entry.cancellation;
    }
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
    clearPending,
    clearCompleted,
    cancelActive,
  };
}

module.exports = {
  MAX_QUEUE_ITEMS,
  createSeparationQueueService,
};
