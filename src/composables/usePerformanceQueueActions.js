import { useAppRightDock } from './useAppRightDock.js';
import { usePerformanceSessionPlan } from './usePerformanceSessionPlan.js';

// All library entry points append occurrences through the same plan owner.
// Neither the ordinary queue nor the player participates in this intent.
export function usePerformanceQueueActions() {
  const plan = usePerformanceSessionPlan();
  const dock = useAppRightDock();

  async function append(operation, id) {
    if (!id || plan.state.isSaving) return false;
    const result = await operation(id);
    dock.selectArrangementTab('pending');
    dock.showQueueVariant('arrangement');
    return result;
  }

  return {
    state: plan.state,
    addTrack: (trackId) => append(plan.appendLibraryTrack, trackId),
    addCollection: (sourceId) => append(plan.appendFromCollection, sourceId),
    addArchive: (sessionId) => append(plan.appendFromArchive, sessionId),
  };
}
