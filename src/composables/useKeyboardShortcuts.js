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
// Ignored while typing in an editable field. Alt/Cmd+<key> are still
// reserved for future shortcuts; Ctrl+<key> now covers transpose/tempo
// below. Pitch (cents) is mouse/panel-only — a fine-adjust control, not
// core enough to claim more modifier space.

const VOLUME_STEP = 0.1;
// Matches PlayerBar.vue's stepper click increment.
const TEMPO_STEP = 0.05;

// F1-F5 match AppTopTabs.vue's left-to-right order — F-key position mirrors
// tab position so the mapping stays obvious without a legend.
const VIEW_SHORTCUTS = {
  f1: 'setlist',
  f2: 'lyrics',
  f3: 'output',
  f4: 'import',
  f5: 'settings',
};

// Internal workbenches have no visible tabs and must remain unavailable in
// production. App.vue passes the same Vite development flag used to exclude
// their view modules from production builds.
const INTERNAL_VIEW_SHORTCUTS = {
  f9: 'demo',
  f10: 'music-analysis',
};

export function useKeyboardShortcuts(
  activeView,
  { internalWorkbenchesEnabled = import.meta.env.DEV } = {},
) {
  const {
    state,
    setVolume,
    toggleMute,
    toggleCaptureGuideVocal,
    setTransposeSemitones,
    setTempoRate,
  } = usePlayer();

  function adjustVolume(delta) {
    const next = Math.min(1, Math.max(0, state.volume + delta));
    // Snap to the nearest 1% — repeated +0.1/-0.1 floating-point adds
    // would otherwise drift (0.1 + 0.2 !== 0.3 in IEEE 754), eventually
    // showing a percent like "39.999999999999996%" or landing on an odd
    // value that isn't a clean multiple of 10%.
    setVolume(Math.round(next * 100) / 100);
  }

  function adjustTranspose(delta) {
    setTransposeSemitones(state.transposeSemitones + delta);
  }

  function adjustTempo(delta) {
    // Same float-drift snapping as adjustVolume, at tempo's 0.05 step.
    setTempoRate(Math.round((state.tempoRate + delta) * 20) / 20);
  }

  function handleKeydown(event) {
    const key = event.key.toLowerCase();

    // Ctrl+↑/↓ = transpose, Ctrl+Shift+↑/↓ = tempo. Handled before the
    // Alt/Meta guard below since Ctrl is no longer purely reserved.
    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      if (isEditableTarget(event.target)) return;
      if (key === 'arrowup' || key === 'arrowdown') {
        event.preventDefault();
        const direction = key === 'arrowup' ? 1 : -1;
        if (event.shiftKey) {
          adjustTempo(direction * TEMPO_STEP);
        } else {
          adjustTranspose(direction);
        }
      }
      return;
    }

    if (event.altKey || event.metaKey) return;

    // F1-F5 tab switching fires even while typing (e.g. the Setlist search
    // box) — F-keys don't insert characters, and this is a global app-level
    // shortcut a performer needs mid-stream regardless of focus. Every
    // other shortcut below stays gated behind isEditableTarget.
    const shortcutView =
      VIEW_SHORTCUTS[key] ??
      (internalWorkbenchesEnabled ? INTERNAL_VIEW_SHORTCUTS[key] : undefined);
    if (shortcutView) {
      event.preventDefault();
      if (activeView) activeView.value = shortcutView;
      return;
    }

    if (isEditableTarget(event.target)) return;

    switch (key) {
      case 'm':
        toggleMute();
        break;
      case 'g':
        toggleCaptureGuideVocal();
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
