import { shallowRef } from 'vue';

// Match the platform's usual drag tolerance: movement inside this range is
// still a click/double-click, not a resize. The drag begins only after the
// pointer moves beyond the boundary, so a resize axis can safely own both
// drag and dblclick without flashing its active state or persisting the same
// width twice before the dblclick action runs.
const RESIZE_DRAG_ACTIVATION_DISTANCE = 4;

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
  const isResizing = shallowRef(false);

  function startResize(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const startX = event.clientX;
    let activated = false;
    target.setPointerCapture(event.pointerId);

    function onPointerMove(moveEvent) {
      const rawDelta = moveEvent.clientX - startX;
      if (!activated) {
        if (Math.abs(rawDelta) <= RESIZE_DRAG_ACTIVATION_DISTANCE) return;
        activated = true;
        isResizing.value = true;
      }
      onMove(invert ? -rawDelta : rawDelta);
    }

    function finishResize({ commit }) {
      if (
        typeof target.hasPointerCapture !== 'function' ||
        target.hasPointerCapture(event.pointerId)
      ) {
        target.releasePointerCapture(event.pointerId);
      }
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
      isResizing.value = false;
      if (activated && commit) onCommit?.();
    }

    function onPointerUp() {
      finishResize({ commit: true });
    }

    function onPointerCancel() {
      finishResize({ commit: false });
    }

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerCancel);
  }

  return { isResizing, startResize };
}
