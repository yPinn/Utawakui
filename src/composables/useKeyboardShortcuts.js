import { nextTick, onUnmounted } from 'vue';
import { useObsIntegration } from './useObsIntegration.js';
import { useAppView } from './useAppView.js';
import { usePlayer } from './usePlayer.js';
import { isEditableTarget } from '../utils/dom.js';
import { isAppDestination } from '../utils/appDestinationRegistry.js';
import { focusAppDestinationTrigger } from '../utils/appDestinationFocus.js';
import { requestHistoryTraversal } from './useNavigationInput.js';
import {
  createKeyboardBindings,
  resolveKeyboardBinding,
} from '../utils/inputBindingRegistry.js';

// Global keyboard dispatcher, instantiated once in App.vue. Bindings live in
// utils/inputBindingRegistry.js (inventory: docs/contracts/input-bindings.md).
// The listener is still removed on unmount: a no-op in prod, but Vite HMR re-runs
// setup on every edit without a real unmount, and each reload would stack another
// 'keydown' listener (two reloads made one arrow press change volume by 30%
// instead of 10%). Alt/Cmd+<key> stay reserved; Ctrl+<key> covers
// transpose/tempo. Pitch (cents) is mouse/panel-only, a fine-adjust control.

const VOLUME_STEP = 0.1;
// Matches PlayerBar.vue's stepper click increment.
const TEMPO_STEP = 0.05;

export function useKeyboardShortcuts({ internalViewShortcuts = {} } = {}) {
  const { isSettingsView, openSettings, setActiveView } = useAppView();
  const {
    state,
    setVolume,
    toggleMute,
    toggleCaptureGuideVocal,
    setTransposeSemitones,
    setTempoRate,
  } = usePlayer();
  const { addMarker: addObsMarker } = useObsIntegration();
  const bindings = createKeyboardBindings({ internalViewShortcuts });

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

  function openView(view) {
    if (view === 'settings') {
      openSettings();
      if (typeof document !== 'undefined') {
        nextTick(() => focusAppDestinationTrigger('settings'));
      }
      return;
    }
    const leavingSettingsForWorkflow =
      isSettingsView.value && isAppDestination(view);
    setActiveView(view);
    if (leavingSettingsForWorkflow && typeof document !== 'undefined') {
      nextTick(() => {
        document
          .querySelector(`[data-app-workflow-trigger="${view}"]`)
          ?.focus?.();
      });
    }
  }

  const actions = {
    'player.transpose-up': () => adjustTranspose(1),
    'player.transpose-down': () => adjustTranspose(-1),
    'player.tempo-up': () => adjustTempo(TEMPO_STEP),
    'player.tempo-down': () => adjustTempo(-TEMPO_STEP),
    'player.mute': toggleMute,
    'player.guide-vocal': toggleCaptureGuideVocal,
    'player.volume-up': () => adjustVolume(VOLUME_STEP),
    'player.volume-down': () => adjustVolume(-VOLUME_STEP),
    // Fire-and-forget from a keydown handler, so a rejection (e.g. the OBS
    // feature gate isn't enabled) must be swallowed here rather than left as an
    // unhandled promise rejection. Wrapped in Promise.resolve() since
    // addObsMarker is always async in production, but test doubles for
    // useObsIntegration() aren't guaranteed to return a thenable.
    'obs.marker': () => Promise.resolve(addObsMarker()).catch(() => {}),
  };

  function handleKeydown(event) {
    const binding = resolveKeyboardBinding(event, bindings);
    if (!binding) return;
    if (binding.skipIfHandled && event.defaultPrevented) return;
    if (binding.editable === 'ignore' && isEditableTarget(event.target)) return;
    if (binding.preventDefault) event.preventDefault();
    if (binding.noRepeat && event.repeat) return;
    if (binding.history) requestHistoryTraversal(binding.history);
    else if (binding.view) openView(binding.view);
    else actions[binding.id]?.();
  }

  window.addEventListener('keydown', handleKeydown);
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
}
