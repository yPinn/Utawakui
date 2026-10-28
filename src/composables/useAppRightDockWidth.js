import { computed, ref, readonly } from 'vue';
import { useResizeDrag } from './useResizeDrag.js';
import {
  DOCK_DEFAULT_WIDTH,
  DOCK_MIN_WIDTH,
  DOCK_MAX_WIDTH,
} from '../utils/shellLayout.js';

// Shared by the shell-level Dock and every content layer hosted inside it.
// The minimum fits both full Bar tabs and the shared action group on one
// line, including standard-density controls, padding and group gaps.
export const RIGHT_DOCK_WIDTH_MIN = DOCK_MIN_WIDTH;
export const RIGHT_DOCK_WIDTH_DEFAULT = DOCK_DEFAULT_WIDTH;
export const RIGHT_DOCK_WIDTH_MAX = DOCK_MAX_WIDTH;
export const RIGHT_DOCK_WIDTH_KEYBOARD_STEP = 8; // 0.5rem at the app baseline

const preferredWidth = ref(RIGHT_DOCK_WIDTH_DEFAULT);
const maximum = ref(RIGHT_DOCK_WIDTH_MAX);
const width = computed(() => Math.min(preferredWidth.value, maximum.value));
const startWidth = ref(0);
let startPreference = RIGHT_DOCK_WIDTH_DEFAULT;

function clamp(px) {
  return Math.min(RIGHT_DOCK_WIDTH_MAX, Math.max(RIGHT_DOCK_WIDTH_MIN, px));
}

const { isResizing, startResize: startDrag } = useResizeDrag({
  // The Dock is anchored to the shell's right edge, so dragging its inner
  // (left) axis toward the left increases its width.
  invert: true,
  onMove: (delta) => {
    preferredWidth.value = Math.min(
      maximum.value,
      clamp(startWidth.value + delta),
    );
  },
  onCancel: () => {
    preferredWidth.value = startPreference;
  },
});

function startResize(event) {
  startWidth.value = width.value;
  startPreference = preferredWidth.value;
  startDrag(event);
}

function setWidth(px) {
  if (!Number.isFinite(px)) return;
  preferredWidth.value = clamp(px);
}

function setMaximum(px) {
  if (Number.isFinite(px))
    maximum.value = Math.max(0, Math.min(RIGHT_DOCK_WIDTH_MAX, px));
}

function resizeBy(delta) {
  if (!Number.isFinite(delta)) return;
  setWidth(Math.min(maximum.value, width.value + delta));
}

export function useAppRightDockWidth() {
  return {
    width,
    preferredWidth: readonly(preferredWidth),
    maximum: readonly(maximum),
    isResizing,
    startResize,
    setWidth,
    setMaximum,
    resizeBy,
  };
}
