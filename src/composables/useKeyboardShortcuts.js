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

export function useKeyboardShortcuts() {
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
    if (isEditableTarget(event.target)) return;

    switch (event.key.toLowerCase()) {
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
