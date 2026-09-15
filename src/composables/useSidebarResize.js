import { ref } from 'vue';
import { useResizeDrag } from './useResizeDrag.js';
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

// Captured at drag start so onMove's delta (relative to the drag's own
// origin) can be added back onto the width the drag began from.
const startWidth = ref(0);

const { isResizing, startResize: startDrag } = useResizeDrag({
  onMove: (delta) => {
    const next = startWidth.value + delta;
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
  },
  onCommit: commitWidth,
});

function startResize(event) {
  startWidth.value = width.value;
  startDrag(event);
}

export function useSidebarResize() {
  return { isResizing, startResize };
}
