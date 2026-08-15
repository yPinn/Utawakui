import { ref } from 'vue';

// Module-scope singleton, same pattern as useTheme.js — one sidebar width
// applies to the whole shell, not per-component state.

// Keep in sync with --ui-playlist-sidebar-width-min/-max in
// src/styles/tokens.css and electron/lib/config.js's SIDEBAR_WIDTH_MIN/MAX
// — neither CSS nor the main process can read these from one shared source.
export const SIDEBAR_WIDTH_MIN = 72; // 4.5rem
export const SIDEBAR_WIDTH_MAX = 392; // 24.5rem

const width = ref(window.Utawakui?.initialSidebarWidth ?? 256);

function clamp(px) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, px));
}

// Live update during a drag — no IPC call. useSidebarResize.js calls this
// on every pointermove; a round-trip per pixel would be wasteful and
// unnecessary since only the final width needs to persist.
function setWidth(px) {
  width.value = clamp(px);
}

// Persists the current width — called once when a resize drag ends, not
// debounced, since it's already only invoked at that one point.
async function commitWidth() {
  await window.Utawakui?.setSidebarWidth(width.value);
}

export function useSidebarWidth() {
  return { width, setWidth, commitWidth };
}
