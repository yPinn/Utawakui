import { ref } from 'vue';
import { useResizeDrag } from './useResizeDrag.js';
import {
  SIDEBAR_COMPACT_THRESHOLD,
  SIDEBAR_WIDTH_MIN,
  useSidebarWidth,
} from './useSidebarWidth.js';

// Extra drag distance the width holds at COMPACT_THRESHOLD before letting
// go and snapping to SIDEBAR_WIDTH_MIN — a "stuck, then release" feel
// instead of an instant jump. Same deadzone applies in reverse.
const COMPACT_RESIST_DISTANCE = 80; // 5rem

const { width, setWidth, commitWidth } = useSidebarWidth();
const lastExpandedWidth = ref(
  width.value > SIDEBAR_WIDTH_MIN ? width.value : SIDEBAR_COMPACT_THRESHOLD,
);

// Captured at drag start so onMove's delta (relative to the drag's own
// origin) can be added back onto the width the drag began from.
const startWidth = ref(0);

const { isResizing, startResize: startDrag } = useResizeDrag({
  onMove: (delta) => {
    const next = startWidth.value + delta;
    if (next >= SIDEBAR_COMPACT_THRESHOLD) {
      setWidth(next);
      lastExpandedWidth.value = width.value;
    } else if (next >= SIDEBAR_COMPACT_THRESHOLD - COMPACT_RESIST_DISTANCE) {
      // Resistance zone: hold at the threshold width instead of shrinking.
      setWidth(SIDEBAR_COMPACT_THRESHOLD);
      lastExpandedWidth.value = width.value;
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

async function toggleSidebarCollapse() {
  if (width.value <= SIDEBAR_WIDTH_MIN) {
    setWidth(lastExpandedWidth.value);
  } else {
    lastExpandedWidth.value = width.value;
    setWidth(SIDEBAR_WIDTH_MIN);
  }
  await commitWidth();
}

async function resizeTo(nextWidth) {
  if (!Number.isFinite(nextWidth)) return;

  setWidth(
    nextWidth > SIDEBAR_WIDTH_MIN && nextWidth < SIDEBAR_COMPACT_THRESHOLD
      ? SIDEBAR_WIDTH_MIN
      : nextWidth,
  );
  if (width.value > SIDEBAR_WIDTH_MIN) {
    lastExpandedWidth.value = width.value;
  }
  await commitWidth();
}

async function resizeBy(delta) {
  if (!Number.isFinite(delta)) return;

  if (width.value <= SIDEBAR_WIDTH_MIN && delta > 0) {
    await resizeTo(SIDEBAR_COMPACT_THRESHOLD);
    return;
  }
  await resizeTo(width.value + delta);
}

export function useSidebarResize() {
  return {
    isResizing,
    startResize,
    resizeBy,
    resizeTo,
    toggleSidebarCollapse,
  };
}
