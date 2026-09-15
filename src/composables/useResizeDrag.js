import { ref } from 'vue';

// Generic pointer-drag-to-resize lifecycle, factored out of
// useSidebarResize.js so a second resize handle (the Studio Library
// Context Inspector) can reuse the same pointer plumbing without inheriting
// the sidebar's specific "resist then snap to icon-only" width math — that
// stays caller-owned via onMove, same split as UiStack/UiSurface (primitive
// owns the mechanism, caller owns the semantics).
//
// Listeners attach to event.currentTarget (the handle itself, captured via
// setPointerCapture) rather than window/document — matches the prior
// sidebar-only implementation this replaces.
export function useResizeDrag({ onMove, onCommit, invert = false }) {
  const isResizing = ref(false);

  function startResize(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const startX = event.clientX;
    isResizing.value = true;
    target.setPointerCapture(event.pointerId);

    function onPointerMove(moveEvent) {
      const rawDelta = moveEvent.clientX - startX;
      onMove(invert ? -rawDelta : rawDelta);
    }

    function onPointerUp() {
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      isResizing.value = false;
      onCommit?.();
    }

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  }

  return { isResizing, startResize };
}
