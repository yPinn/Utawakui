// WAI-ARIA APG radio-group pattern: one tab stop; arrow keys move focus
// and selection together. Uses DOM queries so callers can render each
// `role="radio"` however they want, as long as it has `data-radio-id`.
const RADIO_SELECTOR = '[role="radio"]:not(:disabled)';
const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
const PREV_KEYS = new Set(['ArrowUp', 'ArrowLeft']);

export function useRovingRadioGroup(containerRef, onSelect) {
  function radios() {
    return containerRef.value
      ? [...containerRef.value.querySelectorAll(RADIO_SELECTOR)]
      : [];
  }

  function tabindexFor(id, selectedId) {
    return id === selectedId ? 0 : -1;
  }

  function handleKeydown(event) {
    const isNext = NEXT_KEYS.has(event.key);
    const isPrev = PREV_KEYS.has(event.key);
    if (!isNext && !isPrev) return;

    const items = radios();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const delta = isNext ? 1 : -1;
    const nextIndex = (baseIndex + delta + items.length) % items.length;
    const nextItem = items[nextIndex];

    // Otherwise this bubbles to the window-level volume shortcut
    // (ArrowUp/ArrowDown) in useKeyboardShortcuts.js.
    event.preventDefault();
    event.stopPropagation();

    nextItem.focus();
    onSelect(nextItem.dataset.radioId);
  }

  return { tabindexFor, handleKeydown };
}
