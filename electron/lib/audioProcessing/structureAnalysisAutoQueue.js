'use strict';

const { isSafeTrackId } = require('../library/paths');
const { isCurrentAnalysis } = require('./structureAnalysisBatchService');

function defaultScheduleTask(task) {
  queueMicrotask(task);
}

function defaultScheduleRetry(task) {
  const timer = setTimeout(task, 500);
  timer.unref?.();
}

function createStructureAnalysisAutoQueue({
  getConfig,
  isFeatureEnabled,
  featureId,
  capabilityService,
  analysisService,
  batchService,
  inspectTrack,
  currentProfileIds,
  onTrackComplete = () => {},
  logger = console,
  scheduleTask = defaultScheduleTask,
  scheduleRetry = defaultScheduleRetry,
}) {
  if (
    typeof getConfig !== 'function' ||
    typeof isFeatureEnabled !== 'function' ||
    typeof featureId !== 'string' ||
    typeof capabilityService?.getStatus !== 'function' ||
    typeof analysisService?.run !== 'function' ||
    typeof analysisService?.getActiveJob !== 'function' ||
    typeof batchService?.hasActiveBatch !== 'function' ||
    typeof inspectTrack !== 'function' ||
    !Array.isArray(currentProfileIds) ||
    currentProfileIds.length === 0 ||
    typeof onTrackComplete !== 'function' ||
    typeof scheduleTask !== 'function' ||
    typeof scheduleRetry !== 'function'
  ) {
    throw new Error('invalid structure-analysis automatic queue dependencies');
  }

  const supportedProfileIds = new Set(currentProfileIds);
  const pending = [];
  const pendingIds = new Set();
  let running = false;
  let drainScheduled = false;
  let retryScheduled = false;

  function enabled() {
    try {
      const config = getConfig();
      const capability = capabilityService.getStatus();
      return (
        config?.autoAnalyzeMusicStructure === true &&
        isFeatureEnabled(config, featureId) &&
        capability?.status === 'ready' &&
        capability?.installed === true
      );
    } catch {
      return false;
    }
  }

  function occupied() {
    return Boolean(
      analysisService.getActiveJob() || batchService.hasActiveBatch(),
    );
  }

  function requestRetry() {
    if (retryScheduled) return;
    retryScheduled = true;
    scheduleRetry(async () => {
      retryScheduled = false;
      await drain();
    });
  }

  function requestDrain() {
    if (drainScheduled || running || pending.length === 0) return;
    drainScheduled = true;
    scheduleTask(async () => {
      drainScheduled = false;
      await drain();
    });
  }

  async function drain() {
    if (running || pending.length === 0) return;
    if (occupied()) {
      requestRetry();
      return;
    }

    const trackId = pending.shift();
    running = true;
    try {
      if (!enabled()) return;
      const existing = await inspectTrack(trackId);
      if (isCurrentAnalysis(existing, supportedProfileIds)) return;
      if (occupied()) {
        pending.unshift(trackId);
        requestRetry();
        return;
      }
      await analysisService.run({ trackId });
      try {
        await onTrackComplete(trackId);
      } catch {
        // A renderer refresh notification cannot invalidate a published sidecar.
      }
    } catch (error) {
      logger.error?.('Automatic music analysis failed', error);
    } finally {
      running = false;
      if (pending[0] !== trackId) pendingIds.delete(trackId);
      requestDrain();
    }
  }

  function enqueue(trackId) {
    if (!isSafeTrackId(trackId) || !enabled()) return false;
    if (!pendingIds.has(trackId)) {
      pendingIds.add(trackId);
      pending.push(trackId);
      requestDrain();
    }
    return true;
  }

  return {
    enqueue,
    getStatus: () => ({ running, pending: pending.length }),
  };
}

module.exports = { createStructureAnalysisAutoQueue };
