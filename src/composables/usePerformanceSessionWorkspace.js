import { readonly, shallowRef } from 'vue';
import { useAppView } from './useAppView.js';

// Shell-level UI coordinator for the full preparation workspace. The draft
// itself remains owned by usePerformanceSessionPlan; this only remembers where
// the operator came from so the single global entry can open from any section.
const isOpen = shallowRef(false);
const returnView = shallowRef(null);

function open() {
  const appView = useAppView();
  if (!isOpen.value) returnView.value = appView.activeView.value;
  isOpen.value = true;
  appView.openPerformancePreparation();
}

function close() {
  if (!isOpen.value) return;

  const destination = returnView.value || 'setlist';
  isOpen.value = false;
  returnView.value = null;
  useAppView().setActiveView(destination);
}

export function usePerformanceSessionWorkspace() {
  return {
    isOpen: readonly(isOpen),
    open,
    close,
  };
}
