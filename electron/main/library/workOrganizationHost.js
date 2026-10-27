'use strict';

const { createWorkOrganizationRuntime } = require('../../lib/works/runtime');
const { loadWorks } = require('../../lib/works/organization');
const { bindingsEqual } = require('../../lib/works/trackBinding');
const { removeTrackFromAllPlaylists } = require('../../lib/playlists');
const {
  createPerformanceSessionPlanStore,
} = require('../../lib/performanceSessionPlan');
const { createBgmStandbyPlanStore } = require('../../lib/bgmStandbyPlan');

// Main's named reference boundaries keep the pure runtime independent of window,
// playlist, session and BGM lifecycle ownership.
function createWorkOrganizationHost({
  getDirectory,
  notifyChanged = () => undefined,
  notifyLibraryUpdated = () => undefined,
  recordDiagnostic,
  onTrackDeleting,
  removePlaylistTrack = removeTrackFromAllPlaylists,
  unlinkSessionTrack = (dir, trackId) =>
    createPerformanceSessionPlanStore({ directory: dir }).unlinkTrack(trackId),
  removeBgmTrack = (dir, trackId) =>
    createBgmStandbyPlanStore({ directory: dir }).removeTrackReference(trackId),
}) {
  const runtime = createWorkOrganizationRuntime({
    getDirectory,
    onTrackDeleting,
    cleanupReferences,
    notifyChanged,
  });

  async function cleanupReferences(trackId, originalBinding, context) {
    const current = await runtime.inspectBinding(trackId, context);
    if (
      current.status === 'present' &&
      !bindingsEqual(current.binding, originalBinding)
    )
      return;
    // Unavailable is never absence: inspectBinding throws before any cleanup.
    removePlaylistTrack(context.dir, trackId);
    unlinkSessionTrack(context.dir, trackId);
    removeBgmTrack(context.dir, trackId);
  }

  async function recover() {
    try {
      const context = getDirectory();
      const before = loadWorks(context.dir);
      if (Object.keys(before.pendingTrackDeletions).length === 0) return false;
      await runtime.reconcile();
      notifyLibraryUpdated({ allowProviderBackfill: false });
      return true;
    } catch (error) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'error',
          source: 'work-organization',
          operation: 'recover',
          code: 'WORK_ORGANIZATION_RECOVERY_FAILED',
          message: 'Work reference recovery failed',
          error,
        });
      } catch {
        /* Diagnostics must not prevent library recovery on retry. */
      }
      return false;
    }
  }

  function invalidate() {
    runtime.invalidate();
    try {
      notifyChanged({ libraryEpoch: getDirectory().epoch, revision: 0 });
    } catch {
      // A closing renderer does not roll back an already changed directory.
    }
    void recover();
  }

  return { runtime, recover, invalidate, cleanupReferences };
}

module.exports = { createWorkOrganizationHost };
