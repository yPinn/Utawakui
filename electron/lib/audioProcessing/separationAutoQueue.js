'use strict';

const { isSafeTrackId } = require('../library/paths');

const OBS_RETRY_MS = 30_000;

function defaultScheduleTask(task) {
  queueMicrotask(task);
}

function defaultScheduleRetry(task, delayMs) {
  const timer = setTimeout(task, delayMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

// Opt-in accompaniment after import. Hands one track at a time to the shared
// separation queue so each start rechecks the setting, gate, tools and OBS.
function createSeparationAutoQueue({
  getConfig,
  isFeatureEnabled,
  featureId,
  getSeparation,
  isObsLive = () => false,
  logger = console,
  scheduleTask = defaultScheduleTask,
  scheduleRetry = defaultScheduleRetry,
  obsRetryMs = OBS_RETRY_MS,
}) {
  if (
    typeof getConfig !== 'function' ||
    typeof isFeatureEnabled !== 'function' ||
    typeof featureId !== 'string' ||
    typeof getSeparation !== 'function' ||
    typeof isObsLive !== 'function' ||
    typeof scheduleTask !== 'function' ||
    typeof scheduleRetry !== 'function'
  ) {
    throw new Error('invalid automatic separation queue dependencies');
  }

  const pending = [];
  const pendingIds = new Set();
  let activeItemId = null;
  let running = false;
  let drainScheduled = false;
  let cancelRetry = null;

  function separation() {
    try {
      return getSeparation() ?? null;
    } catch {
      return null;
    }
  }

  function settingOn() {
    try {
      const config = getConfig();
      return (
        config?.autoSeparateAfterImport === true &&
        isFeatureEnabled(config, featureId)
      );
    } catch {
      return false;
    }
  }

  function enabled() {
    if (!settingOn()) return false;
    try {
      return separation()?.isReady() === true;
    } catch {
      return false;
    }
  }

  function obsLive() {
    try {
      return isObsLive() === true;
    } catch {
      return false;
    }
  }

  function clearPending() {
    pending.length = 0;
    pendingIds.clear();
  }

  function stopRetry() {
    cancelRetry?.();
    cancelRetry = null;
  }

  function requestDrain() {
    if (drainScheduled || running || pending.length === 0) return;
    drainScheduled = true;
    scheduleTask(async () => {
      drainScheduled = false;
      await drain();
    });
  }

  function waitForObs() {
    if (cancelRetry) return;
    cancelRetry =
      scheduleRetry(() => {
        cancelRetry = null;
        requestDrain();
      }, obsRetryMs) ?? null;
  }

  async function drain() {
    if (running || pending.length === 0) return;
    if (!enabled()) {
      clearPending();
      return;
    }
    if (obsLive()) {
      waitForObs();
      return;
    }

    const trackId = pending.shift();
    pendingIds.delete(trackId);
    running = true;
    try {
      const api = separation();
      const queued = api.enqueue({ trackIds: [trackId], regenerate: false });
      activeItemId = queued?.itemIds?.[0] ?? null;
      if (activeItemId) await api.waitForItem(activeItemId);
    } catch (error) {
      // Cancellation and per-track failures stay visible in the queue itself.
      logger.warn?.('Automatic separation did not complete', error?.message);
    } finally {
      activeItemId = null;
      running = false;
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

  // Called after the setting, gate or OBS state changes.
  function refresh() {
    if (!settingOn()) {
      clearPending();
      stopRetry();
      if (activeItemId) {
        try {
          // Only a not-yet-started item can be withdrawn; a running job
          // finishes like any manual job.
          separation()?.remove(activeItemId);
        } catch {
          /* The queue already settled this item. */
        }
      }
      return;
    }
    if (!obsLive()) {
      stopRetry();
      requestDrain();
    }
  }

  return {
    enqueue,
    refresh,
    getStatus: () => ({
      running,
      pending: pending.length,
      waitingForObs: cancelRetry !== null,
    }),
  };
}

module.exports = { createSeparationAutoQueue, OBS_RETRY_MS };
