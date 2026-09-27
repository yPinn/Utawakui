import { computed } from 'vue';
import {
  RIGHT_DOCK_SURFACE_METADATA,
  useAppRightDock,
} from './useAppRightDock.js';

export function useStudioLibraryInspector() {
  const dock = useAppRightDock();
  const isInspectorOpen = computed(
    () =>
      dock.isExpanded.value &&
      dock.surfaces[RIGHT_DOCK_SURFACE_METADATA] === true,
  );

  function setInspectorOpen(open) {
    if (open) {
      dock.showSurface(RIGHT_DOCK_SURFACE_METADATA);
    } else {
      dock.hideSurface(RIGHT_DOCK_SURFACE_METADATA);
    }
  }

  function toggleInspector() {
    dock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);
  }

  return {
    isInspectorOpen,
    setInspectorOpen,
    toggleInspector,
  };
}
