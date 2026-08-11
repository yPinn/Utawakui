import { onUnmounted } from 'vue';
import { usePlayer } from './usePlayer.js';
import { isEditableTarget } from '../utils/dom.js';

// Global keyboard shortcuts — instantiated once in App.vue, which lives
// for the app's whole lifetime. The listener is still removed on unmount
// (via onUnmounted) rather than left to leak: in prod App.vue never
// unmounts so this is a no-op, but under `npm run dev` Vite HMR re-runs
// this composable's setup on every edit without a real unmount, and
// without this cleanup each reload stacks another 'keydown' listener —
// e.g. a single arrow-key press bumping volume by 30% instead of 10%
// after two hot reloads.
// Ignored while typing in an editable field, and whenever a modifier key
// is held (reserves Ctrl/Alt/Cmd+<key> combos for future shortcuts).

const VOLUME_STEP = 0.1;

// Matches AppSidebar.vue's nav order left-to-right — F-key position mirrors
// tab position so the mapping stays obvious without a legend.
const VIEW_SHORTCUTS = {
  f1: 'import',
  f2: 'setlist',
  f3: 'lyrics',
  f4: 'appearance',
};

export function useKeyboardShortcuts(activeView) {
  const { state, setVolume, toggleMute, toggleGuideVocal } = usePlayer();

  function adjustVolume(delta) {
    const next = Math.min(1, Math.max(0, state.volume + delta));
    // Snap to the nearest 1% — repeated +0.1/-0.1 floating-point adds
    // would otherwise drift (0.1 + 0.2 !== 0.3 in IEEE 754), eventually
    // showing a percent like "39.999999999999996%" or landing on an odd
    // value that isn't a clean multiple of 10%.
    setVolume(Math.round(next * 100) / 100);
  }

  function handleKeydown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const key = event.key.toLowerCase();
    // F1-F4 tab switching fires even while typing (e.g. the Setlist search
    // box) — F-keys don't insert characters, and this is a global app-level
    // shortcut a performer needs mid-stream regardless of focus. Every
    // other shortcut below stays gated behind isEditableTarget.
    if (key in VIEW_SHORTCUTS) {
      event.preventDefault();
      if (activeView) activeView.value = VIEW_SHORTCUTS[key];
      return;
    }

    if (isEditableTarget(event.target)) return;

    switch (key) {
      case 'm':
        toggleMute();
        break;
      case 'g':
        toggleGuideVocal();
        break;
      case 'arrowup':
        // Otherwise scrolls the active view's scroll container
        // (.shell__main is overflow-y: auto) — not what ↑/↓ should do here.
        event.preventDefault();
        adjustVolume(VOLUME_STEP);
        break;
      case 'arrowdown':
        event.preventDefault();
        adjustVolume(-VOLUME_STEP);
        break;
      default:
        break;
    }
  }

  window.addEventListener('keydown', handleKeydown);
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
}
