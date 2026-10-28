import {
  computed,
  onMounted,
  onScopeDispose,
  readonly,
  shallowRef,
  watch,
} from 'vue';
import { resolveShellLayout } from '../utils/shellLayout.js';
import { useSidebarWidth } from './useSidebarWidth.js';
import {
  RIGHT_DOCK_WIDTH_MAX,
  useAppRightDockWidth,
} from './useAppRightDockWidth.js';

export function createShellLayoutState({ sidebar, dock, width, dockExpanded }) {
  const geometry = shallowRef({ width });
  const forceSidebarExpanded = shallowRef(false);
  const layout = shallowRef({});
  const resizingDock = dock.isResizing;
  const stop = watch(
    [
      geometry,
      sidebar.width,
      dock.preferredWidth,
      resizingDock,
      dockExpanded,
      forceSidebarExpanded,
    ],
    (
      [metrics, preference, dockPreference, resizing, expanded, forced],
      previous,
    ) => {
      layout.value = resolveShellLayout({
        ...metrics,
        sidebarPreference: preference,
        dockPreference,
        dockExpanded: expanded,
        wasAutoCollapsed:
          previous && preference === previous[1] && layout.value.autoCollapsed,
        holdSidebarCollapsed: resizing && layout.value.autoCollapsed,
        forceSidebarExpanded: forced,
      });
      dock.setMaximum(layout.value.dockMaximum);
    },
    { immediate: true, flush: 'sync' },
  );
  const sidebarExpanded = computed(() => layout.value.sidebarWidth === 256);

  function toggleSidebar() {
    const expand = !sidebarExpanded.value;
    forceSidebarExpanded.value =
      expand &&
      resolveShellLayout({
        ...geometry.value,
        sidebarPreference: 256,
        dockPreference: dock.preferredWidth.value,
        dockExpanded: dockExpanded.value,
      }).autoCollapsed;
    if (sidebar.width.value !== (expand ? 256 : 64))
      return sidebar.toggleSidebarCollapse();
  }

  return {
    layout: readonly(layout),
    sidebarExpanded,
    updateGeometry: (metrics) => {
      if (metrics.width < geometry.value.width)
        forceSidebarExpanded.value = false;
      geometry.value = metrics;
    },
    toggleSidebar,
    dispose: () => {
      stop();
      dock.setMaximum(RIGHT_DOCK_WIDTH_MAX);
    },
  };
}

export function useShellLayout(root, dockExpanded) {
  const state = createShellLayoutState({
    sidebar: useSidebarWidth(),
    dock: useAppRightDockWidth(),
    width: window.innerWidth,
    dockExpanded,
  });
  let observer;
  function measure() {
    const node = root.value;
    if (!node?.clientWidth) return;
    const style = getComputedStyle(node);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const length = (name) => {
      const raw = style.getPropertyValue(name).trim();
      return parseFloat(raw) * (raw.endsWith('rem') ? rem : 1);
    };
    const metrics = {
      width: node.clientWidth,
      minimumWorkspace: length('--ui-shell-workspace-min-inline-size'),
      recovery: length('--ui-shell-layout-recovery-inline-size'),
      overhead:
        2 * length('--ui-shell-edge-inset-inline') +
        length('--ui-shell-workspace-inline-start') +
        length('--ui-space-3'),
    };
    if (Object.values(metrics).every(Number.isFinite))
      state.updateGeometry(metrics);
  }
  onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(root.value);
  });
  watch(
    state.sidebarExpanded,
    (expanded, wasExpanded) => {
      if (expanded || !wasExpanded) return;
      const sidebar = root.value?.querySelector('.app-playlist-sidebar');
      const focused = document.activeElement;
      if (!sidebar?.contains(focused)) return;
      // Move focus before CSS container rules hide or replace descendants.
      // The existing boundary axis stays mounted through both states.
      sidebar.querySelector('[data-sidebar-disclosure]')?.focus();
    },
    { flush: 'sync' },
  );
  onScopeDispose(() => {
    observer?.disconnect();
    state.dispose();
  });
  return state;
}
