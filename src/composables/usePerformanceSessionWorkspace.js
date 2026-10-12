import { readonly, shallowRef, watch } from 'vue';
import { useAppView } from './useAppView.js';

// Shell-level UI coordinator for the full preparation workspace. The draft
// itself remains owned by usePerformanceSessionPlan; this only remembers where
// the operator came from so the single global entry can open from any section.
const isOpen = shallowRef(false);
const returnView = shallowRef(null);
let contextRootEntryRevision = null;
const appView = useAppView();

function clearReturnContext() {
  isOpen.value = false;
  returnView.value = null;
  contextRootEntryRevision = null;
}

watch([appView.activeView, appView.rootEntryRevision], ([view, revision]) => {
  if (!isOpen.value || view === 'settings') return;
  if (view !== 'performance' || revision !== contextRootEntryRevision) {
    clearReturnContext();
  }
});

function open() {
  if (appView.activeView.value !== 'performance') {
    returnView.value =
      appView.activeView.value === 'settings'
        ? appView.returnView.value
        : appView.activeView.value;
    contextRootEntryRevision = appView.rootEntryRevision.value;
    isOpen.value = true;
  }
  appView.openPerformancePreparation();
}

function close() {
  const destination = isOpen.value ? returnView.value : 'library';
  clearReturnContext();
  appView.setActiveView(destination || 'library');
}

export function usePerformanceSessionWorkspace() {
  return {
    isOpen: readonly(isOpen),
    open,
    close,
  };
}
