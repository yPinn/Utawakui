// WAI-ARIA APG "Radio Group" keyboard pattern: exactly one radio in the
// group is a tab stop (roving tabindex), and arrow keys move focus *and*
// selection together — Tab should move out of the group entirely, not
// step through each radio.
//
// DOM-query based rather than a template-ref array, so it works with
// whatever renders each `role="radio"` (component or plain element) —
// the caller only needs to give it a container ref and an onSelect
// callback, nothing about how items are rendered. Each radio element must
// carry `data-radio-id` (its selection id) for onSelect to read.
//
// Browser-bound (document.activeElement/focus/querySelectorAll) like
// usePlayer.js and friends — not testable under this repo's plain-Node
// Vitest environment (see CLAUDE.md).
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
