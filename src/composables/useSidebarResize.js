import { ref } from 'vue';
import { SIDEBAR_WIDTH_MIN, useSidebarWidth } from './useSidebarWidth.js';

// Keep in sync with --ui-playlist-sidebar-compact-threshold in
// src/styles/tokens.css and the @container rules in PlaylistSidebar.vue /
// PlaylistSidebarRow.vue — @container conditions can't reference custom
// properties, so this stays a literal px value here too.
const COMPACT_THRESHOLD = 256; // 16rem — equal to the default sidebar width

// Extra drag distance the width holds at COMPACT_THRESHOLD before letting
// go and snapping to SIDEBAR_WIDTH_MIN — a "stuck, then release" feel
// instead of an instant jump. Same deadzone applies in reverse.
const COMPACT_RESIST_DISTANCE = 80; // 5rem

const { width, setWidth, commitWidth } = useSidebarWidth();

// True only while a drag is in progress — lets AppPlaylistSidebar.vue give
// the handle a distinct "actively dragging" look, not just :hover.
const isResizing = ref(false);

// pointerdown handler for the resize handle. Genuinely new plumbing in this
// app — useDragReorder.js is HTML5 dataTransfer-based (no continuous
// coordinate stream) and isn't reusable for a resize drag; this uses
// pointermove/setPointerCapture instead.
function startResize(event) {
  event.preventDefault();
  const target = event.currentTarget;
  const startX = event.clientX;
  const startWidth = width.value;
  isResizing.value = true;
  target.setPointerCapture(event.pointerId);

  function onMove(moveEvent) {
    const next = startWidth + (moveEvent.clientX - startX);
    if (next >= COMPACT_THRESHOLD) {
      setWidth(next);
    } else if (next >= COMPACT_THRESHOLD - COMPACT_RESIST_DISTANCE) {
      // Resistance zone: hold at the threshold width instead of shrinking.
      setWidth(COMPACT_THRESHOLD);
    } else {
      // Past the resistance zone — collapse straight to icon-only rather
      // than a gradual squeeze.
      setWidth(SIDEBAR_WIDTH_MIN);
    }
  }

  function onUp() {
    target.releasePointerCapture(event.pointerId);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
    isResizing.value = false;
    commitWidth();
  }

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
}

export function useSidebarResize() {
  return { isResizing, startResize };
}
