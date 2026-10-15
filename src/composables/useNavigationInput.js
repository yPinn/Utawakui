import { onUnmounted } from 'vue';
import { useNavigationHistory } from './useNavigationHistory.js';
import {
  createPointerBindings,
  resolvePointerBinding,
} from '../utils/inputBindingRegistry.js';
import { hasOpenTransientOverlay } from '../utils/transientOverlay.js';

// History traversal inputs (ADR 0025). Every source — keyboard bindings, the
// mouse side buttons and Windows app commands forwarded by Main — ends in
// requestHistoryTraversal so they share one guard and one dedupe.

// On Windows one physical side-button click or browser key can arrive both as a DOM
// event and as an app command. A human cannot click twice inside this window.
export const HISTORY_INPUT_DEDUP_MS = 60;

let lastRequest = { direction: null, at: -Infinity };

// A transient overlay owns Back-like dismissal through Escape, so traversal waits.
export function requestHistoryTraversal(direction) {
  if (hasOpenTransientOverlay()) return false;

  const now = Date.now();
  if (
    lastRequest.direction === direction &&
    now - lastRequest.at < HISTORY_INPUT_DEDUP_MS
  ) {
    return false;
  }
  lastRequest = { direction, at: now };

  const history = useNavigationHistory();
  return direction === 'back' ? history.back() : history.forward();
}

export function useNavigationInput() {
  if (typeof window === 'undefined') return;
  const pointerBindings = createPointerBindings();

  // The browser would otherwise run its own back／forward handling for these buttons.
  function suppressDefault(event) {
    if (resolvePointerBinding(event, pointerBindings)) event.preventDefault();
  }

  function onMouseUp(event) {
    const binding = resolvePointerBinding(event, pointerBindings);
    if (!binding) return;
    event.preventDefault();
    requestHistoryTraversal(binding.history);
  }

  window.addEventListener('mousedown', suppressDefault);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('auxclick', suppressDefault);
  const unsubscribeCommand =
    window.Utawakui?.onHistoryCommand?.(requestHistoryTraversal) ?? null;

  function dispose() {
    window.removeEventListener('mousedown', suppressDefault);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('auxclick', suppressDefault);
    unsubscribeCommand?.();
  }

  onUnmounted(dispose);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
