import { ref } from 'vue';

// Module-scope singleton, same pattern as useTheme.js — one sidebar width
// applies to the whole shell, not per-component state.

// Keep in sync with --ui-shell-navigation-min-inline-size/-max in
// src/styles/tokens.css and electron/lib/config.js's SIDEBAR_WIDTH_MIN/MAX
// — neither CSS nor the main process can read these from one shared source.
export const SIDEBAR_WIDTH_MIN = 64; // 4rem
export const SIDEBAR_WIDTH_MAX = 256; // 16rem; expanded is a fixed state.
// Keep in sync with --ui-playlist-sidebar-compact-threshold and the
// @container (width < 256px) rules in the Sidebar components.
export const SIDEBAR_COMPACT_THRESHOLD = 256; // 16rem

function normalize(px) {
  return Number.isFinite(px) && px >= SIDEBAR_COMPACT_THRESHOLD
    ? SIDEBAR_WIDTH_MAX
    : SIDEBAR_WIDTH_MIN;
}

// Persisted intent only; responsive projection belongs to useShellLayout.
const width = ref(normalize(window.Utawakui?.initialSidebarWidth));

function setWidth(px) {
  if (Number.isFinite(px)) width.value = normalize(px);
}

// Only a user's disclosure action commits; automatic collapse never does.
async function commitWidth() {
  await window.Utawakui?.setSidebarWidth(width.value);
}

async function toggleSidebarCollapse() {
  setWidth(
    width.value === SIDEBAR_WIDTH_MIN ? SIDEBAR_WIDTH_MAX : SIDEBAR_WIDTH_MIN,
  );
  await commitWidth();
}

export function useSidebarWidth() {
  return { width, setWidth, commitWidth, toggleSidebarCollapse };
}
