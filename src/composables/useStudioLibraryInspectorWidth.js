import { ref } from 'vue';
import { useResizeDrag } from './useResizeDrag.js';

// Module-scope singleton, same pattern as useSidebarWidth.js — one Studio
// Library View mounts at a time, so one inspector width applies to it.
//
// Bounds chosen by scaling Spotify's own left/right panel proportions onto a
// 1280px reference window width (the app's actual typical windowed size —
// see electron/main/windowState.js's default BrowserWindow dimensions, not
// a maximized/FHD assumption, which measured visually too wide alongside
// the sidebar). Its library and now-playing panels converge to the same
// max, so this and the sidebar's own SIDEBAR_WIDTH_MAX (useSidebarWidth.js)
// share that same ceiling. Still provisional pending an owner visual check
// — the --ui-inspector-width candidate token itself is still the fixed
// 20rem F8/F7 baseline; this only governs the draggable range once a drag
// overrides it locally (see StudioLibraryContextInspector.vue).
export const INSPECTOR_WIDTH_MIN = 224; // 14rem
export const INSPECTOR_WIDTH_MAX = 280; // 17.5rem

// Opens at the top of its own draggable range rather than some narrower
// in-between value — the user drags it down from there if they want less.
const width = ref(INSPECTOR_WIDTH_MAX);

function clamp(px) {
  return Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, px));
}

// Captured at drag start, same reasoning as useSidebarResize.js's startWidth.
const startWidth = ref(0);

// This is deliberately local-only, unlike useSidebarWidth.js's IPC-persisted
// width — F7 candidates keep their own interaction state as a local draft
// (e.g. Studio Library's track reorder) rather than reaching into Electron
// main process config, since none of this is production-adopted yet.
const { isResizing, startResize: startDrag } = useResizeDrag({
  // The handle sits on the inspector's left edge (it sits at the right side
  // of the shell) — dragging left should grow the panel, the opposite sign
  // from the sidebar's right-edge handle.
  invert: true,
  onMove: (delta) => {
    width.value = clamp(startWidth.value + delta);
  },
});

function startResize(event) {
  startWidth.value = width.value;
  startDrag(event);
}

export function useStudioLibraryInspectorWidth() {
  return { width, isResizing, startResize };
}
