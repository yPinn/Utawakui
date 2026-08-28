'use strict';

const crypto = require('crypto');
const { isSafeTrackId } = require('../library/paths');

const MAX_BATCH_TRACKS = 500;
const TERMINAL_ITEM_STATUSES = new Set([
  'completed',
  'failed',
  'skipped',
  'cancelled',
]);

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function validateTrackIds(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_BATCH_TRACKS
  ) {
    throw new Error('invalid structure-analysis batch track ids');
  }
  const unique = [];
  const seen = new Set();
  for (const trackId of value) {
    if (
      !isSafeTrackId(trackId) ||
      trackId.length > 255 ||
      hasControlCharacters(trackId)
    ) {
      throw new Error('invalid structure-analysis batch track ids');
    }
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    unique.push(trackId);
  }
  if (unique.length === 0) {
    throw new Error('invalid structure-analysis batch track ids');
  }
  return unique;
}

function isCurrentAnalysis(result, currentProfileIds) {
  return (
    result?.signals?.reason === 'current' &&
    ['M1', 'M2'].includes(result?.signals?.level) &&
    currentProfileIds.has(result?.analysisProfileId)
  );
}

function itemCounts(items) {
  return {
    completed: items.filter(({ status }) => TERMINAL_ITEM_STATUSES.has(status))
      .length,
    succeeded: items.filter(({ status }) => status === 'completed').length,
    failed: items.filter(({ status }) => status === 'failed').length,
    skipped: items.filter(({ status }) => status === 'skipped').length,
    cancelled: items.filter(({ status }) => status === 'cancelled').length,
  };
}

function snapshot(batch) {
  if (!batch) return { batch: null };
  const counts = itemCounts(batch.items);
  const activeItem = batch.items.find(({ status }) =>
    ['checking', 'running'].includes(status),
  );
  const runningFraction = Number.isFinite(activeItem?.percent)
    ? Math.min(100, Math.max(0, activeItem.percent)) / 100
    : 0;
  return {
    batch: {
      batchId: batch.batchId,
      status: batch.status,
      force: batch.force,
      total: batch.items.length,
      ...counts,
      activeTrackId: activeItem?.trackId ?? null,
      percent:
        batch.items.length === 0
          ? 0
          : Math.round(
              ((counts.completed + runningFraction) / batch.items.length) * 100,
            ),
      items: batch.items.map((item) => ({ ...item })),
    },
  };
}

function createStructureAnalysisBatchService({
  analysisService,
  inspectTrack,
  currentProfileIds,
  onTrackComplete = () => {},
  createBatchId = crypto.randomUUID,
}) {
  if (
    !analysisService ||
    typeof analysisService.run !== 'function' ||
    typeof analysisService.getActiveJob !== 'function' ||
    typeof analysisService.cancelActiveJob !== 'function' ||
    typeof inspectTrack !== 'function' ||
    !Array.isArray(currentProfileIds) ||
    currentProfileIds.length === 0 ||
    currentProfileIds.some(
      (profileId) => typeof profileId !== 'string' || profileId.length === 0,
    ) ||
    typeof onTrackComplete !== 'function' ||
    typeof createBatchId !== 'function'
  ) {
    throw new Error('invalid structure-analysis batch dependencies');
  }
  const supportedProfileIds = new Set(currentProfileIds);

  let batch = null;
  let updateListener = null;

  function active() {
    return batch && ['running', 'cancelling'].includes(batch.status);
  }

  function emitUpdate() {
    const value = snapshot(batch);
    updateListener?.(value);
    return value;
  }

  function cancelPendingItems() {
    for (const item of batch.items) {
      if (
        item.status === 'pending' ||
        item.status === 'checking' ||
        item.status === 'running'
      ) {
        Object.assign(item, { status: 'cancelled' });
        delete item.jobId;
        delete item.stage;
        delete item.percent;
      }
    }
  }

  function finishCancellationIfRequested() {
    if (!batch.cancelRequested) return false;
    cancelPendingItems();
    batch.status = 'cancelled';
    emitUpdate();
    return true;
  }

  async function runBatch() {
    for (const item of batch.items) {
      if (finishCancellationIfRequested()) return;

      item.status = 'checking';
      emitUpdate();
      try {
        const existing = await inspectTrack(item.trackId);
        if (finishCancellationIfRequested()) return;
        if (!batch.force && isCurrentAnalysis(existing, supportedProfileIds)) {
          item.status = 'skipped';
          emitUpdate();
          continue;
        }

        item.status = 'running';
        item.percent = 0;
        emitUpdate();
        await analysisService.run({
          trackId: item.trackId,
          onProgress: (progress) => {
            if (item.status !== 'running') return;
            if (typeof progress?.jobId === 'string')
              item.jobId = progress.jobId;
            if (typeof progress?.stage === 'string')
              item.stage = progress.stage;
            if (Number.isFinite(progress?.percent)) {
              item.percent = Math.min(100, Math.max(0, progress.percent));
            }
            emitUpdate();
          },
        });
        if (finishCancellationIfRequested()) return;
        Object.assign(item, { status: 'completed', percent: 100 });
        delete item.jobId;
        delete item.stage;
        try {
          await onTrackComplete(item.trackId);
        } catch {
          // A renderer refresh notification cannot invalidate a published sidecar.
        }
        emitUpdate();
      } catch (error) {
        if (
          batch.cancelRequested ||
          String(error?.message).includes('cancelled')
        ) {
          cancelPendingItems();
          batch.status = 'cancelled';
          emitUpdate();
          return;
        }
        Object.assign(item, {
          status: 'failed',
          reason: String(error?.message).includes('unavailable')
            ? 'unavailable-source'
            : 'analysis-failed',
        });
        delete item.jobId;
        delete item.stage;
        delete item.percent;
        emitUpdate();
      }
    }
    batch.status = 'completed';
    emitUpdate();
  }

  function start({ trackIds, force = false, onUpdate } = {}) {
    if (active()) {
      throw new Error('a structure-analysis batch is already running');
    }
    if (analysisService.getActiveJob()) {
      throw new Error('structure-analysis batch has an active analysis job');
    }
    if (
      typeof force !== 'boolean' ||
      (onUpdate && typeof onUpdate !== 'function')
    ) {
      throw new Error('invalid structure-analysis batch options');
    }
    const safeTrackIds = validateTrackIds(trackIds);
    batch = {
      batchId: createBatchId(),
      status: 'running',
      force,
      cancelRequested: false,
      items: safeTrackIds.map((trackId) => ({ trackId, status: 'pending' })),
    };
    updateListener = onUpdate ?? null;
    const initial = emitUpdate();
    Promise.resolve()
      .then(runBatch)
      .catch(() => {
        if (!active()) return;
        for (const item of batch.items) {
          if (!TERMINAL_ITEM_STATUSES.has(item.status)) {
            Object.assign(item, {
              status: 'failed',
              reason: 'analysis-failed',
            });
          }
        }
        batch.status = 'completed';
        emitUpdate();
      });
    return initial;
  }

  async function cancel() {
    if (!active()) return false;
    batch.cancelRequested = true;
    batch.status = 'cancelling';
    emitUpdate();
    if (analysisService.getActiveJob()) {
      await analysisService.cancelActiveJob();
    }
    return true;
  }

  return {
    start,
    cancel,
    getStatus: () => snapshot(batch),
    hasActiveBatch: () => Boolean(active()),
  };
}

module.exports = {
  MAX_BATCH_TRACKS,
  createStructureAnalysisBatchService,
  isCurrentAnalysis,
};
