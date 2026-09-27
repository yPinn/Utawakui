import { ref } from 'vue';
import { useResizeDrag } from './useResizeDrag.js';

// Shared by the shell-level Dock and every content layer hosted inside it.
// The bounds retain the reviewed Studio Library Inspector proportions while
// promoting the geometry to production Queue chrome.
export const RIGHT_DOCK_WIDTH_MIN = 224; // 14rem
export const RIGHT_DOCK_WIDTH_MAX = 280; // 17.5rem
export const RIGHT_DOCK_WIDTH_KEYBOARD_STEP = 8; // 0.5rem at the app baseline

const width = ref(RIGHT_DOCK_WIDTH_MAX);
const startWidth = ref(0);

function clamp(px) {
  return Math.min(RIGHT_DOCK_WIDTH_MAX, Math.max(RIGHT_DOCK_WIDTH_MIN, px));
}

const { isResizing, startResize: startDrag } = useResizeDrag({
  // The Dock is anchored to the shell's right edge, so dragging its inner
  // (left) axis toward the left increases its width.
  invert: true,
  onMove: (delta) => {
    width.value = clamp(startWidth.value + delta);
  },
});

function startResize(event) {
  startWidth.value = width.value;
  startDrag(event);
}

function setWidth(px) {
  if (!Number.isFinite(px)) return;
  width.value = clamp(px);
}

function resizeBy(delta) {
  if (!Number.isFinite(delta)) return;
  setWidth(width.value + delta);
}

export function useAppRightDockWidth() {
  return { width, isResizing, startResize, setWidth, resizeBy };
}
