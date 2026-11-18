'use strict';

const { isSafeTrackId } = require('../library/paths');

// Opt-in accompaniment after import: adds each track to the visible queue.
function createSeparationAutoQueue({
  getConfig,
  isFeatureEnabled,
  featureId,
  getSeparation,
}) {
  if (
    typeof getConfig !== 'function' ||
    typeof isFeatureEnabled !== 'function' ||
    typeof featureId !== 'string' ||
    typeof getSeparation !== 'function'
  ) {
    throw new Error('invalid automatic separation queue dependencies');
  }

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

  function enqueue(trackId) {
    if (!isSafeTrackId(trackId) || !settingOn()) return false;
    const api = separation();
    if (!api) return false;
    api.enqueue({ trackIds: [trackId] });
    return true;
  }

  // Called after OBS or the setting changes so held items can start.
  function refresh() {
    try {
      separation()?.wake();
    } catch {
      /* The queue rechecks on its next change. */
    }
  }

  return { enqueue, refresh };
}

module.exports = { createSeparationAutoQueue };
